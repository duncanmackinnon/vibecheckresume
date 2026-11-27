import { z } from 'zod';
import { starterResumeAnswersSchema } from './starter-resume';

export const jobPreferencesSchema = z.object({
  roles: z.string().trim().max(2000), locations: z.string().trim().max(1000),
  workModes: z.array(z.enum(['remote', 'hybrid', 'onsite'])).max(3),
  employmentTypes: z.array(z.enum(['full-time', 'part-time', 'contract', 'internship'])).max(4),
  additionalContext: z.string().trim().max(3000),
}).strict();
export const draftProfileSchema = z.object({
  displayName: z.string().max(120),
  step: z.enum(['name', 'resume', 'build', 'preferences', 'connect', 'complete']),
  resumePath: z.enum(['upload', 'build']).nullable(), sourceResumeId: z.string().uuid().nullable(),
  preferences: jobPreferencesSchema, cadence: z.enum(['manual', 'daily', 'weekly']), discoveryConsent: z.boolean(),
}).strict();
const text = (max: number) => z.string().max(max);
export const unfinishedAnswersSchema = z.object({
  fullName: text(120), headline: text(160), email: text(254), phone: text(80), location: text(160), links: text(2000), summary: text(4000), skills: text(4000),
  experience: z.array(z.object({role:text(160),organization:text(160),dates:text(100),highlights:text(8000)}).strict()).max(10),
  education: z.array(z.object({qualification:text(200),institution:text(200),dates:text(100),details:text(4000)}).strict()).max(10),
  projects: z.array(z.object({name:text(200),url:text(500),description:text(8000)}).strict()).max(10),
}).strict();
export const profileInputSchema = draftProfileSchema.extend({displayName:z.string().trim().min(1,'Enter your name.').max(120)}).superRefine((value, context) => {
  if (value.cadence !== 'manual' && !value.discoveryConsent) context.addIssue({code: 'custom', path: ['discoveryConsent'], message: 'Opt in before scheduling job searches.'});
  if ((value.discoveryConsent || value.step === 'complete') && !value.preferences.roles) context.addIssue({code: 'custom', path: ['preferences', 'roles'], message: 'Describe the roles you want to find.'});
  if (value.step === 'complete' && (!value.resumePath || !value.sourceResumeId)) context.addIssue({code: 'custom', path: ['sourceResumeId'], message: 'Upload or build your resume before finishing.'});
});
export const onboardingRequestSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('save_draft'), input: z.object({
    profile: draftProfileSchema.extend({completedAt:z.string().datetime().nullable()}),
    screen: z.enum(['name','choose','upload','build','target','report','builder','result','preferences','connect','cadence','finish']),
    answers: unfinishedAnswersSchema, builtResume: z.boolean(), builderStep:z.number().int().min(0).max(5).default(0),
  }).strict(), expectedVersion: z.number().int().positive().optional(), idempotencyKey: z.string().uuid()}).strict(),
  z.object({action: z.literal('save_profile'), input: profileInputSchema, expectedVersion: z.number().int().positive().optional(), idempotencyKey: z.string().uuid()}).strict(),
  z.object({action: z.literal('save_starter_resume'), input: z.object({answers: starterResumeAnswersSchema}).strict(), idempotencyKey: z.string().uuid()}).strict(),
]);
