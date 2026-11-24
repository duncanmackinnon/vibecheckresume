import { z } from 'zod';
import { getOnboardingProfile } from '@/lib/onboarding/service';
import { appBaseUrl } from '@/lib/tracker/config';
import { TrackerError } from '@/lib/tracker/errors';
import { executeAction } from '@/lib/tracker/service';
import { createRecord, getRecord, idempotent, listRecords, updateRecord, withOwnerTransaction } from '@/lib/tracker/store';
import { flatten, type Application, type ApplicationData, type RecordKind, type StoredRecord } from '@/lib/tracker/types';
import { canonicalJobUrl, searchWebJobs } from './provider';
import { discoveryPreferences, discoveryRecordId, preferenceFingerprint, searchPreferenceFingerprint } from './preferences';
import type { DiscoveryOverview, DiscoveryRun, DiscoveryRunData, DiscoveryScheduleData, JobMatchData } from './types';

export const discoveryActionSchemas = {
  find_jobs: z.object({ idempotencyKey: z.string().uuid() }).strict(),
  list_discovered_jobs: z.object({ includeSaved: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
  get_job_search: z.object({ id: z.string().uuid() }).strict(),
  save_discovered_job: z.object({ matchId: z.string().uuid(), idempotencyKey: z.string().uuid() }).strict(),
} as const;
export type DiscoveryAction = keyof typeof discoveryActionSchemas;

export async function maybeDiscoveryRecord<T>(ownerId: string, kind: RecordKind, id: string): Promise<StoredRecord<T> | null> {
  try { return await getRecord<T>(ownerId, kind, id); }
  catch (error) { if (error instanceof TrackerError && error.status === 404) return null; throw error; }
}
export async function requireDiscoveryProfile(ownerId: string, trigger: 'manual' | 'scheduled' = 'manual') {
  const profile = await getOnboardingProfile(ownerId);
  if (!profile?.data.completedAt) throw new TrackerError('Finish your profile before searching for jobs.', 409, 'PROFILE_INCOMPLETE');
  if (trigger === 'scheduled' && !profile.data.discoveryConsent) throw new TrackerError('Enable scheduled searches in your search preferences first.', 403, 'DISCOVERY_CONSENT_REQUIRED');
  const preferences = discoveryPreferences(profile.data);
  if (!preferences.roles.length) throw new TrackerError('Save a target role before searching.', 409, 'PREFERENCES_REQUIRED');
  return { profile, preferences, fingerprint: searchPreferenceFingerprint(profile.data) };
}

export async function reconcileDiscoveryRun(ownerId: string, run: DiscoveryRun): Promise<DiscoveryRun> {
  if (!['queued', 'running'].includes(run.data.status)) return run;
  const age = Date.now() - Date.parse(run.updatedAt);
  if (age < 30000) return run;
  let interrupted = !run.data.workflowRunId && age > (run.data.status === 'queued' ? 120000 : 600000);
  if (run.data.workflowRunId) {
    try { const { getRun } = await import('workflow/api'); interrupted = ['failed', 'cancelled', 'completed'].includes(await getRun(run.data.workflowRunId).status); }
    catch { return run; }
  }
  if (!interrupted) return run;
  await failDiscoveryRun(ownerId, run.id, 'The background search was interrupted. Start a new search to try again.');
  return getRecord<DiscoveryRunData>(ownerId, 'discovery_run', run.id);
}

export async function discoveryOverview(ownerId: string, includeAllMatches = false): Promise<DiscoveryOverview> {
  const [profile, matches, runs] = await Promise.all([getOnboardingProfile(ownerId), listRecords<JobMatchData>(ownerId, 'job_match'), listRecords<DiscoveryRunData | DiscoveryScheduleData>(ownerId, 'discovery_run')]);
  return {
    matches: matches.sort((a, b) => b.data.lastSeenAt.localeCompare(a.data.lastSeenAt)).slice(0, includeAllMatches ? undefined : 100),
    runs: await Promise.all(runs.filter((run): run is DiscoveryRun => run.data.type === 'search').slice(0, 10).map(run => reconcileDiscoveryRun(ownerId, run))),
    schedule: runs.find((run): run is StoredRecord<DiscoveryScheduleData> => run.data.type === 'schedule') || null,
    preferences: profile ? discoveryPreferences(profile.data) : null,
    consent: !!profile?.data.discoveryConsent, profileComplete: !!profile?.data.completedAt,
    configured: !!process.env.OPENAI_API_KEY, provider: 'platform', scheduleConfigured: !!process.env.OPENAI_API_KEY, websiteUrl: `${appBaseUrl()}/discover`,
  };
}

async function enforceDiscoveryLimit(ownerId: string) {
  const runs = await listRecords<DiscoveryRunData | DiscoveryScheduleData>(ownerId, 'discovery_run');
  const date = new Date().toISOString().slice(0, 10);
  const requested = Number(process.env.DISCOVERY_DAILY_LIMIT || 5);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(Math.floor(requested), 50)) : 5;
  if (runs.filter(run => run.data.type === 'search' && run.createdAt.startsWith(date)).length >= limit) throw new TrackerError('You have reached today’s job search limit. Your saved matches are still available. Searches reset tomorrow (UTC).', 429, 'DISCOVERY_LIMIT');
}

/** Called only inside an owner transaction, including from the scheduled owner workflow. */
export async function createDiscoveryRun(ownerId: string, key: string, trigger: 'manual' | 'scheduled', generation: string | null = null): Promise<{ run: DiscoveryRun; created: boolean }> {
  return withOwnerTransaction(ownerId, async () => {
    const id = discoveryRecordId(ownerId, `search:${key}`);
    const existing = await maybeDiscoveryRecord<DiscoveryRunData>(ownerId, 'discovery_run', id);
    if (existing) return { run: existing, created: false };
    const { preferences, fingerprint } = await requireDiscoveryProfile(ownerId, trigger);
    if (!process.env.OPENAI_API_KEY) throw new TrackerError('Server job search is not configured. Add a job manually from its posting in Applications.', 503, 'DISCOVERY_UNCONFIGURED');
    await enforceDiscoveryLimit(ownerId);
    const run = await createRecord<DiscoveryRunData>(ownerId, 'discovery_run', { type: 'search', status: 'queued', trigger, preferences, fingerprint, scheduleGeneration: generation, provider: 'platform', matchIds: [], error: null, startedAt: null, completedAt: null, workflowRunId: null }, { id });
    return { run, created: true };
  });
}

async function dispatchDiscoveryRun(ownerId: string, run: DiscoveryRun) {
  try {
    const [{ start }, { discoveryWorkflow }] = await Promise.all([import('workflow/api'), import('@/workflows/discovery')]);
    const workflow = await start(discoveryWorkflow, [ownerId, run.id]);
    await withOwnerTransaction(ownerId, async () => {
      const current = await getRecord<DiscoveryRunData>(ownerId, 'discovery_run', run.id);
      await updateRecord(ownerId, 'discovery_run', run.id, { ...current.data, workflowRunId: workflow.runId }, current.version);
    });
  } catch { await failDiscoveryRun(ownerId, run.id, 'The search could not be started. Try a new search shortly.'); }
  return getRecord<DiscoveryRunData>(ownerId, 'discovery_run', run.id);
}

export async function failDiscoveryRun(ownerId: string, runId: string, message: string) {
  await withOwnerTransaction(ownerId, async () => {
    const current = await getRecord<DiscoveryRunData>(ownerId, 'discovery_run', runId);
    if (['succeeded', 'cancelled', 'failed'].includes(current.data.status)) return;
    await updateRecord(ownerId, 'discovery_run', runId, { ...current.data, status: 'failed', error: message, completedAt: new Date().toISOString() }, current.version);
  });
}

/** Network work happens outside the transaction; a queued-only claim prevents duplicate paid searches. */
export async function performDiscoveryRun(ownerId: string, runId: string, search: typeof searchWebJobs = searchWebJobs) {
  const claimed = await withOwnerTransaction(ownerId, async () => {
    const current = await getRecord<DiscoveryRunData>(ownerId, 'discovery_run', runId);
    if (current.data.type !== 'search' || current.data.status !== 'queued') return null;
    if (current.data.connectionId && current.data.provider !== 'platform') {
      await updateRecord(ownerId, 'discovery_run', runId, { ...current.data, status: 'cancelled', completedAt: new Date().toISOString(), error: 'The AI provider changed. Start a new search to use the configured website service.' }, current.version);
      return null;
    }
    const profile = await getOnboardingProfile(ownerId);
    if (!profile?.data.completedAt || searchPreferenceFingerprint(profile.data) !== current.data.fingerprint || !await runConsentActive(ownerId, current, profile.data)) {
      await updateRecord(ownerId, 'discovery_run', runId, { ...current.data, status: 'cancelled', completedAt: new Date().toISOString(), error: 'Search preferences changed before this search started.' }, current.version);
      return null;
    }
    return updateRecord<DiscoveryRunData>(ownerId, 'discovery_run', runId, { ...current.data, status: 'running', startedAt: new Date().toISOString() }, current.version);
  });
  if (!claimed) return getRecord<DiscoveryRunData>(ownerId, 'discovery_run', runId);
  try {
    const jobs = await search(claimed.data.preferences);
    await withOwnerTransaction(ownerId, async () => {
      const run = await getRecord<DiscoveryRunData>(ownerId, 'discovery_run', runId);
      if (run.data.status !== 'running') return;
      const profile = await getOnboardingProfile(ownerId);
      if (!profile?.data.completedAt || searchPreferenceFingerprint(profile.data) !== run.data.fingerprint || !await runConsentActive(ownerId, run, profile.data)) {
        await updateRecord(ownerId, 'discovery_run', runId, { ...run.data, status: 'cancelled', completedAt: new Date().toISOString(), error: 'Your search preferences changed. Start a new search when ready.' }, run.version);
        return;
      }
      const now = new Date().toISOString(); const matchIds: string[] = [];
      for (const job of jobs) {
        const id = discoveryRecordId(ownerId, `match:${job.url}`);
        const previous = await maybeDiscoveryRecord<JobMatchData>(ownerId, 'job_match', id);
        const data: JobMatchData = { ...job, discoveryRunId: runId, discoveredAt: previous?.data.discoveredAt || now, lastSeenAt: now, savedApplicationId: previous?.data.savedApplicationId || null };
        if (previous) await updateRecord(ownerId, 'job_match', id, data, previous.version);
        else await createRecord(ownerId, 'job_match', data, { id });
        matchIds.push(id);
      }
      await updateRecord(ownerId, 'discovery_run', runId, { ...run.data, status: 'succeeded', matchIds, completedAt: now, error: null }, run.version);
    });
  } catch (error) {
    const message = error instanceof TrackerError ? error.message : 'The web search could not finish. Your saved matches are unchanged. Try a new search shortly.';
    await failDiscoveryRun(ownerId, runId, message);
  }
  return getRecord<DiscoveryRunData>(ownerId, 'discovery_run', runId);
}

async function runConsentActive(ownerId: string, run: DiscoveryRun, profile: NonNullable<Awaited<ReturnType<typeof getOnboardingProfile>>>['data']) {
  if (run.data.trigger === 'manual') return true;
  if (!profile.discoveryConsent || profile.cadence === 'manual') return false;
  const schedule = await maybeDiscoveryRecord<DiscoveryScheduleData>(ownerId, 'discovery_run', discoveryRecordId(ownerId, 'discovery-schedule'));
  return schedule?.data.generation === run.data.scheduleGeneration && schedule.data.fingerprint === preferenceFingerprint(profile);
}

export async function saveDiscoveredJob(ownerId: string, input: unknown) {
  const args = discoveryActionSchemas.save_discovered_job.parse(input);
  return idempotent(ownerId, `save-match:${args.idempotencyKey}`, 'save_discovered_job', { matchId: args.matchId }, async () => {
    const match = await getRecord<JobMatchData>(ownerId, 'job_match', args.matchId);
    if (match.data.savedApplicationId) return { application: flatten(await getRecord<ApplicationData>(ownerId, 'application', match.data.savedApplicationId)), match, alreadySaved: true };
    const applications = await listRecords<ApplicationData>(ownerId, 'application');
    const existing = applications.find(application => canonicalJobUrl(application.data.jobUrl) === match.data.url);
    const application = existing ? flatten(existing) : await executeAction(ownerId, 'create_application', {
      company: match.data.company, role: match.data.role, location: match.data.location,
      jobUrl: match.data.url, compensation: match.data.compensation, stage: 'Saved',
      jobDescription: `${match.data.summary}\n\nSource: ${match.data.url}\nFound ${match.data.lastSeenAt.slice(0, 10)}. Review the source for the full current job description.`,
      tags: ['Discovered'],
    }, `discovered-job:${match.id}`) as Application;
    const saved = await updateRecord(ownerId, 'job_match', match.id, { ...match.data, savedApplicationId: application.id }, match.version);
    return { application, match: saved, alreadySaved: !!existing };
  });
}

export async function executeDiscoveryAction(ownerId: string, action: DiscoveryAction, input: unknown): Promise<unknown> {
  switch (action) {
    case 'find_jobs': {
      const args = discoveryActionSchemas.find_jobs.parse(input);
      const { run, created } = await createDiscoveryRun(ownerId, args.idempotencyKey, 'manual');
      return { run: created ? await dispatchDiscoveryRun(ownerId, run) : run, websiteUrl: `${appBaseUrl()}/discover` };
    }
    case 'list_discovered_jobs': {
      const args = discoveryActionSchemas.list_discovered_jobs.parse(input);
      const overview = await discoveryOverview(ownerId, true);
      const matches = overview.matches.filter(match => args.includeSaved || !match.data.savedApplicationId);
      return { ...overview, matches: matches.slice(0, args.limit || 50), total: matches.length };
    }
    case 'get_job_search': {
      const args = discoveryActionSchemas.get_job_search.parse(input);
      const run = await reconcileDiscoveryRun(ownerId, await getRecord<DiscoveryRunData>(ownerId, 'discovery_run', args.id));
      if (run.data.type !== 'search') throw new TrackerError('This job search was not found.', 404, 'NOT_FOUND');
      const matches = await Promise.all(run.data.matchIds.map(id => getRecord<JobMatchData>(ownerId, 'job_match', id)));
      return { run, matches, websiteUrl: `${appBaseUrl()}/discover` };
    }
    case 'save_discovered_job': return saveDiscoveredJob(ownerId, input);
  }
}
