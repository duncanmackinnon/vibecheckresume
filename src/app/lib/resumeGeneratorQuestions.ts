import type {
  Analysis,
  ResumeBuilderProfile,
  ResumeGenerationAnswers,
  ResumeGenerationQuestion,
  RoleRequirement,
} from '../types';
import { formatContactDetails } from './resumeBuilderProfile';

const PROFILE_REQUIRED_FIELDS = ['fullName', 'contactDetails', 'targetTitle'] as const;

function clean(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.map(clean).find(Boolean) ?? '';
}

function hasAnyText(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
}

function inferTargetTitle(analysis: Analysis, jobDescription?: string): string {
  const lines = (jobDescription ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => {
    if (line.length > 90) return false;
    return /\b(engineer|developer|designer|analyst|manager|specialist|architect|scientist|consultant|lead|intern)\b/i.test(line);
  });

  return firstNonEmpty(titleLine, analysis.resumeBuilderProfile?.headline);
}

function makeQuestion(question: ResumeGenerationQuestion): ResumeGenerationQuestion {
  return question;
}

function requirementQuestion(requirement: RoleRequirement, index: number): ResumeGenerationQuestion {
  const shortText = requirement.text.length > 72
    ? `${requirement.text.slice(0, 69).trim()}...`
    : requirement.text;

  return makeQuestion({
    id: `roleRequirement_${index}`,
    label: `${requirement.status === 'missing' ? 'Missing' : 'Partial'} requirement`,
    prompt: `Add any real experience, project, tool, metric, or context that proves this requirement: ${shortText}`,
    placeholder: `Example: Used this skill on X project, with Y scope/result...`,
    multiline: true,
  });
}

function createUniqueQuestions(questions: ResumeGenerationQuestion[]): ResumeGenerationQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    const key = question.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getResumeGenerationQuestions(
  analysis: Analysis,
  jobDescription: string = ''
): ResumeGenerationQuestion[] {
  const combinedText = [
    jobDescription,
    ...analysis.missingSkills,
    ...(analysis.recommendations?.improvements ?? []),
    ...(analysis.recommendations?.skillGaps ?? []),
    ...(analysis.priorityActions?.map((action) => `${action.title} ${action.rationale}`) ?? []),
    ...(analysis.roleRequirements?.map((requirement) => `${requirement.text} ${requirement.evidence}`) ?? []),
  ].join(' ');

  const questions: ResumeGenerationQuestion[] = [];

  if (!analysis.resumeBuilderProfile?.fullName) {
    questions.push(makeQuestion({
      id: 'fullName',
      label: 'Full name',
      prompt: 'Your previous resume did not expose a clear name for the resume heading.',
      placeholder: 'Jane Doe',
      required: true,
    }));
  }

  if (!formatContactDetails(analysis.resumeBuilderProfile)) {
    questions.push(makeQuestion({
      id: 'contactDetails',
      label: 'Contact details',
      prompt: 'Your previous resume did not expose clear contact details for the heading.',
      placeholder: 'jane@example.com | 555-123-4567 | linkedin.com/in/jane | github.com/jane',
      required: true,
      multiline: true,
    }));
  }

  if (!inferTargetTitle(analysis, jobDescription)) {
    questions.push(makeQuestion({
      id: 'targetTitle',
      label: 'Target title',
      prompt: 'The job title could not be inferred confidently from the job description.',
      placeholder: 'Frontend Engineer, AI Product Engineer, Data Analyst...',
      required: true,
    }));
  }

  const requirements = (analysis.roleRequirements ?? [])
    .filter((requirement) => requirement.status === 'missing' || requirement.status === 'partial')
    .slice(0, 3);

  requirements.forEach((requirement, index) => {
    questions.push(requirementQuestion(requirement, index));
  });

  const missingSkills = analysis.missingSkills.slice(0, 4);
  if (missingSkills.length > 0) {
    questions.push(makeQuestion({
      id: 'missingSkillEvidence',
      label: 'Missing skill evidence',
      prompt: `Do you have any real experience with these role-relevant gaps: ${missingSkills.join(', ')}?`,
      placeholder: 'Only include skills you can honestly support with work, projects, coursework, or certifications...',
      multiline: true,
    }));
  }

  const impactNeeded = hasAnyText(combinedText, [
    /\bquantif/i,
    /\bmetric/i,
    /\bimpact/i,
    /\boutcome/i,
    /\bscale/i,
    /\brevenue\b/i,
    /\blatency\b/i,
    /\bperformance\b/i,
  ]);

  if (impactNeeded) {
    questions.push(makeQuestion({
      id: 'impactMetrics',
      label: 'Impact metrics',
      prompt: 'The role fit report needs stronger measurable outcomes for resume bullets.',
      placeholder: 'Reduced page load time by 35%; supported 120K monthly users; saved 8 hours/week...',
      multiline: true,
    }));
  }

  const projectEvidenceLow = Boolean(
    analysis.evaluation?.categories.some(
      (category) => category.id === 'projects_and_open_source' && category.score < Math.ceil(category.max * 0.65)
    )
  );
  const projectRelevant = projectEvidenceLow || hasAnyText(combinedText, [
    /\bproject/i,
    /\bportfolio/i,
    /\bgithub\b/i,
    /\bopen.?source/i,
    /\brepository\b/i,
  ]);

  if (projectRelevant && (analysis.resumeBuilderProfile?.projects.length ?? 0) < 2) {
    questions.push(makeQuestion({
      id: 'projectEvidence',
      label: 'Project evidence',
      prompt: 'Add projects, repositories, or shipped work that prove the target role requirements.',
      placeholder: 'Built a Next.js dashboard with PostgreSQL and Stripe; contributed tests to...',
      multiline: true,
    }));
  }

  const credentialRelevant = hasAnyText(combinedText, [
    /\bdegree\b/i,
    /\bcertification\b/i,
    /\bcertificate\b/i,
    /\blicen[cs]e\b/i,
    /\bcredential\b/i,
    /\bcoursework\b/i,
    /\bsecurity clearance\b/i,
  ]);

  if (credentialRelevant && (analysis.resumeBuilderProfile?.awardsCertifications.length ?? 0) === 0) {
    questions.push(makeQuestion({
      id: 'credentials',
      label: 'Credentials',
      prompt: 'The role appears to care about credentials, certifications, degrees, or coursework.',
      placeholder: 'AWS Certified Cloud Practitioner; B.S. Computer Science; security coursework...',
      multiline: true,
    }));
  }

  return createUniqueQuestions(questions).slice(0, 8);
}

export function createInitialResumeGenerationAnswers(
  analysis: Analysis,
  jobDescription: string = ''
): ResumeGenerationAnswers {
  const profile: ResumeBuilderProfile | undefined = analysis.resumeBuilderProfile;
  const answers: ResumeGenerationAnswers = {
    fullName: profile?.fullName ?? '',
    contactDetails: formatContactDetails(profile),
    targetTitle: inferTargetTitle(analysis, jobDescription),
  };

  getResumeGenerationQuestions(analysis, jobDescription).forEach((question) => {
    if (!(question.id in answers)) {
      answers[question.id] = '';
    }
  });

  return answers;
}

export function hasRequiredResumeGenerationAnswers(
  analysis: Analysis,
  answers: ResumeGenerationAnswers,
  jobDescription: string = ''
): boolean {
  return PROFILE_REQUIRED_FIELDS.every((field) => Boolean(clean(answers[field]))) &&
    getResumeGenerationQuestions(analysis, jobDescription)
      .filter((question) => question.required)
      .every((question) => Boolean(clean(answers[question.id])));
}
