import { z } from 'zod';
import { actionSchemas } from '@/lib/tracker/schemas';
import { executeAction, getSnapshot } from '@/lib/tracker/service';
import { STAGES } from '@/lib/tracker/types';
import { executeResumeAction, resumeActionSchemas, type ResumeAction } from '@/lib/resume-workspace/service';
import { discoveryActionSchemas, executeDiscoveryAction, type DiscoveryAction } from '@/lib/discovery/service';
import { getOnboardingProfile } from '@/lib/onboarding/service';

export type ToolScope = 'applications:read' | 'applications:write' | 'resumes:read' | 'resumes:write';
export interface TrackerTool {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType;
  scopes: ToolScope[];
  readOnly: boolean;
  idempotent: boolean;
  destructive: boolean;
  run: (ownerId: string, input: Record<string, unknown>, idempotencyKey: string) => Promise<unknown>;
}

export function siteUrl() {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH0_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000';
}

const applicationSummary = (application: Awaited<ReturnType<typeof getSnapshot>>['applications'][number]) => ({
  id: application.id, version: application.version, company: application.company, role: application.role,
  stage: application.stage, location: application.location, priority: application.priority,
  appliedDate: application.appliedDate, deadline: application.deadline, archived: application.archived,
  tags: application.tags, submittedResumeVersionId: application.submittedResumeVersionId,
  url: `${siteUrl()}/applications/${application.id}`,
});

const readTools: TrackerTool[] = [
  {
    name:'get_search_preferences',title:'Read job search preferences',description:'Read the connected user’s saved target roles, locations, work arrangements and employment preferences before finding jobs. Does not include resume contents or account credentials. If preferences are missing, ask the user what work they want. ChatGPT can use its own web search when available and save selected sourced opportunities with create_application.',
    schema:z.object({}).strict(),scopes:['applications:read'],readOnly:true,idempotent:true,destructive:false,
    async run(ownerId) {
      const profile=await getOnboardingProfile(ownerId);
      return {preferences:profile?.data.preferences || null,websiteUrl:`${siteUrl()}/onboarding?edit=preferences`};
    },
  },
  {
    name: 'list_applications', title: 'Find applications', description: 'Search your job application tracker by company or role, filter by stage, and see open follow-up tasks. Total and stageCounts include every filtered match; applications contains the first limit results. Returns current record versions required for changes.',
    schema: z.object({ query: z.string().max(200).optional(), stage: z.enum(STAGES).optional(), includeArchived: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
    scopes: ['applications:read'], readOnly: true, idempotent: true, destructive: false,
    async run(ownerId, input) {
      const snapshot = await getSnapshot(ownerId); const query = String(input.query || '').toLowerCase();
      const applications = snapshot.applications.filter((item) => (input.includeArchived || !item.archived) && (!input.stage || item.stage === input.stage) && (!query || `${item.company} ${item.role} ${item.tags.join(' ')}`.toLowerCase().includes(query)));
      const stageCounts = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<(typeof STAGES)[number], number>;
      for (const application of applications) stageCounts[application.stage] += 1;
      const page = applications.slice(0, Number(input.limit || 50)); const ids = new Set(page.map((item) => item.id));
      return { applications: page.map(applicationSummary), total: applications.length, stageCounts, tasks: snapshot.entries.filter((item) => item.kind === 'task' && !item.completed && item.applicationId && ids.has(item.applicationId)), websiteUrl: siteUrl() };
    },
  },
  {
    name: 'get_application', title: 'Read application details', description: 'Read one application, its saved job description, contacts, notes, interviews and tasks. Use before editing so expectedVersion is current.',
    schema: z.object({ applicationId: z.string().uuid() }).strict(), scopes: ['applications:read'], readOnly: true, idempotent: true, destructive: false,
    async run(ownerId, input) {
      const snapshot = await getSnapshot(ownerId); const application = snapshot.applications.find((item) => item.id === input.applicationId);
      if (!application) throw new Error('Application not found.');
      return { application: { ...applicationSummary(application), jobDescription: application.jobDescription, jobUrl: application.jobUrl, compensation: application.compensation }, entries: snapshot.entries.filter((item) => item.applicationId === application.id), websiteUrl: siteUrl() };
    },
  },
  {
    name: 'list_followups', title: 'Review follow-ups', description: 'List outstanding tasks and upcoming interviews across your applications, with application details and current versions.',
    schema: z.object({ applicationId: z.string().uuid().optional(), includeCompleted: z.boolean().optional() }).strict(), scopes: ['applications:read'], readOnly: true, idempotent: true, destructive: false,
    async run(ownerId, input) {
      const snapshot = await getSnapshot(ownerId);
      const activeIds = new Set(snapshot.applications.filter((item) => !item.archived).map((item) => item.id));
      return { entries: snapshot.entries.filter((item) => (item.kind === 'task' || item.kind === 'interview') && (!input.applicationId || item.applicationId === input.applicationId) && (input.includeCompleted || !item.completed) && item.applicationId && activeIds.has(item.applicationId)), applications: snapshot.applications.filter((item) => activeIds.has(item.id)).map(applicationSummary), websiteUrl: siteUrl() };
    },
  },
];

const requestKey = z.string().min(8).max(150).describe('A unique identifier for this intended change. Reuse it only when retrying exactly the same change.');
const uiTools: TrackerTool[] = [
  { name: 'set_application_stage', title: 'Change application stage', description: 'Move one application to a stage requested by the user. Read it first for the current expectedVersion.',
    schema: z.object({ applicationId: z.string().uuid(), stage: z.enum(STAGES), expectedVersion: z.number().int().positive(), idempotencyKey: requestKey }).strict(), scopes: ['applications:write'], readOnly: false, idempotent: true, destructive: false,
    run: (ownerId, input) => executeAction(ownerId, 'update_application', { id: input.applicationId, stage: input.stage, expectedVersion: input.expectedVersion }, String(input.idempotencyKey)) },
  { name: 'complete_task', title: 'Complete a follow-up', description: 'Mark one follow-up task completed at the user’s request. Read the task first for its current expectedVersion.',
    schema: z.object({ taskId: z.string().uuid(), expectedVersion: z.number().int().positive(), idempotencyKey: requestKey }).strict(), scopes: ['applications:write'], readOnly: false, idempotent: true, destructive: false,
    run: (ownerId, input) => executeAction(ownerId, 'update_task', { id: input.taskId, completed: true, expectedVersion: input.expectedVersion }, String(input.idempotencyKey)) },
];

const labels: Record<string, string> = {
  create_application: 'Add application', update_application: 'Update application', archive_application: 'Archive application', restore_application: 'Restore application',
  add_note: 'Add a note', update_note: 'Update note', create_contact: 'Add contact', update_contact: 'Update contact', create_task: 'Add task', update_task: 'Update task', create_interview: 'Add interview', update_interview: 'Update interview', delete_entry: 'Delete note, contact, task or interview',
  list_resumes: 'List saved resumes', get_resume: 'Read a resume', analyze_resume: 'Analyze a resume for this job', get_resume_questions: 'Read resume builder questions', save_resume_draft: 'Save resume answers', generate_resume: 'Create a tailored resume', select_submitted_resume: 'Select the submitted resume', get_ai_job: 'Check resume progress', retry_ai_job: 'Retry resume processing',
};

export function getTools(): TrackerTool[] {
  const domainTools = Object.entries(actionSchemas).map(([action, schema]): TrackerTool => {
    const name = action.replace(/[.]/g, '_');
    // executeAction persists the result by owner + retry key in the same transaction as the change.
    return { name, title: labels[name] || name.replace(/_/g, ' '), description: `${labels[name] || name.replace(/_/g, ' ')} in the user's tracker. Only act on the user's request. ${name==='create_application'?'Save sourced opportunities from ChatGPT web search in the Saved stage, retaining the real vacancy URL and known details. Do not invent openings, compensation or job descriptions. ':''}Edits require the current expectedVersion; first read the record and never guess identifiers.`, schema: (schema as z.ZodObject).extend({ idempotencyKey: requestKey }), scopes: ['applications:write'], readOnly: false, idempotent: true, destructive: /delete|archive/.test(name), run: (ownerId, input, fallbackKey) => { const { idempotencyKey, ...data } = input; return executeAction(ownerId, action, data, String(idempotencyKey || fallbackKey)); } };
  });
  const resumeTools = Object.entries(resumeActionSchemas).map(([name, schema]): TrackerTool => {
    const readOnly = /^(list_|get_)/.test(name);
    // Jobs use stable request IDs; draft/selection setters detect an identical value; retry pins its source version.
    const idempotent = readOnly || ['analyze_resume', 'generate_resume', 'save_resume_draft', 'select_submitted_resume', 'retry_ai_job'].includes(name);
    return { name, title: labels[name] || name.replace(/_/g, ' '), description: `${labels[name] || name.replace(/_/g, ' ')}. Use only stored resumes owned by the user. ${name === 'list_resumes' ? 'Returns compact summaries; use get_resume to read the full document or analysis. ' : ''}Analysis and generation return a background job; get_ai_job reports progress. Never invent work history or answers to missing questions.`, schema: schema as z.ZodType, scopes: [readOnly ? 'resumes:read' : 'resumes:write'], readOnly, idempotent, destructive: false, async run(ownerId, input) {
      const result = await executeResumeAction(ownerId, name as ResumeAction, input);
      if (name === 'get_resume' && result && typeof result === 'object' && 'downloadUrl' in result && typeof result.downloadUrl === 'string') return { ...result, downloadUrl: new URL(result.downloadUrl, `${siteUrl()}/`).href };
      return result;
    } };
  });
  const discoveryDescriptions: Record<DiscoveryAction, string> = {
    find_jobs: 'Optional server-powered job search using a separately configured platform provider and the connected user’s saved preferences. Requires the deployment’s OpenAI API key and completed onboarding; it is not ChatGPT native web search and uses platform billing. ChatGPT can instead read get_search_preferences, search the web itself when available, and save user-selected jobs with create_application without a website API key. Run only when explicitly requested. Returns a background job; use get_job_search later. Never claim jobs were found before it succeeds. Does not submit applications or create a ChatGPT Task.',
    list_discovered_jobs: 'List saved web-discovered job matches and their original source citations, plus recent search and schedule status. Cite the provided URLs as clickable links when describing a job. These are search results, not submitted applications.',
    get_job_search: 'Read one owned background job search and its sourced matches. Only a succeeded search has finished. Explain failed, cancelled, queued or running status accurately; do not repeatedly poll in one turn.',
    save_discovered_job: 'Save a discovered job selected by the user into their application tracker. Repeated requests for the same match reuse its existing application. This saves a role; it does not apply to the employer.',
  };
  const discoveryTitles: Record<DiscoveryAction, string> = { find_jobs: 'Find matching jobs', list_discovered_jobs: 'Read discovered jobs', get_job_search: 'Check job search progress', save_discovered_job: 'Save a discovered job' };
  const discoveryTools = Object.entries(discoveryActionSchemas).map(([rawName, schema]): TrackerTool => {
    const name = rawName as DiscoveryAction; const readOnly = name === 'list_discovered_jobs' || name === 'get_job_search';
    return { name, title: discoveryTitles[name], description: discoveryDescriptions[name], schema, scopes: [readOnly ? 'applications:read' : 'applications:write'], readOnly, idempotent: true, destructive: false, run: (ownerId, input) => executeDiscoveryAction(ownerId, name, input) };
  });
  return [...readTools, ...domainTools, ...uiTools, ...resumeTools, ...discoveryTools];
}

export async function runTool(ownerId: string, name: string, rawInput: unknown, idempotencyKey: string) {
  const tool = getTools().find((entry) => entry.name === name);
  if (!tool) throw new Error('Unknown tracker tool.');
  // Extra identity fields are rejected even if a future schema accidentally permits them.
  if (rawInput && typeof rawInput === 'object' && ['userId', 'ownerId', 'user_id', 'owner_id'].some((key) => key in rawInput)) throw new Error('Tool arguments cannot select a user.');
  const input = tool.schema.parse(rawInput) as Record<string, unknown>;
  return tool.run(ownerId, input, idempotencyKey);
}

export function functionTools() {
  return getTools().map((tool) => ({ type: 'function' as const, name: tool.name, description: tool.description, parameters: z.toJSONSchema(tool.schema, { io: 'input' }) as Record<string, unknown>, strict: false }));
}

export function publicError(cause: unknown): string {
  if (cause instanceof z.ZodError) return cause.issues.map((issue) => `${issue.path.join('.') || 'Input'}: ${issue.message}`).join('; ');
  const status = cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : undefined;
  if (status && status >= 500) return 'This action is temporarily unavailable. Please try again.';
  if (cause instanceof Error && !/postgres|database|connection string|api.key|token|sql|secret/i.test(cause.message)) return cause.message.slice(0, 500);
  return 'This action could not be completed. Please try again.';
}
