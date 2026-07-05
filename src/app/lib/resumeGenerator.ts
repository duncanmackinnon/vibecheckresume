import type {
  Analysis,
  GeneratedResume,
  ResumeGenerationAnswers,
} from '../types';
import { getResumeGenerationQuestions } from './resumeGeneratorQuestions';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface ResumeGenerationInput {
  analysis: Analysis;
  jobDescription?: string;
  answers: ResumeGenerationAnswers;
}

let openai: any = null;

async function initializeOpenAI() {
  if (!openai) {
    try {
      const { default: OpenAI } = await import('openai');

      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is not configured');
      }

      openai = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/',
      });
    } catch (error) {
      console.error('Failed to initialize DeepSeek client for resume generation:', error);
      throw new Error('Failed to initialize AI client');
    }
  }

  return openai;
}

function ensureSerializable<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function trimForPrompt(text: string, maxChars = 14000): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}\n\n[Content truncated for model context]`
    : normalized;
}

function readProperty(source: unknown, key: string): unknown {
  return source && typeof source === 'object'
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function toStringList(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item == null) return '';
      return String(item);
    })
    .map((item) => item.replace(/\0/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
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

function stripMarkdownFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:latex|tex)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

// LaTeX structure is based on the user-provided ATS-friendly resume template.
export const LATEX_RESUME_PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}`;

export const LATEX_RESUME_TEMPLATE = String.raw`${LATEX_RESUME_PREAMBLE}

\begin{document}

\begin{center}
    \textbf{\Huge \scshape FULL NAME} \\ \vspace{1pt}
    \small CONTACT DETAILS
\end{center}

\section{Experience}
  \resumeSubHeadingListStart
    \resumeSubheading
      {TITLE}{DATES}
      {ORGANIZATION}{}
      \resumeItemListStart
        \resumeItem{Impact-focused bullet with action, scope, and result}
      \resumeItemListEnd
  \resumeSubHeadingListEnd

\section{Projects}
  \resumeSubHeadingListStart
    \resumeProjectHeading
      {\textbf{PROJECT NAME} $|$ \emph{Technologies}}{DATES}
      \resumeItemListStart
        \resumeItem{Project bullet with technical evidence and outcome}
      \resumeItemListEnd
  \resumeSubHeadingListEnd

\section{Education}
  \resumeSubHeadingListStart
    \resumeSubheading
      {Credential or Degree}{Dates}
      {Field or issuer}{}
  \resumeSubHeadingListEnd

\section{Technical Skills}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     \textbf{Languages}{: } \\
     \textbf{Frameworks}{: } \\
     \textbf{Developer Tools}{: } \\
     \textbf{Libraries}{: }
    }}
 \end{itemize}

\end{document}`;

function wrapLatexBody(body: string): string {
  return `${LATEX_RESUME_PREAMBLE}\n\n\\begin{document}\n\n${body.trim()}\n\n\\end{document}`;
}

function ensureTemplateDocument(latex: string): string {
  const trimmed = stripMarkdownFence(latex).replace(/\r\n/g, '\n').replace(/\0/g, '').trim();

  if (!trimmed) {
    throw new Error('Generated resume is empty');
  }

  if (/\\documentclass\b/.test(trimmed)) {
    return trimmed;
  }

  if (/\\begin\{document\}/.test(trimmed)) {
    return `${LATEX_RESUME_PREAMBLE}\n\n${trimmed}`;
  }

  return wrapLatexBody(trimmed);
}

function assertSafeLatex(latex: string): void {
  const latexWithoutAllowedInput = latex.replace(/\\input\{glyphtounicode\}/g, '');
  const unsafePattern = /\\(?:write18|openout|read|include|includeonly|newread|newwrite|catcode)\b|\\usepackage\s*(?:\[[^\]]*\])?\s*\{shellesc\}|\\input\s*\{/i;

  if (unsafePattern.test(latexWithoutAllowedInput)) {
    throw new Error('Generated resume contains unsafe LaTeX commands');
  }
}

export function normalizeGeneratedResume(payload: unknown): GeneratedResume {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI response was not a JSON object');
  }

  const rawLatex = readProperty(payload, 'latex') ?? readProperty(payload, 'latexDocument');
  const latexText = typeof rawLatex === 'string' ? rawLatex : '';
  const latex = ensureTemplateDocument(latexText);

  if (!/\\begin\{document\}/.test(latex) || !/\\end\{document\}/.test(latex)) {
    throw new Error('Generated resume must include a LaTeX document body');
  }

  if (latex.length > 70000) {
    throw new Error('Generated resume is too large');
  }

  if (/Jake Ryan|jake@su\.edu/i.test(latex)) {
    throw new Error('Generated resume contains sample template content');
  }

  if (/FULL NAME|CONTACT DETAILS|PROJECT NAME|Impact-focused bullet|ORGANIZATION/i.test(latex)) {
    throw new Error('Generated resume contains unresolved template placeholders');
  }

  assertSafeLatex(latex);

  return {
    latex,
    tailoringNotes: toStringList(readProperty(payload, 'tailoringNotes'), 10),
    assumptions: toStringList(readProperty(payload, 'assumptions'), 8),
    followUpQuestions: toStringList(readProperty(payload, 'followUpQuestions'), 6),
  };
}

function buildEvidenceSnapshot(analysis: Analysis) {
  return {
    score: analysis.score,
    matchedSkills: analysis.matchedSkills,
    missingSkills: analysis.missingSkills,
    recommendations: analysis.recommendations,
    resumeBuilderProfile: analysis.resumeBuilderProfile,
    resumeSections: analysis.resumeSections,
    roleRequirements: analysis.roleRequirements,
    priorityActions: analysis.priorityActions,
    evaluation: analysis.evaluation,
  };
}

function buildResumeGenerationPrompt(input: ResumeGenerationInput): string {
  return `
Generate a tailored ATS-friendly LaTeX resume for the target role.

Use the supplied resume evidence from the previous analysis, extracted resume-builder profile, job description, and user answers. The previous analysis and resumeBuilderProfile are the source of resume facts; the user answers override extracted profile values and fill missing role-relevant details.

Rules:
- Return valid JSON only. Do not include markdown fences or text outside JSON.
- The "latex" value must be a complete LaTeX document using the provided template commands and structure.
- Use ASCII punctuation and escape LaTeX special characters in content: &, %, $, #, _, {, }, ~, ^, and backslash.
- Do not invent employers, job titles, dates, degrees, links, metrics, credentials, or projects.
- If a fact is missing, omit it or list a concise question in followUpQuestions.
- Optimize for one-page resume density: concise heading, 2-4 bullets per role or project, and role-relevant technical skills.
- Rewrite bullets to emphasize action, technical scope, and measurable outcome when evidence supports it.
- Prioritize roleRequirements, priorityActions, matched skills, and missing skills from the prior analysis.
- Use resumeBuilderProfile for heading/contact/profile details when present, unless the user answers override them.
- Do not include demographic, age, gender, nationality, citizenship, marital, disability, race, religion, exact address, salary, photo, or grade/GPA signals unless the user explicitly asks for a job-relevant credential.
- Education can include credential, degree, field, certification, coursework, or issuer when supported by evidence or user answers.
- GitHub, portfolio, and open-source evidence must come only from the provided analysis or user answers. Do not fetch external data.
- Do not include unsafe LaTeX commands such as write18, shellesc, arbitrary input/include, read, openout, or file operations.

JSON schema:
{
  "latex": string,
  "tailoringNotes": string[],
  "assumptions": string[],
  "followUpQuestions": string[]
}

LaTeX template to use:
${LATEX_RESUME_TEMPLATE}

Targeted questions shown to the user:
${JSON.stringify(getResumeGenerationQuestions(input.analysis, input.jobDescription ?? ''), null, 2)}

User answers:
${JSON.stringify(input.answers, null, 2)}

Resume evidence from previous analysis:
${trimForPrompt(JSON.stringify(buildEvidenceSnapshot(input.analysis), null, 2), 22000)}

Job description:
${trimForPrompt(input.jobDescription ?? '', 14000)}
`.trim();
}

function buildRepairPrompt(rawContent: string, parseError: unknown): string {
  return `
The previous response should have been JSON but JSON.parse failed.

Parse error:
${parseError instanceof Error ? parseError.message : String(parseError)}

Return valid JSON only using this schema:
{
  "latex": string,
  "tailoringNotes": string[],
  "assumptions": string[],
  "followUpQuestions": string[]
}

Rules:
- Preserve the generated LaTeX resume content.
- Escape all JSON string backslashes and newlines correctly.
- Do not include markdown fences.
- Do not add text outside the JSON object.

Invalid response to repair:
${rawContent}
`.trim();
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
    temperature: 0.1,
    max_tokens: 8000,
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

    console.warn('DeepSeek JSON mode was rejected for resume generation; retrying without response_format.', {
      status: error?.status,
      message,
    });

    const { response_format: _responseFormat, ...fallbackParams } = params;
    return client.chat.completions.create(fallbackParams);
  }
}

export async function generateTailoredResume(input: ResumeGenerationInput): Promise<GeneratedResume> {
  const client = await initializeOpenAI();
  const prompt = buildResumeGenerationPrompt(input);

  try {
    const content = await requestDeepSeekContent(client, [
      {
        role: 'system',
        content: 'You are an expert resume writer and LaTeX formatter. Return only valid JSON.',
      },
      { role: 'user', content: prompt },
    ]);

    try {
      return ensureSerializable(normalizeGeneratedResume(parseJsonContent(content)));
    } catch (parseError) {
      console.warn('Resume generation response was not valid JSON. Requesting repair.', {
        message: parseError instanceof Error ? parseError.message : String(parseError),
      });

      const repairedContent = await requestDeepSeekContent(client, [
        {
          role: 'system',
          content: 'You repair malformed JSON. Return only valid JSON and preserve the original content.',
        },
        { role: 'user', content: buildRepairPrompt(content, parseError) },
      ]);

      return ensureSerializable(normalizeGeneratedResume(parseJsonContent(repairedContent)));
    }
  } catch (error: any) {
    console.error('DeepSeek resume generation error:', {
      status: error?.status,
      message: error?.message,
    });
    throw new Error('Resume generation failed. Please try again.');
  }
}
