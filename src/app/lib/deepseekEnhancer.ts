import type {
  Analysis,
  AnalysisEvaluation,
  EvaluationCategory,
  PriorityAction,
  PriorityActionEffort,
  PriorityActionImpact,
  ResumeBuilderProfile,
  ResumeSections,
  RoleRequirement,
  RoleRequirementStatus,
} from '../types';
import { normalizeResumeBuilderProfile } from './resumeBuilderProfile';

// Defer OpenAI initialization to runtime
let openai: any = null;

async function initializeOpenAI() {
  if (!openai) {
    try {
      console.log('Initializing OpenAI client...');
      const { default: OpenAI } = await import('openai');
      
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is not configured');
      }

      openai = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/',
      });
      console.log('OpenAI client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
      throw new Error('Failed to initialize AI client');
    }
  }
  return openai;
}

/**
 * Ensures an object is serializable to JSON
 */
function ensureSerializable<T>(obj: T): T {
  // Use JSON parse/stringify to remove any non-serializable content
  return JSON.parse(JSON.stringify(obj));
}

const GENERIC_SKILL_TERMS = new Set([
  'cloud',
  'backend',
  'frontend',
  'soft skills',
  'soft_skills',
  'communication'
]);

const CATEGORY_DEFINITIONS = [
  { id: 'technical_skills', label: 'Technical Skills', max: 35 },
  { id: 'experience_relevance', label: 'Experience Relevance', max: 30 },
  { id: 'projects_and_open_source', label: 'Projects and Open Source', max: 20 },
  { id: 'role_alignment', label: 'Role Alignment', max: 15 },
] as const;

const RESUME_SECTION_KEYS = [
  'basics',
  'work',
  'education',
  'skills',
  'projects',
  'awardsCertifications',
] as const;

const ROLE_REQUIREMENT_STATUSES = new Set<RoleRequirementStatus>(['matched', 'partial', 'missing']);
const PRIORITY_ACTION_IMPACTS = new Set<PriorityActionImpact>(['medium', 'high']);
const PRIORITY_ACTION_EFFORTS = new Set<PriorityActionEffort>(['low', 'medium', 'high']);
const PRIORITY_ACTION_CATEGORY_IDS = new Set([
  ...CATEGORY_DEFINITIONS.map((category) => category.id),
  'format',
]);

const DEFAULT_FAIRNESS_NOTES = [
  'Scoring excludes demographic, location, school-name, and grade-based signals.',
  'Scores are based on job-relevant skills, experience, projects, and role alignment evidence.',
];

const PROTECTED_SIGNAL_PATTERNS = [
  /\b(?:gpa|cgpa|grade|grades)\b/i,
  /\b(?:gender|male|female|woman|women|man|men|nonbinary)\b/i,
  /\b(?:age|race|ethnicity|nationality|citizenship)\b/i,
  /\b(?:city|location|address|postal code|zip code)\b/i,
  /\b(?:college|university|school name|institution name)\b/i,
  /\b(?:candidate'?s name|personal demographic|personal characteristic)\b/i,
];

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function trimForPrompt(text: string, maxChars = 16000): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}\n\n[Content truncated for model context]`
    : normalized;
}

// Rubric structure adapted from the MIT-licensed interviewstreet/hiring-agent project.
function buildPrompt(resumeText: string, jobDescription: string): string {
  return `
Analyze the resume against the job description as a general ATS/job-fit evaluator.

Two-part task:
1. Extract job-relevant resume evidence into sections: basics, work, education, skills, projects, awards/certifications.
2. Score the candidate against the pasted job description using the evidence-backed categories in the JSON schema.
3. Separately extract resume-builder profile fields for prefill. These fields may include name/contact exactly as shown in the resume, but they must not affect score, recommendations, roleRequirements, priorityActions, detailedAnalysis, evaluation evidence, or fairnessNotes.

Rules:
- Return valid JSON only. Do not include markdown fences or explanatory prose outside JSON.
- Escape all quote marks, backslashes, and newline characters inside string values so JSON.parse can parse the response.
- Do not include placeholder, static, local, heuristic, or pre-analysis text.
- Base every field on evidence in the resume and job description.
- Keep recommendations specific and actionable for this candidate and this role.
- Skills must be concrete tools, technologies, providers, methods, credentials, or role-specific capabilities.
- Do not return category names alone as skills, such as "cloud", "backend", "frontend", "soft skills", or "communication".
- Do not score or mention candidate name, gender, race, age, nationality, citizenship, city, location, address, college/university name, school prestige, GPA, CGPA, grades, or personal demographic information.
- resumeBuilderProfile is the only place where name, contact details, links, and general heading information may appear. Do not include exact street addresses, salary, photos, demographic characteristics, GPA, grades, or school prestige there.
- Education may be considered only when the job description explicitly requires a degree, credential, or field of study; never use school name or grades.
- GitHub or open-source evidence must come only from the resume text in this request. Do not invent repository data or fetch external data.
- Each evaluation category must include concise evidence tied to resume/job-description facts.
- Bonus points are optional and must be capped at 10. Deductions are positive numbers representing points subtracted.
- Return resumeSections as short evidence bullets, not raw resume copies.
- Return roleRequirements for the most important requirements in the job description with status matched, partial, or missing.
- Return 3-5 priorityActions that tell the job seeker what to change first. Each action must be specific, evidence-backed, and feasible.

JSON schema:
{
  "score": number,
  "matchedSkills": [{"name": string, "match": true}],
  "missingSkills": string[],
  "recommendations": {
    "improvements": string[],
    "strengths": string[],
    "skillGaps": string[],
    "format": string[]
  },
  "detailedAnalysis": string,
  "resumeSections": {
    "basics": string[],
    "work": string[],
    "education": string[],
    "skills": string[],
    "projects": string[],
    "awardsCertifications": string[]
  },
  "resumeBuilderProfile": {
    "fullName": string,
    "email": string,
    "phone": string,
    "location": string,
    "links": string[],
    "headline": string,
    "summary": string,
    "workHighlights": string[],
    "education": string[],
    "skills": string[],
    "projects": string[],
    "awardsCertifications": string[]
  },
  "roleRequirements": [
    {"text": string, "status": "matched" | "partial" | "missing", "evidence": string}
  ],
  "priorityActions": [
    {
      "categoryId": "technical_skills" | "experience_relevance" | "projects_and_open_source" | "role_alignment" | "format",
      "title": string,
      "rationale": string,
      "impact": "medium" | "high",
      "effort": "low" | "medium" | "high",
      "exampleRewrite": string
    }
  ],
  "evaluation": {
    "categories": [
      {"id": "technical_skills", "label": "Technical Skills", "score": number, "max": 35, "evidence": string},
      {"id": "experience_relevance", "label": "Experience Relevance", "score": number, "max": 30, "evidence": string},
      {"id": "projects_and_open_source", "label": "Projects and Open Source", "score": number, "max": 20, "evidence": string},
      {"id": "role_alignment", "label": "Role Alignment", "score": number, "max": 15, "evidence": string}
    ],
    "bonus": {"score": number, "max": 10, "evidence": string},
    "deductions": {"score": number, "evidence": string},
    "fairnessNotes": string[]
  }
}

Resume:
${trimForPrompt(resumeText)}

Job description:
${trimForPrompt(jobDescription)}
`.trim();
}

function buildRepairPrompt(rawContent: string, parseError: unknown): string {
  return `
The previous response was intended to be JSON but JSON.parse failed.

Parse error:
${parseError instanceof Error ? parseError.message : String(parseError)}

Return the same analysis as valid JSON only, matching this exact schema:
{
  "score": number,
  "matchedSkills": [{"name": string, "match": true}],
  "missingSkills": string[],
  "recommendations": {
    "improvements": string[],
    "strengths": string[],
    "skillGaps": string[],
    "format": string[]
  },
  "detailedAnalysis": string,
  "resumeSections": {
    "basics": string[],
    "work": string[],
    "education": string[],
    "skills": string[],
    "projects": string[],
    "awardsCertifications": string[]
  },
  "resumeBuilderProfile": {
    "fullName": string,
    "email": string,
    "phone": string,
    "location": string,
    "links": string[],
    "headline": string,
    "summary": string,
    "workHighlights": string[],
    "education": string[],
    "skills": string[],
    "projects": string[],
    "awardsCertifications": string[]
  },
  "roleRequirements": [
    {"text": string, "status": "matched" | "partial" | "missing", "evidence": string}
  ],
  "priorityActions": [
    {
      "categoryId": "technical_skills" | "experience_relevance" | "projects_and_open_source" | "role_alignment" | "format",
      "title": string,
      "rationale": string,
      "impact": "medium" | "high",
      "effort": "low" | "medium" | "high",
      "exampleRewrite": string
    }
  ],
  "evaluation": {
    "categories": [
      {"id": "technical_skills", "label": "Technical Skills", "score": number, "max": 35, "evidence": string},
      {"id": "experience_relevance", "label": "Experience Relevance", "score": number, "max": 30, "evidence": string},
      {"id": "projects_and_open_source", "label": "Projects and Open Source", "score": number, "max": 20, "evidence": string},
      {"id": "role_alignment", "label": "Role Alignment", "score": number, "max": 15, "evidence": string}
    ],
    "bonus": {"score": number, "max": 10, "evidence": string},
    "deductions": {"score": number, "evidence": string},
    "fairnessNotes": string[]
  }
}

Rules:
- Do not add markdown fences.
- Do not add any text outside the JSON object.
- Escape all quote marks, backslashes, and newline characters inside string values.
- Preserve the meaning of the original analysis.
- Preserve the evaluation scorecard and evidence fields.
- Preserve resumeSections, roleRequirements, and priorityActions when present.
- Preserve resumeBuilderProfile when present, but keep it separate from scoring rationale.
- Remove any demographic, location, school-name, or grade-based scoring rationale.

Invalid JSON to repair:
${rawContent}
`.trim();
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('AI response did not contain a JSON object');
    }

    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }
}

function hasProtectedSignal(text: string): boolean {
  return PROTECTED_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeProtectedSignalText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const parts = normalized
    .split(/(?<=[.!?])\s+|[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !hasProtectedSignal(part));

  return parts.join(' ').trim();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item == null) return '';
          return String(item);
        })
        .map((item) => item.trim())
        .map(sanitizeProtectedSignalText)
        .filter(Boolean)
    )
  );
}

function isConcreteSkill(skill: string): boolean {
  return !GENERIC_SKILL_TERMS.has(skill.trim().toLowerCase());
}

function normalizeSkillName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function toMatchedSkills(value: unknown): Array<{ name: string; match: boolean }> {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => {
      if (typeof item === 'string') {
        return { name: normalizeSkillName(item), match: true };
      }

      if (item && typeof item === 'object') {
        const skill = item as { name?: unknown; match?: unknown };
        return {
          name: normalizeSkillName(skill.name),
          match: skill.match === undefined ? true : Boolean(skill.match),
        };
      }

      return { name: '', match: false };
    })
    .filter((skill) => skill.name && isConcreteSkill(skill.name));

  const seen = new Set<string>();
  return normalized.filter((skill) => {
    const key = skill.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readProperty(source: unknown, key: string): unknown {
  return source && typeof source === 'object'
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function normalizeScore(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error('AI response is missing a numeric score');
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeBoundedNumber(value: unknown, min: number, max: number, fieldName: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`AI response is missing a numeric ${fieldName}`);
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeEvidence(value: unknown, fieldName: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const sanitized = sanitizeProtectedSignalText(text);
  if (!sanitized) {
    throw new Error(`AI response ${fieldName} is missing job-relevant evidence`);
  }
  return sanitized;
}

function normalizeEvaluationCategory(raw: unknown, definition: typeof CATEGORY_DEFINITIONS[number]): EvaluationCategory {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`AI response is missing evaluation category ${definition.id}`);
  }

  return {
    id: definition.id,
    label: definition.label,
    score: normalizeBoundedNumber(readProperty(raw, 'score'), 0, definition.max, `${definition.id} score`),
    max: definition.max,
    evidence: normalizeEvidence(readProperty(raw, 'evidence'), `${definition.id} evidence`),
  };
}

function findCategory(categories: unknown[], definition: typeof CATEGORY_DEFINITIONS[number]): unknown {
  return categories.find((category) => {
    const id = String(readProperty(category, 'id') ?? '').trim().toLowerCase();
    const label = String(readProperty(category, 'label') ?? '').trim().toLowerCase();
    return id === definition.id || label === definition.label.toLowerCase();
  });
}

function normalizeBonus(raw: unknown): AnalysisEvaluation['bonus'] {
  if (!raw || typeof raw !== 'object') {
    return { score: 0, max: 10, evidence: 'No bonus points applied.' };
  }

  const score = normalizeBoundedNumber(readProperty(raw, 'score'), 0, 10, 'bonus score');
  return {
    score,
    max: 10,
    evidence: score > 0
      ? normalizeEvidence(readProperty(raw, 'evidence'), 'bonus evidence')
      : sanitizeProtectedSignalText(String(readProperty(raw, 'evidence') ?? 'No bonus points applied.')) || 'No bonus points applied.',
  };
}

function normalizeDeductions(raw: unknown): AnalysisEvaluation['deductions'] {
  if (!raw || typeof raw !== 'object') {
    return { score: 0, evidence: 'No deductions applied.' };
  }

  const score = normalizeBoundedNumber(readProperty(raw, 'score'), 0, 100, 'deduction score');
  return {
    score,
    evidence: score > 0
      ? normalizeEvidence(readProperty(raw, 'evidence'), 'deduction evidence')
      : sanitizeProtectedSignalText(String(readProperty(raw, 'evidence') ?? 'No deductions applied.')) || 'No deductions applied.',
  };
}

function normalizeFairnessNotes(value: unknown): string[] {
  const notes = toStringList(value);
  return Array.from(new Set([...notes, ...DEFAULT_FAIRNESS_NOTES]));
}

function normalizeResumeSections(value: unknown): ResumeSections | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const sections = RESUME_SECTION_KEYS.reduce((acc, key) => {
    acc[key] = toStringList(readProperty(value, key));
    return acc;
  }, {} as ResumeSections);

  const hasContent = RESUME_SECTION_KEYS.some((key) => sections[key].length > 0);
  return hasContent ? sections : undefined;
}

function normalizeRoleRequirementStatus(value: unknown): RoleRequirementStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ROLE_REQUIREMENT_STATUSES.has(normalized as RoleRequirementStatus)
    ? normalized as RoleRequirementStatus
    : 'partial';
}

function normalizeRoleRequirements(value: unknown): RoleRequirement[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const requirements = value
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined;

      const text = sanitizeProtectedSignalText(String(readProperty(item, 'text') ?? ''));
      const evidence = sanitizeProtectedSignalText(String(readProperty(item, 'evidence') ?? ''));
      if (!text || !evidence) return undefined;

      const key = text.toLowerCase();
      if (seen.has(key)) return undefined;
      seen.add(key);

      return {
        text,
        status: normalizeRoleRequirementStatus(readProperty(item, 'status')),
        evidence,
      };
    })
    .filter((item): item is RoleRequirement => Boolean(item))
    .slice(0, 12);

  return requirements.length > 0 ? requirements : undefined;
}

function normalizePriorityActionImpact(value: unknown): PriorityActionImpact {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PRIORITY_ACTION_IMPACTS.has(normalized as PriorityActionImpact)
    ? normalized as PriorityActionImpact
    : 'medium';
}

function normalizePriorityActionEffort(value: unknown): PriorityActionEffort {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PRIORITY_ACTION_EFFORTS.has(normalized as PriorityActionEffort)
    ? normalized as PriorityActionEffort
    : 'medium';
}

function normalizePriorityActionCategory(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PRIORITY_ACTION_CATEGORY_IDS.has(normalized) ? normalized : 'role_alignment';
}

function normalizePriorityActions(value: unknown): PriorityAction[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const actions = value
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined;

      const title = sanitizeProtectedSignalText(String(readProperty(item, 'title') ?? ''));
      const rationale = sanitizeProtectedSignalText(String(readProperty(item, 'rationale') ?? ''));
      if (!title || !rationale) return undefined;

      const key = `${title.toLowerCase()}::${rationale.toLowerCase()}`;
      if (seen.has(key)) return undefined;
      seen.add(key);

      const exampleRewrite = sanitizeProtectedSignalText(String(readProperty(item, 'exampleRewrite') ?? ''));
      const action: PriorityAction = {
        categoryId: normalizePriorityActionCategory(readProperty(item, 'categoryId')),
        title,
        rationale,
        impact: normalizePriorityActionImpact(readProperty(item, 'impact')),
        effort: normalizePriorityActionEffort(readProperty(item, 'effort')),
      };

      if (exampleRewrite) {
        action.exampleRewrite = exampleRewrite;
      }

      return action;
    })
    .filter((item): item is PriorityAction => Boolean(item))
    .slice(0, 5);

  return actions.length > 0 ? actions : undefined;
}

export function normalizeEvaluation(value: unknown): AnalysisEvaluation | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') {
    throw new Error('AI response evaluation must be an object');
  }

  const categoriesValue = readProperty(value, 'categories');
  if (!Array.isArray(categoriesValue)) {
    throw new Error('AI response evaluation.categories must be an array');
  }

  const categories = CATEGORY_DEFINITIONS.map((definition) =>
    normalizeEvaluationCategory(findCategory(categoriesValue, definition), definition)
  );

  return {
    categories,
    bonus: normalizeBonus(readProperty(value, 'bonus')),
    deductions: normalizeDeductions(readProperty(value, 'deductions')),
    fairnessNotes: normalizeFairnessNotes(readProperty(value, 'fairnessNotes')),
  };
}

function scoreFromEvaluation(evaluation: AnalysisEvaluation): number {
  const categoryScore = evaluation.categories.reduce((total, category) => total + category.score, 0);
  return Math.max(
    0,
    Math.min(100, Math.round(categoryScore + evaluation.bonus.score - evaluation.deductions.score))
  );
}

export function normalizeAIAnalysis(payload: unknown): Analysis {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI response was not a JSON object');
  }

  const recommendations = readProperty(payload, 'recommendations');
  const detailedAnalysis = readProperty(payload, 'detailedAnalysis');
  const analysisText = typeof detailedAnalysis === 'string'
    ? sanitizeProtectedSignalText(detailedAnalysis)
    : '';

  if (!analysisText) {
    throw new Error('AI response is missing detailedAnalysis');
  }

  const matchedSkills = toMatchedSkills(readProperty(payload, 'matchedSkills'));
  const missingSkills = toStringList(readProperty(payload, 'missingSkills'))
    .map(normalizeSkillName)
    .filter((skill) => skill && isConcreteSkill(skill));

  const improvements = toStringList(readProperty(recommendations, 'improvements'));
  const strengths = toStringList(readProperty(recommendations, 'strengths'));
  const skillGaps = toStringList(readProperty(recommendations, 'skillGaps'));
  const format = toStringList(readProperty(recommendations, 'format'));
  const evaluation = normalizeEvaluation(readProperty(payload, 'evaluation'));
  const resumeSections = normalizeResumeSections(readProperty(payload, 'resumeSections'));
  const resumeBuilderProfile: ResumeBuilderProfile | undefined = normalizeResumeBuilderProfile(
    readProperty(payload, 'resumeBuilderProfile')
  );
  const roleRequirements = normalizeRoleRequirements(readProperty(payload, 'roleRequirements'));
  const priorityActions = normalizePriorityActions(readProperty(payload, 'priorityActions'));

  const analysis: Analysis = {
    score: evaluation
      ? scoreFromEvaluation(evaluation)
      : normalizeScore(readProperty(payload, 'score') ?? readProperty(payload, 'matchScore')),
    matchedSkills,
    missingSkills,
    recommendations: {
      improvements,
      strengths,
      skillGaps,
      format,
    },
    detailedAnalysis: analysisText,
    isChunked: false,
  };

  if (evaluation) {
    analysis.evaluation = evaluation;
  }
  if (resumeSections) {
    analysis.resumeSections = resumeSections;
  }
  if (resumeBuilderProfile) {
    analysis.resumeBuilderProfile = resumeBuilderProfile;
  }
  if (roleRequirements) {
    analysis.roleRequirements = roleRequirements;
  }
  if (priorityActions) {
    analysis.priorityActions = priorityActions;
  }

  return analysis;
}

async function runAIAnalysis(resumeText: string, jobDescription: string): Promise<Analysis> {
  console.log('Starting AI analysis...');
  const client = await initializeOpenAI();
  const prompt = buildPrompt(resumeText, jobDescription);

  try {
    console.log('Sending request to Deepseek API...');
    const content = await requestDeepSeekContent(client, [
      {
        role: 'system',
        content: 'You are an expert resume analyst. Return only valid JSON matching the requested schema.',
      },
      { role: 'user', content: prompt },
    ]);

    console.log('Received AI response, length:', content.length);

    try {
      return ensureSerializable(normalizeAIAnalysis(parseJsonContent(content)));
    } catch (parseError) {
      console.warn('AI response was not valid JSON. Requesting AI repair.', {
        message: parseError instanceof Error ? parseError.message : String(parseError),
        responsePreview: content.slice(0, 500),
      });

      const repairedContent = await requestDeepSeekContent(client, [
        {
          role: 'system',
          content: 'You repair malformed JSON. Return only valid JSON and preserve the original content.',
        },
        { role: 'user', content: buildRepairPrompt(content, parseError) },
      ]);

      console.log('Received repaired AI response, length:', repairedContent.length);
      return ensureSerializable(normalizeAIAnalysis(parseJsonContent(repairedContent)));
    }
  } catch (apiError: any) {
    console.error('DeepSeek analysis error:', {
      error: apiError,
      status: apiError?.status,
      message: apiError?.message,
      response: apiError?.response,
    });
    throw new Error('AI analysis failed. Please try again.');
  }
}

async function requestDeepSeekContent(client: any, messages: ChatMessage[]): Promise<string> {
  const completion = await createDeepSeekCompletion(client, messages);
  const content = completion?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek returned an empty response');
  }

  return content;
}

async function createDeepSeekCompletion(client: any, messages: ChatMessage[]) {
  const params = {
    messages,
    model: 'deepseek-chat',
    temperature: 0,
    max_tokens: 7000,
    response_format: { type: 'json_object' },
  };

  try {
    return await client.chat.completions.create(params);
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const responseBody = JSON.stringify(error?.response ?? {});
    const appearsResponseFormatRelated =
      error?.status === 400 &&
      /response[_ ]?format|json_object/i.test(`${message} ${responseBody}`);

    if (!appearsResponseFormatRelated) {
      throw error;
    }

    console.warn('DeepSeek JSON mode was rejected; retrying the same AI request without response_format.', {
      status: error?.status,
      message,
    });

    const { response_format: _responseFormat, ...fallbackParams } = params;
    return client.chat.completions.create(fallbackParams);
  }
}

/**
 * Main analysis function. It returns only AI-generated analysis.
 */
export async function analyzeWithAI(resumeText: string, jobDescription: string): Promise<Analysis> {
  try {
    return await runAIAnalysis(resumeText, jobDescription);
  } catch (error) {
    console.error('Analysis failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}
