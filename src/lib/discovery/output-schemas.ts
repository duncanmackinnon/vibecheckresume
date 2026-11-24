import { z } from 'zod';
const id = z.string().uuid();
const record = { id, ownerId: id, applicationId: id.nullable(), version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() };
const preferences = z.object({ roles: z.array(z.string()), locations: z.array(z.string()), workStyles: z.array(z.string()), employmentTypes: z.array(z.string()), additionalContext: z.string() });
export const discoveryMatchSchema = z.object({ ...record, kind: z.literal('job_match'), data: z.object({
  company: z.string(), role: z.string(), location: z.string(), workStyle: z.enum(['remote', 'hybrid', 'onsite', 'unknown']), compensation: z.string(), summary: z.string(), url: z.string(),
  sources: z.array(z.object({ url: z.string(), title: z.string() })), discoveryRunId: id, discoveredAt: z.string(), lastSeenAt: z.string(), savedApplicationId: id.nullable(),
}) });
const run = z.object({ ...record, kind: z.literal('discovery_run'), data: z.object({
  type: z.literal('search'), status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']), trigger: z.enum(['manual', 'scheduled']), preferences,
  fingerprint: z.string(), scheduleGeneration: z.string().nullable(), matchIds: z.array(id), error: z.string().nullable(), startedAt: z.string().nullable(), completedAt: z.string().nullable(), workflowRunId: z.string().nullable(),
}) });
const schedule = z.object({ ...record, kind: z.literal('discovery_run'), data: z.object({ type: z.literal('schedule'), status: z.enum(['inactive', 'starting', 'active', 'failed']), generation: z.string(), fingerprint: z.string(), cadence: z.enum(['manual', 'daily', 'weekly']), nextRunAt: z.string().nullable(), workflowRunId: z.string().nullable(), sequence: z.number().int(), error: z.string().nullable() }) });
export const discoveryOutputSchemas = {
  find_jobs: z.object({ run, websiteUrl: z.string() }),
  get_job_search: z.object({ run, matches: z.array(discoveryMatchSchema), websiteUrl: z.string() }),
  list_discovered_jobs: z.object({ matches: z.array(discoveryMatchSchema), runs: z.array(run), schedule: schedule.nullable(), preferences: preferences.nullable(), consent: z.boolean(), configured: z.boolean(), profileComplete: z.boolean(), websiteUrl: z.string(), total: z.number().int().nonnegative() }),
};
