import { randomUUID } from 'node:crypto';
import { getOnboardingProfile } from '@/lib/onboarding/service';
import { TrackerError } from '@/lib/tracker/errors';
import { createRecord, getRecord, updateRecord, withOwnerTransaction } from '@/lib/tracker/store';
import { cadenceMilliseconds, discoveryRecordId, preferenceFingerprint } from './preferences';
import { createDiscoveryRun, maybeDiscoveryRecord } from './service';
import type { DiscoverySchedule, DiscoveryScheduleData } from './types';

const scheduleId = (ownerId: string) => discoveryRecordId(ownerId, 'discovery-schedule');

async function dispatchSchedule(ownerId: string, generation: string, sequence: number): Promise<DiscoverySchedule> {
  const current = await getRecord<DiscoveryScheduleData>(ownerId, 'discovery_run', scheduleId(ownerId));
  if (current.data.generation !== generation || current.data.sequence !== sequence || !['starting', 'active'].includes(current.data.status)) return current;
  try {
    const [{ start }, { discoveryScheduleWorkflow }] = await Promise.all([import('workflow/api'), import('@/workflows/discovery')]);
    const run = await start(discoveryScheduleWorkflow, [ownerId, generation, sequence], { deploymentId: 'latest' });
    return withOwnerTransaction(ownerId, async () => {
      const latest = await getRecord<DiscoveryScheduleData>(ownerId, 'discovery_run', current.id);
      if (latest.data.generation !== generation || latest.data.sequence !== sequence) return latest;
      return updateRecord(ownerId, 'discovery_run', latest.id, { ...latest.data, status: 'active', workflowRunId: run.runId }, latest.version);
    });
  } catch {
    return withOwnerTransaction(ownerId, async () => {
      const latest = await getRecord<DiscoveryScheduleData>(ownerId, 'discovery_run', current.id);
      if (latest.data.generation !== generation || latest.data.sequence !== sequence) return latest;
      return updateRecord(ownerId, 'discovery_run', latest.id, { ...latest.data, status: 'failed', error: 'Scheduled searches could not be started. Use Restart scheduled searches after the service is available.' }, latest.version);
    });
  }
}

/** Call after a profile save commits. Changing consent or preferences invalidates earlier sleepers. */
export async function syncDiscoverySchedule(ownerId: string, restart = false): Promise<DiscoverySchedule | null> {
  const plan = await withOwnerTransaction(ownerId, async () => {
    const profile = await getOnboardingProfile(ownerId);
    const current = await maybeDiscoveryRecord<DiscoveryScheduleData>(ownerId, 'discovery_run', scheduleId(ownerId));
    if (!profile) return null;
    const fingerprint = preferenceFingerprint(profile.data);
    const staleStart = current?.data.status === 'starting' && Date.now() - Date.parse(current.updatedAt) > 120000;
    if (!restart && current?.data.fingerprint === fingerprint && !staleStart && current.data.status !== 'failed') return { record: current, dispatch: false };
    const cadence = profile.data.cadence;
    const enabled = !!profile.data.completedAt && profile.data.discoveryConsent && cadence !== 'manual';
    const configured = !!process.env.OPENAI_API_KEY;
    const data: DiscoveryScheduleData = {
      type: 'schedule', generation: randomUUID(), fingerprint, cadence,
      status: !enabled ? 'inactive' : configured ? 'starting' : 'failed', sequence: 0,
      nextRunAt: enabled ? new Date(Date.now() + cadenceMilliseconds(cadence as 'daily' | 'weekly')).toISOString() : null,
      workflowRunId: null,
      error: enabled && !configured ? 'Scheduled searches are saved but cannot run until job discovery is configured.' : null,
    };
    const record = current ? await updateRecord(ownerId, 'discovery_run', current.id, data, current.version) : await createRecord(ownerId, 'discovery_run', data, { id: scheduleId(ownerId) });
    return { record, dispatch: enabled && configured };
  });
  if (!plan) return null;
  return plan.dispatch ? dispatchSchedule(ownerId, plan.record.data.generation, plan.record.data.sequence) : plan.record;
}

async function currentScheduledGeneration(ownerId: string, generation: string, sequence: number) {
  const [schedule, profile] = await Promise.all([maybeDiscoveryRecord<DiscoveryScheduleData>(ownerId, 'discovery_run', scheduleId(ownerId)), getOnboardingProfile(ownerId)]);
  if (!schedule || !profile?.data.completedAt || !profile.data.discoveryConsent || profile.data.cadence === 'manual') return null;
  if (schedule.data.generation !== generation || schedule.data.sequence !== sequence || schedule.data.fingerprint !== preferenceFingerprint(profile.data) || !['starting', 'active'].includes(schedule.data.status)) return null;
  return schedule;
}

export async function nextScheduledWake(ownerId: string, generation: string, sequence: number): Promise<string | null> {
  return withOwnerTransaction(ownerId, async () => (await currentScheduledGeneration(ownerId, generation, sequence))?.data.nextRunAt || null);
}

/** Exactly one workflow copy can advance a generation's sequence and create its owner-bound search. */
export async function claimScheduledCycle(ownerId: string, generation: string, sequence: number): Promise<{ runId: string | null; nextSequence: number } | null> {
  return withOwnerTransaction(ownerId, async () => {
    const current = await currentScheduledGeneration(ownerId, generation, sequence);
    if (!current || !current.data.nextRunAt || Date.parse(current.data.nextRunAt) > Date.now()) return null;
    let runId: string | null = null; let message: string | null = null;
    try {
      const { run } = await createDiscoveryRun(ownerId, `scheduled:${generation}:${sequence}`, 'scheduled', generation);
      runId = run.id;
      if (current.data.workflowRunId && !run.data.workflowRunId) await updateRecord(ownerId, 'discovery_run', run.id, { ...run.data, workflowRunId: current.data.workflowRunId }, run.version);
    }
    catch (error) {
      if (error instanceof TrackerError && error.status === 429) message = error.message;
      else {
        await updateRecord(ownerId, 'discovery_run', current.id, { ...current.data, status: 'failed', error: 'Scheduled searches paused because the service is unavailable. You can restart them from Discover.' }, current.version);
        return null;
      }
    }
    const nextSequence = sequence + 1;
    await updateRecord(ownerId, 'discovery_run', current.id, { ...current.data, sequence: nextSequence, status: 'starting', nextRunAt: new Date(Date.now() + cadenceMilliseconds(current.data.cadence as 'daily' | 'weekly')).toISOString(), workflowRunId: null, error: message }, current.version);
    return { runId, nextSequence };
  });
}

export async function continueDiscoverySchedule(ownerId: string, generation: string, sequence: number) {
  const current = await withOwnerTransaction(ownerId, () => currentScheduledGeneration(ownerId, generation, sequence));
  if (!current) return null;
  return dispatchSchedule(ownerId, generation, sequence);
}
