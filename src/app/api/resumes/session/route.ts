import { z } from 'zod';
import { preserveResumeSections } from '@/app/lib/preserveResume';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { analyzeResume as localAnalyzeResume } from '@/app/lib/localAnalysis';
import { extractResumeBuilderProfileFromText, mergeResumeBuilderProfiles } from '@/app/lib/resumeBuilderProfile';
import { generateTailoredResume, LATEX_RESUME_PREAMBLE } from '@/app/lib/resumeGenerator';
import type { Analysis, GeneratedResume, GeneratedResumePreview, ResumeBuilderProfile, ResumeGenerationAnswers } from '@/app/types';
import { escapeResumeLatex } from '@/lib/onboarding/starter-resume';
import { readUpload } from '@/lib/resume-workspace/storage';
import { llmEnabled } from '@/lib/tracker/config';
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
    action: z.literal('format'),
    resumeText: z.string().trim().min(25, 'Add or upload resume text before formatting.').max(120_000),
    fullName: z.string().trim().max(120).optional(),
    targetTitle: z.string().trim().max(160).optional(),
    contactDetails: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('analyze'),
    resumeText: z.string().trim().min(25, 'Add or upload resume text before analyzing fit.').max(120_000),
    jobDescription: z.string().trim().min(25, 'Add a job description of at least 25 characters.').max(50_000),
  }),
  z.object({
    action: z.literal('generate'),
    resumeText: z.string().trim().min(25).max(120_000).optional(),
    analysis: analysisSchema,
    jobDescription: z.string().max(50_000).default(''),
    answers: answersSchema,
    allowBlankContact: z.boolean().optional(),
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

const REQ_STOPWORDS = new Set([
  'about', 'above', 'across', 'after', 'and', 'are', 'can', 'demonstrated', 'experience',
  'for', 'from', 'have', 'into', 'our', 'plus', 'preferred', 'required', 'role', 'skills',
  'strong', 'team', 'that', 'the', 'their', 'this', 'with', 'work', 'working', 'years', 'you', 'your',
]);

function extractRequirementLines(jobDescription: string): string[] {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headingLine = /^(?:about(?:\s+us|\s+the\s+role)?|responsibilities|requirements|qualifications|what\s+you(?:'ll|\s+will)?\s+do|who\s+you\s+are|nice\s+to\s+have|benefits|compensation)\s*:?$/i;
  const bullets = lines
    .filter((line) => /^[-*•▪◦]\s+|^\d+[.)]\s+/.test(line))
    .map((line) => line.replace(/^[-*•▪◦]\s+|^\d+[.)]\s+/, '').trim())
    .filter((line) => line.length >= 15 && line.length <= 200);
  if (bullets.length >= 2) return bullets.slice(0, 8);
  return lines
    .filter((line) => !headingLine.test(line) && line.length >= 20 && line.length <= 180)
    .slice(1, 9);
}

function requirementTokens(text: string): string[] {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{1,}/g) || [])
        .map((t) => t.replace(/\.+$/, ''))
        .filter((t) => t.length >= 3 && !REQ_STOPWORDS.has(t)),
    ),
  );
}

function buildDeterministicAnalysis(resumeText: string, jobDescription: string): Analysis {
  const base = localAnalyzeResume(resumeText, jobDescription);
  const profile = extractResumeBuilderProfileFromText(resumeText);
  const matchedNames = base.matchedSkills.filter((skill) => skill.match).map((skill) => skill.name);
  const resumeTokenSet = new Set(
    (resumeText.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{1,}/g) || []).map((t) => t.replace(/\.+$/, '')),
  );
  const resumeLower = resumeText.toLowerCase();

  const jdRequirements = extractRequirementLines(jobDescription);
  const roleRequirements = jdRequirements.length >= 2
    ? jdRequirements.map((line) => {
        const tokens = requirementTokens(line);
        const found = tokens.filter((token) => resumeTokenSet.has(token) || resumeLower.includes(token));
        const missing = tokens.filter((token) => !found.includes(token));
        const ratio = tokens.length ? found.length / tokens.length : 0;
        const status: 'matched' | 'partial' | 'missing' = ratio >= 0.45 ? 'matched' : ratio > 0 ? 'partial' : 'missing';
        const evidence = status === 'matched'
          ? `Supported by resume terms: ${found.slice(0, 5).join(', ')}.`
          : status === 'partial'
            ? `Matched ${found.slice(0, 3).join(', ')}; add evidence for ${missing.slice(0, 3).join(', ')}.`
            : `Not yet referenced in your resume (look for: ${missing.slice(0, 4).join(', ') || 'relevant examples'}).`;
        return { text: line, status, evidence };
      })
    : base.matchedSkills.slice(0, 8).map((skill) => ({
        text: `Demonstrated experience with ${skill.name}`,
        status: (skill.match ? 'matched' : 'missing') as 'matched' | 'missing',
        evidence: skill.match ? `Referenced in uploaded/built resume for ${skill.name}.` : `Add verifiable work or project evidence covering ${skill.name}.`,
      }));

  const skillScore = Math.round((base.score / 100) * 35);
  const workCount = profile?.workHighlights.length ?? 0;
  const experienceScore = workCount >= 4 || resumeText.length >= 600 ? 24 : resumeText.length >= 300 ? 18 : 12;
  const projectCount = profile?.projects.length ?? 0;
  const projectsScore = projectCount >= 2 ? 17 : /\bproject|built|shipped|deployed\b/i.test(resumeText) ? 14 : 9;
  const alignmentScore = Math.max(0, Math.min(15, Math.round((base.score / 100) * 15)));

  return {
    ...base,
    resumeBuilderProfile: profile,
    roleRequirements,
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
      bonus: { score: 0, max: 10, evidence: 'Rules-based keyword and section scorecard.' },
      deductions: { score: 0, evidence: 'No unsupported deductions applied.' },
      fairnessNotes: ['Evaluates only supplied resume text against the target job description.'],
    },
  };
}

function splitEvidenceLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•▪◦]+\s*/, ''))
    .filter(Boolean);
}

function dedupeLines(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function renderTemplateLatex(preview: GeneratedResumePreview): string {
  const esc = escapeResumeLatex;
  const headerLines = [
    `    \\textbf{\\Huge \\scshape ${esc(preview.fullName)}}`,
    ...(preview.headline ? [`    \\small ${esc(preview.headline)}`] : []),
    ...(preview.contact.length ? [`    \\small ${preview.contact.map(esc).join(' $|$ ')}`] : []),
  ];

  const sectionBlocks = preview.sections.map((sec) => {
    const heading = sec.title ? `\\section{${esc(sec.title)}}` : '';
    const hasSubheading = sec.items.some((item) => Boolean(item.heading || item.subheading || item.date || item.meta));
    if (!hasSubheading) {
      const items = sec.items.flatMap((item) =>
        item.details.length
          ? [
              '\\resumeItemListStart',
              ...item.details.map((detail) => `    \\resumeItem{${esc(detail)}}`),
              '\\resumeItemListEnd',
            ]
          : [],
      );
      return [heading, ...items].filter(Boolean).join('\n');
    }

    const items = sec.items.flatMap((item) => {
      const subheadingLine = item.heading || item.subheading || item.date || item.meta
        ? [
            '    \\resumeSubheading',
            `      {${esc(item.heading || item.subheading || '')}}{${esc(item.date || '')}}`,
            `      {${esc(item.heading ? (item.subheading || '') : '')}}{${esc(item.meta || '')}}`,
          ]
        : ['    \\item[]'];
      const detailLines = item.details.length
        ? [
            '      \\resumeItemListStart',
            ...item.details.map((detail) => `        \\resumeItem{${esc(detail)}}`),
            '      \\resumeItemListEnd',
          ]
        : [];
      return [...subheadingLine, ...detailLines];
    });

    return [heading, '  \\resumeSubHeadingListStart', ...items, '  \\resumeSubHeadingListEnd']
      .filter(Boolean)
      .join('\n');
  });

  const skillsBlock = preview.skillGroups.length
    ? [
        '\\section{Technical Skills}',
        ' \\begin{itemize}[leftmargin=0.15in, label={}]',
        '    \\small{\\item{',
        ...preview.skillGroups.map(
          (g, idx) =>
            `     \\textbf{${esc(g.label)}}{: ${esc(g.skills.join(', '))}}${idx < preview.skillGroups.length - 1 ? ' \\\\' : ''}`,
        ),
        '    }}',
        ' \\end{itemize}',
      ].join('\n')
    : '';

  return [
    LATEX_RESUME_PREAMBLE,
    '',
    '\\begin{document}',
    '',
    '\\begin{center}',
    headerLines.join(' \\\\ \\vspace{1pt}\n'),
    '\\end{center}',
    '',
    ...(preview.summary ? ['\\section{Summary}', esc(preview.summary), ''] : []),
    ...sectionBlocks,
    ...(skillsBlock ? [skillsBlock] : []),
    '',
    '\\end{document}',
  ].join('\n');
}

function renderResumeLatex(preview: GeneratedResumePreview): string {
  return [
    '\\documentclass[letterpaper,11pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[margin=0.65in]{geometry}',
    '\\usepackage{enumitem}',
    '\\pagestyle{empty}',
    '\\begin{document}',
    `\\begin{center}{\\LARGE\\bfseries ${escapeResumeLatex(preview.fullName)}}\\\\[4pt]`,
    ...(preview.headline ? [`${escapeResumeLatex(preview.headline)}\\\\[4pt]`] : []),
    ...(preview.contact.length ? [`${escapeResumeLatex(preview.contact.join(' | '))}`] : []),
    '\\end{center}',
    ...(preview.summary ? [`\\section*{Summary}${escapeResumeLatex(preview.summary)}`] : []),
    ...preview.sections.flatMap((sec) => [
      ...(sec.title ? [`\\section*{${escapeResumeLatex(sec.title)}}`] : []),
      ...sec.items.flatMap((item) => [
        `\\textbf{${escapeResumeLatex(item.heading)}}${item.date ? ` \\hfill ${escapeResumeLatex(item.date)}` : ''}`,
        ...(item.subheading ? [`${escapeResumeLatex(item.subheading)}\\par`] : []),
        ...(item.meta ? [`${escapeResumeLatex(item.meta)}\\par`] : []),
        ...(item.details.length
          ? ['\\begin{itemize}[leftmargin=*]', ...item.details.map((d) => `\\item ${escapeResumeLatex(d)}`), '\\end{itemize}']
          : []),
      ]),
    ]),
    ...(preview.skillGroups.length
      ? [
          `\\section*{Technical Skills}${preview.skillGroups
            .map((g) => `\\textbf{${escapeResumeLatex(g.label)}:} ${escapeResumeLatex(g.skills.join(', '))}`)
            .join('\\\\\n')}`,
        ]
      : []),
    '\\end{document}',
  ].join('\n');
}

function buildDeterministicFormattedResume(
  resumeText: string,
  fullNameOverride?: string,
  targetTitleOverride?: string,
  contactDetailsOverride?: string,
): { generatedResume: GeneratedResume; profile: ResumeBuilderProfile | undefined } {
  const profile = extractResumeBuilderProfileFromText(resumeText);
  const fullName = profile?.fullName || fullNameOverride?.trim() || 'Candidate';
  const extractedContact = [profile?.email, profile?.phone, profile?.location, ...(profile?.links ?? [])].filter(
    (item): item is string => Boolean(item && item.trim()),
  );
  const contact = contactDetailsOverride?.trim()
    ? contactDetailsOverride
        .split(/[\n|]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : extractedContact;
  const preview: GeneratedResumePreview = {
    fullName,
    headline: targetTitleOverride?.trim() || undefined,
    contact: contactDetailsOverride?.trim() ? contact : [],
    sections: preserveResumeSections(resumeText, fullName),
    skillGroups: [],
  };
  return {
    profile,
    generatedResume: {
      latex: renderResumeLatex(preview),
      preview,
      tailoringNotes: ['Formatted directly from your uploaded resume without inventing roles, dates, or metrics.'],
      assumptions: [],
      followUpQuestions: [],
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
  const matched = analysis.matchedSkills.filter((skill) => skill.match).map((skill) => skill.name);
  const matchedLower = matched.map((skill) => skill.toLowerCase());
  const roleReqLines = Object.entries(answers)
    .filter(([key]) => key.startsWith('roleRequirement_'))
    .flatMap(([, value]) => splitEvidenceLines(value));
  const rawWork = dedupeLines([
    ...(analysis.resumeBuilderProfile?.workHighlights ?? []),
    ...splitEvidenceLines(answers.impactMetrics),
    ...splitEvidenceLines(answers.missingSkillEvidence),
    ...roleReqLines,
  ], 16);
  const workDetails = [
    ...rawWork.filter((line) => matchedLower.some((skill) => line.toLowerCase().includes(skill))),
    ...rawWork.filter((line) => !matchedLower.some((skill) => line.toLowerCase().includes(skill))),
  ].slice(0, 8);
  const projectDetails = dedupeLines([
    ...(analysis.resumeBuilderProfile?.projects ?? []),
    ...splitEvidenceLines(answers.projectEvidence),
  ], 6);
  const educationEntries = dedupeLines(analysis.resumeBuilderProfile?.education ?? [], 6);
  const credentialEntries = dedupeLines([
    ...(analysis.resumeBuilderProfile?.awardsCertifications ?? []),
    ...splitEvidenceLines(answers.credentials),
  ], 6);

  const sections = [
    ...(workDetails.length ? [{ title: 'Experience', items: [{ heading: '', details: workDetails }] }] : []),
    ...(projectDetails.length ? [{ title: 'Projects', items: [{ heading: 'Selected Projects', details: projectDetails }] }] : []),
    ...(educationEntries.length
      ? [{ title: 'Education', items: educationEntries.map((entry) => ({ heading: entry, details: [] })) }]
      : []),
    ...(credentialEntries.length
      ? [{ title: 'Certifications & Credentials', items: credentialEntries.map((entry) => ({ heading: entry, details: [] })) }]
      : []),
  ];

  const matchedSet = new Set(matchedLower);
  const additionalSkills = dedupeLines(
    (analysis.resumeBuilderProfile?.skills ?? []).filter((skill) => !matchedSet.has(skill.toLowerCase())),
    15,
  );
  const skillGroups = [
    ...(matched.length ? [{ label: 'Matched Role Skills', skills: matched }] : []),
    ...(additionalSkills.length ? [{ label: 'Additional Skills', skills: additionalSkills }] : []),
  ];
  const summary = analysis.resumeBuilderProfile?.summary || undefined;

  const preview: GeneratedResumePreview = { fullName, headline, contact, summary, sections, skillGroups };
  const latex = renderTemplateLatex(preview);

  const tailoringNotes = [
    `Prioritized ${matched.length} matched role skill${matched.length === 1 ? '' : 's'} and ${workDetails.length} experience/impact bullet${workDetails.length === 1 ? '' : 's'} without inventing credentials.`,
    ...(projectDetails.length ? [`Included ${projectDetails.length} project highlight${projectDetails.length === 1 ? '' : 's'}.`] : []),
    ...(credentialEntries.length ? [`Included ${credentialEntries.length} credential/certification item${credentialEntries.length === 1 ? '' : 's'}.`] : []),
  ];

  return {
    latex,
    preview,
    tailoringNotes,
    assumptions: [],
    followUpQuestions: analysis.missingSkills.slice(0, 4).map((skill) => `Confirm or add real examples covering ${skill} if you have them.`),
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
        return Response.json({ error: 'Select a PDF, DOCX, RTF, Markdown (.md), LaTeX (.tex), or TXT resume file.' }, { status: 400, headers: NO_STORE });
      }
      const { mimeType, text, parsedResume, profile, suggestedRoles } = await readUpload(uploaded);
      return Response.json(
        { filename: uploaded.name, mimeType, size: uploaded.size, text, parsedResume, profile, suggestedRoles },
        { headers: NO_STORE },
      );
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

  if (parsed.data.action === 'format') {
    const formatted = buildDeterministicFormattedResume(
      parsed.data.resumeText,
      parsed.data.fullName,
      parsed.data.targetTitle,
      parsed.data.contactDetails,
    );
    return Response.json({ ...formatted, mode: 'deterministic' }, { headers: NO_STORE });
  }

  if (parsed.data.action === 'analyze') {
    const { resumeText, jobDescription } = parsed.data;
    if (llmEnabled()) {
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

  const { analysis, jobDescription, answers, allowBlankContact, resumeText } = parsed.data;
  const completed = completeAnswers(analysis as Analysis, jobDescription, answers as ResumeGenerationAnswers);
  const missing = allowBlankContact
    ? completed.missing.filter((q) => q.id !== 'contactDetails')
    : completed.missing;
  if (missing.length) {
    return Response.json(
      {
        error: `Complete required fields: ${missing.map((q) => q.label).join(', ')}.`,
        code: 'MISSING_ANSWERS',
        missing,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  let aiFallback = false;
  if (llmEnabled()) {
    try {
      const generatedResume = await generateTailoredResume({
        sourceText: resumeText,
        analysis: analysis as Analysis,
        jobDescription,
        answers: completed.answers,
      });
      return Response.json({ generatedResume, mode: 'ai' }, { headers: NO_STORE });
    } catch {
      aiFallback = true;
    }
  }

  const enrichedAnalysis: Analysis =
    resumeText && !analysis.resumeBuilderProfile
      ? {
          ...(analysis as Analysis),
          resumeBuilderProfile: extractResumeBuilderProfileFromText(resumeText),
        }
      : (analysis as Analysis);

  const generatedResume = buildDeterministicGeneration(enrichedAnalysis, completed.answers);
  if (aiFallback) {
    generatedResume.tailoringNotes = [
      'AI tailoring was temporarily unavailable; assembled using your profile, fit report, and follow-up answers.',
      ...generatedResume.tailoringNotes,
    ];
  }
  return Response.json({ generatedResume, mode: 'deterministic' }, { headers: NO_STORE });
}
