import { Analysis } from '../types';

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

function buildPrompt(resumeText: string, jobDescription: string): string {
  return `
Analyze the resume against the job description and return only the AI-generated result.

Rules:
- Return valid JSON only. Do not include markdown fences or explanatory prose outside JSON.
- Escape all quote marks, backslashes, and newline characters inside string values so JSON.parse can parse the response.
- Do not include placeholder, static, local, heuristic, or pre-analysis text.
- Base every field on evidence in the resume and job description.
- Keep recommendations specific and actionable for this candidate and this role.
- Skills must be concrete tools, technologies, providers, methods, credentials, or role-specific capabilities.
- Do not return category names alone as skills, such as "cloud", "backend", "frontend", "soft skills", or "communication".

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
  "detailedAnalysis": string
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
  "detailedAnalysis": string
}

Rules:
- Do not add markdown fences.
- Do not add any text outside the JSON object.
- Escape all quote marks, backslashes, and newline characters inside string values.
- Preserve the meaning of the original analysis.

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

function normalizeAIAnalysis(payload: unknown): Analysis {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI response was not a JSON object');
  }

  const recommendations = readProperty(payload, 'recommendations');
  const detailedAnalysis = readProperty(payload, 'detailedAnalysis');
  const analysisText = typeof detailedAnalysis === 'string' ? detailedAnalysis.trim() : '';

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

  return {
    score: normalizeScore(readProperty(payload, 'score') ?? readProperty(payload, 'matchScore')),
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
    max_tokens: 4096,
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
