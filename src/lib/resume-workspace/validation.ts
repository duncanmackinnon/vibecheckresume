import { z } from 'zod';
import { createInitialResumeGenerationAnswers, getResumeGenerationQuestions } from '@/app/lib/resumeGeneratorQuestions';
import type { Analysis, ResumeGenerationAnswers } from '@/app/types';
import { SUPPORTED_RESUME_MIMES, validateUpload, type SupportedResumeMimeType } from '@/lib/resume-parser/formats';

export { SUPPORTED_RESUME_MIMES, validateUpload, type SupportedResumeMimeType };

export const resumeIdSchema = z.string().uuid();
export const answersSchema = z.record(z.string().max(100), z.string().max(12000)).refine(value => Object.keys(value).length <= 50, 'Too many answers');
export const analysisSchema = z.object({
  score: z.number().min(0).max(100),
  matchedSkills: z.array(z.object({ name: z.string(), match: z.boolean() })),
  missingSkills: z.array(z.string()),
  recommendations: z.object({ improvements: z.array(z.string()), strengths: z.array(z.string()), skillGaps: z.array(z.string()), format: z.array(z.string()) }),
  detailedAnalysis: z.string(),
  resumeBuilderProfile: z.object({
    fullName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), location: z.string().optional(),
    headline: z.string().optional(), summary: z.string().optional(), links: z.array(z.string()).default([]),
    workHighlights: z.array(z.string()).default([]), education: z.array(z.string()).default([]), skills: z.array(z.string()).default([]), projects: z.array(z.string()).default([]), awardsCertifications: z.array(z.string()).default([]),
  }).optional(),
  resumeSections: z.object({ basics: z.array(z.string()), work: z.array(z.string()), education: z.array(z.string()), skills: z.array(z.string()), projects: z.array(z.string()), awardsCertifications: z.array(z.string()) }).optional(),
  roleRequirements: z.array(z.object({ text: z.string(), status: z.enum(['matched', 'partial', 'missing']), evidence: z.string() })).optional(),
  priorityActions: z.array(z.object({ categoryId: z.string(), title: z.string(), rationale: z.string(), impact: z.enum(['medium', 'high']), effort: z.enum(['low', 'medium', 'high']), exampleRewrite: z.string().optional() })).optional(),
  evaluation: z.object({ categories: z.array(z.object({ id: z.string(), label: z.string(), score: z.number(), max: z.number(), evidence: z.string() })), bonus: z.object({ score: z.number(), max: z.number(), evidence: z.string() }), deductions: z.object({ score: z.number(), evidence: z.string() }), fairnessNotes: z.array(z.string()) }).optional(),
  isChunked: z.boolean().optional(),
});
export const generatedResumeSchema = z.object({
  latex: z.string().max(200000),
  preview: z.object({
    fullName: z.string(), contact: z.array(z.string()), headline: z.string().optional(), summary: z.string().optional(),
    sections: z.array(z.object({ title: z.string(), items: z.array(z.object({ heading: z.string(), subheading: z.string().optional(), meta: z.string().optional(), date: z.string().optional(), details: z.array(z.string()) })) })),
    skillGroups: z.array(z.object({ label: z.string(), skills: z.array(z.string()) })),
  }),
  tailoringNotes: z.array(z.string()), assumptions: z.array(z.string()), followUpQuestions: z.array(z.string()),
});

export function completeAnswers(analysis: Analysis, jobDescription: string, input: ResumeGenerationAnswers) {
  const answers = { ...createInitialResumeGenerationAnswers(analysis, jobDescription), ...answersSchema.parse(input) };
  const questions = getResumeGenerationQuestions(analysis, jobDescription);
  const required = [
    { id: 'fullName', label: 'Full name' }, { id: 'contactDetails', label: 'Contact details' }, { id: 'targetTitle', label: 'Target title' },
    ...questions.filter(question => question.required),
  ];
  return { answers, questions, missing: required.filter(question => !answers[question.id]?.trim()) };
}

export const SaveSessionBundleSchema = z.object({
  company: z.string().trim().min(1, 'Company name is required.').max(160),
  role: z.string().trim().min(1, 'Role title is required.').max(160),
  jobUrl: z.string().trim().max(500).optional(),
  jobDescription: z.string().trim().min(20, 'Job description must be at least 20 characters.').max(40000),
  sourceResumeId: z.string().uuid().optional().nullable(),
  sourceFilename: z.string().trim().min(1).max(200).optional(),
  sourceMimeType: z.enum(SUPPORTED_RESUME_MIMES).optional(),
  sourceText: z.string().trim().min(20, 'Resume text must be at least 20 characters.').max(80000),
  analysis: z.record(z.string(), z.unknown()),
  answers: z.record(z.string(), z.string()).optional(),
  generatedResume: z.record(z.string(), z.unknown()).optional().nullable(),
  useCurrentResume: z.boolean().optional(),
  label: z.string().trim().max(160).optional(),
});
