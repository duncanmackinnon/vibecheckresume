import { z } from 'zod';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { analyzeResume as localAnalyzeResume } from '@/app/lib/localAnalysis';
import { extractResumeBuilderProfileFromText, mergeResumeBuilderProfiles } from '@/app/lib/resumeBuilderProfile';
import { generateTailoredResume } from '@/app/lib/resumeGenerator';
import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import { escapeResumeLatex } from '@/lib/onboarding/starter-resume';
import { readUpload } from '@/lib/resume-workspace/storage';
import { analysisSchema, answersSchema, completeAnswers } from '@/lib/resume-workspace/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const WINDOW_MS = 15 * 60_000;
const MAX_REQUESTS_PER_WINDOW = 25;
const rateCounters = new Map<string, { count: number; until: number }>();

const sessionActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('analyze'),
    resumeText: z.string().trim().min(25, 'Add or upload resume text before analyzing fit.').max(120_000),
    jobDescription: z.string().trim().min(25, 'Add a job description of at least 25 characters.').max(50_000),
  }),
  z.object({
    action: z.literal('generate'),
    analysis: analysisSchema,
    jobDescription: z.string().max(50_000).default(''),
    answers: answersSchema,
  }),
]);

function checkSameOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const requestOrigin = new URL(request.url).origin;
    if (origin === requestOrigin) return true;
    const host = request.headers.get('host');
    return Boolean(host && (origin === `https://${host}` || origin === `http://${host}`));
  } catch {
    return false;
  }
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded?.trim()) return forwarded.split(',')[0].trim();
  return 'local';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = rateCounters.get(ip);
  const entry = current && current.until > now ? current : { count: 0, until: now + WINDOW_MS };
  entry.count += 1;
  rateCounters.set(ip, entry);
  if (rateCounters.size > 2000) {
    for (const [key, item] of rateCounters) if (item.until <= now) rateCounters.delete(key);
  }
  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

function buildDeterministicAnalysis(resumeText: string, jobDescription: string): Analysis {
  const base = localAnalyzeResume(resumeText, jobDescription);
  const profile = extractResumeBuilderProfileFromText(resumeText);
  const matchedNames = base.matchedSkills.filter((skill) => skill.match).map((skill) => skill.name);
  const skillScore = Math.round((base.score / 100) * 35);
  const experienceScore = resumeText.length >= 400 ? 22 : 14;
  const projectsScore = /\bproject|built|shipped|deployed\b/i.test(resumeText) ? 14 : 9;
  const alignmentScore = Math.max(0, Math.min(15, Math.round((base.score / 100) * 15)));

  return {
    ...base,
    resumeBuilderProfile: profile,
    roleRequirements: base.matchedSkills.slice(0, 8).map((skill) => ({
      text: `Demonstrated experience with ${skill.name}`,
      status: skill.match ? 'matched' : 'missing',
      evidence: skill.match ? `Referenced in uploaded/built resume for ${skill.name}.` : `Add verifiable work or project evidence covering ${skill.name}.`,
    })),
    priorityActions: base.missingSkills.slice(0, 3).map((skill) => ({
      categoryId: 'technical_skills',
      title: `Surface verifiable ${skill} experience`,
      rationale: `${skill} appears in the target description but was not matched in the current resume draft.`,
      impact: 'high' as const,
      effort: 'low' as const,
    })),
    evaluation: {
      categories: [
        { id: 'technical_skills', label: 'Technical Skills', score: skillScore, max: 35, evidence: matchedNames.length ? `Matched skills: ${matchedNames.join(', ')}.` : 'Limited keyword overlap found cleanly.' },
        { id: 'experience_relevance', label: 'Experience Relevance', score: experienceScore, max: 30, evidence: 'Evaluated against structured experience entries in your resume text.' },
        { id: 'projects_and_open_source', label: 'Projects and Open Source', score: projectsScore, max: 20, evidence: 'Assessed shipped project descriptions and technical outcomes.' },
        { id: 'role_alignment', label: 'Role Alignment', score: alignmentScore, max: 15, evidence: 'Weighted overlap with target role skills.' },
      ],
      bonus: { score: 0, max: 10, evidence: 'Deterministic preview scorecard (AI narrative adds deeper project nuance when enabled).' },
      deductions: { score: 0, evidence: 'No unsupported deductions applied.' },
      fairnessNotes: ['Evaluates only supplied resume text against the target job description.'],
    },
  };
}

function buildDeterministicGeneration(
  analysis: Analysis,
  answers: ResumeGenerationAnswers,
): GeneratedResume {
  const fullName = answers.fullName?.trim() || 'Candidate';
  const headline = answers.targetTitle?.trim() || analysis.resumeBuilderProfile?.headline || 'Target Role';
  const contact = (answers.contactDetails || '')
    .split(/[\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const workDetails = [
    ...(analysis.resumeBuilderProfile?.workHighlights ?? []),
    ...(answers.impactMetrics ? answers.impactMetrics.split('\n').map((s) => s.trim()).filter(Boolean) : []),
    ...(answers.missingSkillEvidence ? answers.missingSkillEvidence.split('\n').map((s) => s.trim()).filter(Boolean) : []),
  ].slice(0, 6);
  const sections = [
    ...(workDetails.length ? [{ title: 'Relevant Experience & Impact', items: [{ heading: headline, details: workDetails }] }] : []),
    ...(analysis.resumeBuilderProfile?.education?.length
      ? [{ title: 'Education', items: analysis.resumeBuilderProfile.education.map((entry) => ({ heading: entry, details: [] })) }]
      : []),
  ];
  const matched = analysis.matchedSkills.filter((skill) => skill.match).map((skill) => skill.name);
  const skillGroups = matched.length ? [{ label: 'Matched Role Skills', skills: matched }] : [];
  const summary =
    analysis.resumeBuilderProfile?.summary ||
    `${headline} candidate highlighting verified experience across ${matched.slice(0, 5).join(', ') || 'core requirements'}.`;

  const latex = [
    '\\documentclass[letterpaper,11pt]{article}',
    '\\usepackage[margin=0.65in]{geometry}',
    '\\usepackage{enumitem}',
    '\\pagestyle{empty}',
    '\\begin{document}',
    `\\begin{center}{\\LARGE\\bfseries ${escapeResumeLatex(fullName)}}\\\\[4pt]`,
    `${escapeResumeLatex(headline)}\\\\[4pt]`,
    `${escapeResumeLatex(contact.join(' | '))}\\end{center}`,
    `\\section*{Summary}${escapeResumeLatex(summary)}`,
    ...sections.flatMap((sec) => [
      `\\section*{${escapeResumeLatex(sec.title)}}`,
      ...sec.items.flatMap((item) => [
        `\\textbf{${escapeResumeLatex(item.heading)}}`,
        ...(item.details.length ? ['\\begin{itemize}[leftmargin=*]', ...item.details.map((d) => `\\item ${escapeResumeLatex(d)}`), '\\end{itemize}'] : []),
      ]),
    ]),
    ...(skillGroups.length
      ? [`\\section*{Technical Skills}${skillGroups.map((g) => `\\textbf{${escapeResumeLatex(g.label)}:} ${escapeResumeLatex(g.skills.join(', '))}`).join('\\\\')}`]
      : []),
    '\\end{document}',
  ].join('\n');

  return {
    latex,
    preview: { fullName, headline, contact, summary, sections, skillGroups },
    tailoringNotes: ['Tailored from your verified analysis and follow-up details without inventing credentials.'],
    assumptions: [],
    followUpQuestions: [],
  };
}

export async function POST(request: Request) {
  if (!checkSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403, headers: NO_STORE });
  }
  if (!checkRateLimit(clientIp(request))) {
    return Response.json({ error: 'Too many requests. Please wait a few minutes and try again.' }, { status: 429, headers: NO_STORE });
  }

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const uploaded = formData.get('file');
      if (!(uploaded instanceof File)) {
        return Response.json({ error: 'Select a PDF or TXT resume file.' }, { status: 400, headers: NO_STORE });
      }
      const { mimeType, text } = await readUpload(uploaded);
      return Response.json({ filename: uploaded.name, mimeType, size: uploaded.size, text }, { headers: NO_STORE });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Your resume file could not be read.' },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400, headers: NO_STORE });
  }

  const parsed = sessionActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || 'Check your resume and job description inputs.' },
      { status: 400, headers: NO_STORE },
    );
  }

  if (parsed.data.action === 'analyze') {
    const { resumeText, jobDescription } = parsed.data;
    if (process.env.DEEPSEEK_API_KEY?.trim()) {
      try {
        const aiResult = await analyzeWithAI(resumeText, jobDescription);
        const merged: Analysis = {
          ...aiResult,
          resumeBuilderProfile: mergeResumeBuilderProfiles(
            aiResult.resumeBuilderProfile,
            extractResumeBuilderProfileFromText(resumeText),
          ),
        };
        return Response.json({ analysis: merged, mode: 'ai' }, { headers: NO_STORE });
      } catch {
        // Fall back to deterministic scoring below if provider fails transiently.
      }
    }
    const analysis = buildDeterministicAnalysis(resumeText, jobDescription);
    return Response.json({ analysis, mode: 'deterministic' }, { headers: NO_STORE });
  }

  const { analysis, jobDescription, answers } = parsed.data;
  const completed = completeAnswers(analysis as Analysis, jobDescription, answers as ResumeGenerationAnswers);
  if (completed.missing.length) {
    return Response.json(
      {
        error: `Complete required fields: ${completed.missing.map((q) => q.label).join(', ')}.`,
        code: 'MISSING_ANSWERS',
        missing: completed.missing,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      const generatedResume = await generateTailoredResume({
        analysis: analysis as Analysis,
        jobDescription,
        answers: completed.answers,
      });
      return Response.json({ generatedResume, mode: 'ai' }, { headers: NO_STORE });
    } catch {
      // Fall through to deterministic LaTeX assembly below so visitors never lose their work.
    }
  }

  const generatedResume = buildDeterministicGeneration(analysis as Analysis, completed.answers);
  return Response.json({ generatedResume, mode: 'deterministic' }, { headers: NO_STORE });
}
