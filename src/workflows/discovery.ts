import { sleep } from 'workflow';

export async function discoveryWorkflow(ownerId: string, searchId: string) {
  'use workflow';
  try { return await searchStep(ownerId, searchId); }
  catch { await failSearchStep(ownerId, searchId); return { status: 'failed' }; }
}

/** One wait/search per run keeps history bounded; the next run picks up the latest deployment. */
export async function discoveryScheduleWorkflow(ownerId: string, generation: string, sequence: number) {
  'use workflow';
  const wake = await nextWakeStep(ownerId, generation, sequence);
  if (!wake) return { status: 'stopped' };
  await sleep(new Date(wake));
  const cycle = await scheduledCycleStep(ownerId, generation, sequence);
  if (!cycle) return { status: 'stopped' };
  if (cycle.runId) {
    try { await searchStep(ownerId, cycle.runId); }
    catch { await failSearchStep(ownerId, cycle.runId); }
  }
  await continueScheduleStep(ownerId, generation, cycle.nextSequence);
  return { status: 'continued' };
}

async function searchStep(ownerId: string, searchId: string) {
  'use step';
  const { performDiscoveryRun } = await import('@/lib/discovery/service');
  const run = await performDiscoveryRun(ownerId, searchId);
  return { id: run.id, status: run.data.status };
}
// A paid search is explicitly retried by a new user request, not automatically after an uncertain response.
searchStep.maxRetries = 0;

async function failSearchStep(ownerId: string, searchId: string) {
  'use step';
  const { failDiscoveryRun } = await import('@/lib/discovery/service');
  await failDiscoveryRun(ownerId, searchId, 'The search was interrupted. Try a new search when the service is available.');
}
async function nextWakeStep(ownerId: string, generation: string, sequence: number) {
  'use step';
  const { nextScheduledWake } = await import('@/lib/discovery/schedule');
  return nextScheduledWake(ownerId, generation, sequence);
}
async function scheduledCycleStep(ownerId: string, generation: string, sequence: number) {
  'use step';
  const { claimScheduledCycle } = await import('@/lib/discovery/schedule');
  return claimScheduledCycle(ownerId, generation, sequence);
}
async function continueScheduleStep(ownerId: string, generation: string, sequence: number) {
  'use step';
  const { continueDiscoverySchedule } = await import('@/lib/discovery/schedule');
  const schedule = await continueDiscoverySchedule(ownerId, generation, sequence);
  return { status: schedule?.data.status || 'stopped' };
}
