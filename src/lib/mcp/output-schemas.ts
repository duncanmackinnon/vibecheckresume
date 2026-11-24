import { z } from 'zod';
import { STAGES } from '@/lib/tracker/types';
import { discoveryMatchSchema, discoveryOutputSchemas } from '@/lib/discovery/output-schemas';
import { jobPreferencesSchema } from '@/lib/onboarding/schemas';

const id = z.string().uuid();
const metadata = { id, ownerId: id, applicationId: id.nullable(), version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() };
const applicationFields = { company: z.string(), role: z.string(), stage: z.enum(STAGES), location: z.string(), priority: z.enum(['low', 'medium', 'high']), appliedDate: z.string().nullable(), deadline: z.string().nullable(), archived: z.boolean(), tags: z.array(z.string()), submittedResumeVersionId: id.nullable() };
const summary = z.object({ id, version: z.number().int().positive(), ...applicationFields, url: z.string() });
const application = z.object({ ...metadata, ...applicationFields, jobUrl: z.string(), jobDescription: z.string(), compensation: z.string() });
const entry = z.object({ ...metadata, kind: z.enum(['note', 'contact', 'task', 'interview', 'activity']), title: z.string(), body: z.string(), dueDate: z.string().nullable(), completed: z.boolean(), startAt: z.string().nullable(), endAt: z.string().nullable(), timezone: z.string(), email: z.string(), phone: z.string(), url: z.string(), contactRole: z.string() });
const stored = z.object({ ...metadata, kind: z.string(), data: z.record(z.string(), z.unknown()), downloadUrl: z.string().optional() });
const question = z.object({ id: z.string(), label: z.string() }).passthrough();
const answers = z.record(z.string(), z.string());

export function outputSchemaFor(name: string): z.ZodType {
  if(name==='get_search_preferences')return z.object({preferences:jobPreferencesSchema.nullable(),websiteUrl:z.string()});
  if (name === 'save_discovered_job') return z.object({ application, match: discoveryMatchSchema, alreadySaved: z.boolean() });
  if (name in discoveryOutputSchemas) return discoveryOutputSchemas[name as keyof typeof discoveryOutputSchemas];
  if (name === 'list_applications') return z.object({ applications: z.array(summary), total: z.number().int().nonnegative(), stageCounts: z.record(z.enum(STAGES), z.number().int().nonnegative()), tasks: z.array(entry), websiteUrl: z.string() });
  if (name === 'get_application') return z.object({ application: summary.extend({ jobDescription: z.string(), jobUrl: z.string(), compensation: z.string() }), entries: z.array(entry), websiteUrl: z.string() });
  if (name === 'list_followups') return z.object({ applications: z.array(summary), entries: z.array(entry), websiteUrl: z.string() });
  if (['create_application', 'update_application', 'archive_application', 'restore_application', 'set_application_stage'].includes(name)) return application;
  if (name === 'delete_entry') return z.object({ id, deleted: z.literal(true) });
  if (['add_note', 'update_note', 'create_contact', 'update_contact', 'create_task', 'update_task', 'create_interview', 'update_interview', 'complete_task'].includes(name)) return entry;
  if (name === 'list_resumes') return z.object({ summariesOnly: z.literal(true), sources: z.array(stored), analyses: z.array(stored), drafts: z.array(stored), versions: z.array(stored), jobs: z.array(stored) });
  if (name === 'get_resume_questions') return z.object({ answers, questions: z.array(question), missing: z.array(question), draft: stored.nullable() });
  if (name === 'generate_resume') return z.object({ ...Object.fromEntries(Object.entries(metadata).map(([key, schema]) => [key, schema.optional()])), kind: z.string().optional(), data: z.record(z.string(), z.unknown()).optional(), status: z.literal('needs_answers').optional(), questions: z.array(question).optional(), answers: answers.optional() });
  return stored;
}
