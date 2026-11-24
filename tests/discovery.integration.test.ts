import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { currentClient, setPoolForTests, withOwnerTransaction } from '../src/lib/tracker/db';
import { createRecord, getRecord, listRecords, saveUser, updateRecord } from '../src/lib/tracker/store';
import { createOnboardingProfile, type OnboardingProfileData } from '../src/lib/onboarding/types';
import { claimScheduledCycle, nextScheduledWake, syncDiscoverySchedule } from '../src/lib/discovery/schedule';
import { discoveryRecordId, preferenceFingerprint } from '../src/lib/discovery/preferences';
import { createDiscoveryRun, discoveryOverview, executeDiscoveryAction, performDiscoveryRun, reconcileDiscoveryRun, requireDiscoveryProfile, saveDiscoveredJob } from '../src/lib/discovery/service';
import type { DiscoveryRunData, DiscoveryScheduleData, DiscoveredJob, JobMatchData } from '../src/lib/discovery/types';

const owner = (number: number) => `d0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const job: DiscoveredJob = { company: 'Example employer', role: 'Engineer', location: '', workStyle: 'remote', compensation: '', summary: 'An accessible software role.', url: 'https://careers.example.com/jobs/123', sources: [{ url: 'https://careers.example.com/jobs/123', title: 'Employer vacancy' }] };
let db: PGlite;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'test-only', OPENAI_API_KEY: 'test-only-never-sent', DISCOVERY_DAILY_LIMIT: '5' });
  db = new PGlite();
  for (const file of ['0000_tracker.sql', '0001_onboarding_discovery.sql']) await db.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  await db.exec('SET ROLE vibecheck_app');
  let queue = Promise.resolve();
  setPoolForTests({ connect: async () => {
    const previous = queue; let release!: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
    return { query: (text: string, values?: unknown[]) => db.query(text, values), release };
  } } as unknown as Pool);
  for (let index = 1; index <= 6; index++) {
    await saveUser({ id: owner(index), name: `Test ${index}`, email: `test${index}@example.test` }, 'https://issuer.test/', `test-${index}`);
  }
});
after(async () => { await db?.close(); });

async function profile(ownerId: string, patch: Partial<OnboardingProfileData> = {}) {
  const current = (await listRecords<OnboardingProfileData>(ownerId, 'profile'))[0];
  const data: OnboardingProfileData = {
    ...(current?.data || createOnboardingProfile('Test job seeker')), step: 'complete', completedAt: new Date().toISOString(),
    preferences: { roles: 'Engineer', locations: '', workModes: ['remote'], employmentTypes: ['full-time'], additionalContext: '' }, ...patch,
  };
  return current ? updateRecord(ownerId, 'profile', current.id, data, current.version) : createRecord(ownerId, 'profile', data);
}

test('explicit manual searches work with recurring consent off and no location, and execute at most once', async () => {
  await profile(owner(1));
  assert.deepEqual((await requireDiscoveryProfile(owner(1))).preferences.locations, []);
  const key = randomUUID();
  const reserved = await createDiscoveryRun(owner(1), key, 'manual');
  assert.equal(reserved.run.data.provider, 'platform');
  assert.equal((await createDiscoveryRun(owner(1), key, 'manual')).created, false);
  let searches = 0;
  const provider = async () => { searches++; return [job]; };
  const result = await performDiscoveryRun(owner(1), reserved.run.id, provider);
  assert.equal(result.data.status, 'succeeded'); assert.equal(result.data.matchIds.length, 1);
  await performDiscoveryRun(owner(1), reserved.run.id, provider);
  assert.equal(searches, 1);
  assert.equal((await discoveryOverview(owner(1))).matches.length, 1);
});

test('match ownership and concurrent saves cannot expose jobs or create duplicate applications', async () => {
  const match = (await listRecords<JobMatchData>(owner(1), 'job_match'))[0];
  assert.equal((await discoveryOverview(owner(2))).matches.length, 0);
  await assert.rejects(getRecord(owner(2), 'job_match', match.id), { status: 404 });
  await assert.rejects(saveDiscoveredJob(owner(2), { matchId: match.id, idempotencyKey: randomUUID() }), { status: 404 });
  const key = randomUUID();
  const saved = await Promise.all([saveDiscoveredJob(owner(1), { matchId: match.id, idempotencyKey: key }), saveDiscoveredJob(owner(1), { matchId: match.id, idempotencyKey: key })]);
  assert.deepEqual(saved[0], saved[1]);
  const again = await saveDiscoveredJob(owner(1), { matchId: match.id, idempotencyKey: randomUUID() });
  assert.equal(again.alreadySaved, true);
  assert.equal(again.application.id, saved[0].application.id);
  assert.equal((await listRecords(owner(1), 'application')).length, 1);
  await assert.rejects(executeDiscoveryAction(owner(2), 'get_job_search', { id: match.data.discoveryRunId }), { status: 404 });
});

test('daily quota is owner-scoped and enforced before an additional search is created', async () => {
  await profile(owner(2)); process.env.DISCOVERY_DAILY_LIMIT = '1';
  await createDiscoveryRun(owner(2), randomUUID(), 'manual');
  await assert.rejects(createDiscoveryRun(owner(2), randomUUID(), 'manual'), { status: 429 });
  assert.equal((await listRecords(owner(2), 'discovery_run')).length, 1);
  process.env.DISCOVERY_DAILY_LIMIT = '5';
});

test('expired schedule generations and changed preferences stop without scheduling work', async () => {
  const savedProfile = await profile(owner(3), { discoveryConsent: true, cadence: 'daily' });
  const generation = randomUUID();
  const schedule = await createRecord<DiscoveryScheduleData>(owner(3), 'discovery_run', { type: 'schedule', status: 'active', generation, fingerprint: preferenceFingerprint(savedProfile.data), cadence: 'daily', nextRunAt: new Date(Date.now() - 1000).toISOString(), workflowRunId: null, sequence: 0, error: null }, { id: discoveryRecordId(owner(3), 'discovery-schedule') });
  assert.ok(await nextScheduledWake(owner(3), generation, 0));
  assert.equal(await claimScheduledCycle(owner(3), randomUUID(), 0), null);
  await updateRecord(owner(3), 'profile', savedProfile.id, { ...savedProfile.data, discoveryConsent: false, cadence: 'manual' }, savedProfile.version);
  assert.equal(await nextScheduledWake(owner(3), generation, 0), null);
  assert.equal(await claimScheduledCycle(owner(3), generation, 0), null);
  const stopped = await syncDiscoverySchedule(owner(3));
  assert.equal(stopped?.data.status, 'inactive'); assert.notEqual(stopped?.data.generation, schedule.data.generation);
  assert.equal((await listRecords(owner(3), 'discovery_run')).length, 1);
});

test('duplicate durable workflow deliveries advance only one owner cycle', async () => {
  const savedProfile = await profile(owner(4), { discoveryConsent: true, cadence: 'weekly' });
  const generation = randomUUID();
  await createRecord<DiscoveryScheduleData>(owner(4), 'discovery_run', { type: 'schedule', status: 'active', generation, fingerprint: preferenceFingerprint(savedProfile.data), cadence: 'weekly', nextRunAt: new Date(Date.now() - 1000).toISOString(), workflowRunId: null, sequence: 0, error: null }, { id: discoveryRecordId(owner(4), 'discovery-schedule') });
  const cycles = await Promise.all([claimScheduledCycle(owner(4), generation, 0), claimScheduledCycle(owner(4), generation, 0)]);
  assert.equal(cycles.filter(Boolean).length, 1);
  const cycle = cycles.find(Boolean)!;
  const current = await getRecord<DiscoveryScheduleData>(owner(4), 'discovery_run', discoveryRecordId(owner(4), 'discovery-schedule'));
  assert.equal(current.data.sequence, 1);
  assert.ok(Date.parse(current.data.nextRunAt!) - Date.now() > 6 * 86400000);
  const result = await performDiscoveryRun(owner(4), cycle.runId!, async () => []);
  assert.equal(result.data.status, 'succeeded');
});

test('orphaned queued searches reconcile to a retryable failure instead of searching forever', async () => {
  await profile(owner(5));
  const { run } = await createDiscoveryRun(owner(5), randomUUID(), 'manual');
  await withOwnerTransaction(owner(5), async () => { await currentClient().query("UPDATE tracker.records SET updated_at = now() - interval '5 minutes' WHERE owner_id=$1 AND id=$2", [owner(5), run.id]); });
  const failed = await reconcileDiscoveryRun(owner(5), await getRecord<DiscoveryRunData>(owner(5), 'discovery_run', run.id));
  assert.equal(failed.data.status, 'failed'); assert.match(failed.data.error!, /new search/i);
  let requests = 0; await performDiscoveryRun(owner(5), run.id, async () => { requests++; return []; });
  assert.equal(requests, 0);
});

test('missing provider configuration preserves preferences and reports an inactive paid service honestly', async () => {
  await profile(owner(6), { discoveryConsent: true, cadence: 'daily' });
  Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
  try {
    await assert.rejects(createDiscoveryRun(owner(6), randomUUID(), 'manual'), { status: 503 });
    const schedule = await syncDiscoverySchedule(owner(6));
    assert.equal(schedule?.data.status, 'failed'); assert.match(schedule?.data.error!, /configured/);
    assert.equal((await discoveryOverview(owner(6))).configured, false);
  } finally { process.env.OPENAI_API_KEY = 'test-only-never-sent'; }
});


test('old queued hosted searches are cancelled instead of silently switching billing', async () => {
  await profile(owner(6));
  const { run } = await createDiscoveryRun(owner(6), randomUUID(), 'manual');
  await updateRecord(owner(6), 'discovery_run', run.id, { ...run.data, provider: undefined, connectionId: randomUUID(), connectionGeneration: 1 }, run.version);
  let requests = 0;
  const result = await performDiscoveryRun(owner(6), run.id, async () => { requests++; return [job]; });
  assert.equal(result.data.status, 'cancelled');
  assert.equal(requests, 0);
  assert.equal((await listRecords(owner(6), 'job_match')).length, 0);
  assert.match(result.data.error!, /provider changed/i);
});
