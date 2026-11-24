import { z } from 'zod';
import type { GeneratedResume, GeneratedResumePreview, GeneratedResumePreviewItem, GeneratedResumePreviewSection } from '@/app/types';

const answer = (max: number) => z.string().max(max).transform(value => value.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim()).default('');
const experienceSchema = z.object({ role: answer(160), organization: answer(160), dates: answer(100), highlights: answer(8000) }).strict();
const educationSchema = z.object({ qualification: answer(200), institution: answer(200), dates: answer(100), details: answer(4000) }).strict();
const projectSchema = z.object({ name: answer(200), url: answer(500), description: answer(8000) }).strict();

export const starterResumeAnswersSchema = z.object({
  fullName: answer(120), headline: answer(160), email: answer(254), phone: answer(80), location: answer(160),
  links: answer(2000), summary: answer(4000), skills: answer(4000),
  experience: z.array(experienceSchema).max(10).default([]),
  education: z.array(educationSchema).max(10).default([]),
  projects: z.array(projectSchema).max(10).default([]),
}).strict().superRefine((value, context) => {
  if (!value.fullName) context.addIssue({ code: 'custom', path: ['fullName'], message: 'Add your name.' });
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) context.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address.' });
  if (![value.email, value.phone, value.links].some(Boolean)) context.addIssue({ code: 'custom', path: ['email'], message: 'Add an email, phone number, or contact link.' });
  if (!value.summary && !skillList(value.skills).length && !value.experience.some(hasAnswers) && !value.education.some(hasAnswers) && !value.projects.some(hasAnswers)) {
    context.addIssue({ code: 'custom', path: ['skills'], message: 'Add a short introduction, a skill, education, a project, or experience to include in your resume.' });
  }
  value.experience.forEach((entry, index) => { if (hasAnswers(entry) && !entry.role && !entry.organization) context.addIssue({ code: 'custom', path: ['experience', index, 'role'], message: 'Give this experience a role or organization name.' }); });
  value.education.forEach((entry, index) => { if (hasAnswers(entry) && !entry.qualification && !entry.institution) context.addIssue({ code: 'custom', path: ['education', index, 'qualification'], message: 'Name the course, qualification, or school.' }); });
  value.projects.forEach((entry, index) => { if (hasAnswers(entry) && !entry.name) context.addIssue({ code: 'custom', path: ['projects', index, 'name'], message: 'Give this project a name.' }); });
});

export type StarterResumeAnswers = z.infer<typeof starterResumeAnswersSchema>;
export interface StarterResumeDraft {
  answers: StarterResumeAnswers;
  sourceText: string;
  generatedResume: GeneratedResume;
  filename: string;
}

function hasAnswers(entry: Record<string, string>) { return Object.values(entry).some(Boolean); }

export function createStarterResumeAnswers(fullName = ''): StarterResumeAnswers {
  return {
    fullName, headline: '', email: '', phone: '', location: '', links: '', summary: '', skills: '',
    experience: [{ role: '', organization: '', dates: '', highlights: '' }],
    education: [{ qualification: '', institution: '', dates: '', details: '' }],
    projects: [{ name: '', url: '', description: '' }],
  };
}

export function validateStarterResume(value: unknown): string[] {
  const result = starterResumeAnswersSchema.safeParse(value);
  return result.success ? [] : Array.from(new Set(result.error.issues.map(issue => issue.message)));
}

function lines(value: string) {
  return value.split('\n').map(line => line.trim().replace(/^[-*•]\s+/, '')).filter(Boolean);
}

function skillList(value: string) {
  const seen = new Set<string>();
  return value.split(/[,;\n]/).map(skill => skill.trim().replace(/^[-*•]\s+/, '')).filter(skill => {
    if (!skill || seen.has(skill.toLowerCase())) return false;
    seen.add(skill.toLowerCase()); return true;
  });
}

export function escapeResumeLatex(value: string): string {
  const escapes: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
  return value.replace(/[\\{}$&#_%~^]/g, character => escapes[character]);
}

function toLatex(preview: GeneratedResumePreview): string {
  const escape = escapeResumeLatex;
  const section = (name: string) => `\\section*{${escape(name)}}`;
  const item = (entry: GeneratedResumePreviewItem) => [
    `\\textbf{${escape(entry.heading)}}${entry.date ? ` \\hfill ${escape(entry.date)}` : ''}\\\\`,
    ...(entry.subheading ? [escape(entry.subheading) + '\\\\'] : []),
    ...(entry.meta ? [escape(entry.meta) + '\\\\'] : []),
    ...(entry.details.length ? ['\\begin{itemize}[leftmargin=*,noitemsep,topsep=3pt]', ...entry.details.map(detail => `\\item ${escape(detail)}`), '\\end{itemize}'] : []),
    '\\vspace{4pt}',
  ].join('\n');
  return [
    '\\documentclass[10pt]{article}', '\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}',
    '\\usepackage[margin=0.7in]{geometry}', '\\usepackage{enumitem}', '\\pagestyle{empty}', '\\setlength{\\parindent}{0pt}',
    '\\begin{document}', '\\begin{center}', `{\\LARGE\\bfseries ${escape(preview.fullName)}}\\\\[4pt]`,
    ...(preview.headline ? [`${escape(preview.headline)}\\\\[4pt]`] : []),
    escape(preview.contact.join(' | ')), '\\end{center}',
    ...(preview.summary ? [section('Summary'), escape(preview.summary)] : []),
    ...preview.sections.flatMap(group => [section(group.title), ...group.items.map(item)]),
    '\\end{document}', '',
  ].join('\n');
}

/** Formats only supplied facts. It never infers jobs, qualifications, dates, or achievements. */
export function buildStarterResume(value: unknown): StarterResumeDraft {
  const answers = starterResumeAnswersSchema.parse(value);
  const sections: GeneratedResumePreviewSection[] = [];
  const work = answers.experience.filter(hasAnswers).map(entry => ({ heading: entry.role || entry.organization, subheading: entry.role && entry.organization ? entry.organization : undefined, date: entry.dates || undefined, details: lines(entry.highlights) }));
  if (work.length) sections.push({ title: 'Experience', items: work });
  const education = answers.education.filter(hasAnswers).map(entry => ({ heading: entry.qualification || entry.institution, subheading: entry.qualification && entry.institution ? entry.institution : undefined, date: entry.dates || undefined, details: lines(entry.details) }));
  if (education.length) sections.push({ title: 'Education', items: education });
  const projects = answers.projects.filter(hasAnswers).map(entry => ({ heading: entry.name, meta: entry.url || undefined, details: lines(entry.description) }));
  if (projects.length) sections.push({ title: 'Projects', items: projects });
  const skills = skillList(answers.skills);
  if (skills.length) sections.push({ title: 'Skills', items: [{ heading: skills.join(', '), details: [] }] });
  const preview: GeneratedResumePreview = {
    fullName: answers.fullName, headline: answers.headline || undefined, summary: answers.summary || undefined,
    contact: [answers.email, answers.phone, answers.location, ...lines(answers.links)].filter(Boolean), sections, skillGroups: [],
  };
  const sourceText = [
    answers.fullName, answers.headline, preview.contact.join(' | '), '',
    ...(answers.summary ? ['SUMMARY', answers.summary, ''] : []),
    ...sections.flatMap(section => [section.title.toUpperCase(), ...section.items.flatMap(entry => [
      [entry.heading, entry.subheading, entry.date].filter(Boolean).join(' | '), ...(entry.meta ? [entry.meta] : []),
      ...entry.details.map(detail => `- ${detail}`), '',
    ])]),
  ].filter(line => line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  const filename = `${answers.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my'}-base-resume.txt`;
  return { answers, sourceText, filename, generatedResume: { preview, latex: toLatex(preview), tailoringNotes: [], assumptions: [], followUpQuestions: [] } };
}
