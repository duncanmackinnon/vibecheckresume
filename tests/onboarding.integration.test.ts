import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { setPoolForTests, currentClient, withOwnerTransaction } from '../src/lib/tracker/db';
import { getRecord, listRecords, saveUser } from '../src/lib/tracker/store';
import { getSnapshot } from '../src/lib/tracker/service';
import { createOnboardingProfile } from '../src/lib/onboarding/types';
import { getOnboardingProfile, saveOnboarding, onboardingState } from '../src/lib/onboarding/service';
import { createStarterResumeAnswers } from '../src/lib/onboarding/starter-resume';
import { downloadResume } from '../src/lib/resume-workspace/service';
import { runTool } from '../src/lib/assistant/tools';
import { databaseReadiness } from '../src/lib/tracker/readiness';

const alice = {id:'a0000000-0000-4000-8000-000000000001', email:'alice@example.test', name:'Auth0 name'};
const bob = {id:'b0000000-0000-4000-8000-000000000001', email:'bob@example.test', name:'Bob'};
let db: PGlite;
before(async () => {
  Object.assign(process.env, {NODE_ENV:'test', DATABASE_URL:'test-only'});
  db = new PGlite();
  for (const file of ['0000_tracker.sql', '0001_onboarding_discovery.sql','0002_accounts_persistence.sql']) await db.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  await db.exec('SET ROLE vibecheck_app');
  let queue = Promise.resolve();
  setPoolForTests({connect: async () => {
    const previous = queue; let release!: () => void; queue = new Promise<void>(resolve => {release = resolve;}); await previous;
    return {query: (text: string, values?: unknown[]) => db.query(text, values), release};
  }} as unknown as Pool);
  await saveUser(alice, 'https://issuer.test/', 'alice'); await saveUser(bob, 'https://issuer.test/', 'bob');
});
after(async () => {await db?.close();});

function profileInput() { const {completedAt: _completedAt, ...input} = createOnboardingProfile('Alex'); return input; }
test('the real migrated ownership policies pass the restricted-role readiness probe',async()=>{
  assert.deepEqual(await databaseReadiness(),{ready:true,reason:'ready'});
});
test('ChatGPT reads only its owner’s preferences and saves web-search leads without OpenAI approval or an API key',async()=>{
  delete process.env.OPENAI_API_KEY;
  const searchOwner='c0000000-0000-4000-8000-000000000001',otherOwner='d0000000-0000-4000-8000-000000000001';
  await saveUser({id:searchOwner,email:'search@example.test',name:'Search'},'https://issuer.test/','search');
  await saveUser({id:otherOwner,email:'other@example.test',name:'Other'},'https://issuer.test/','other');
  const input={...profileInput(),preferences:{roles:'Engineer',locations:'Toronto',workModes:['remote'],employmentTypes:[],additionalContext:''}};
  await saveOnboarding(searchOwner,{action:'save_profile',input,idempotencyKey:randomUUID()});
  const result=await runTool(searchOwner,'get_search_preferences',{},'prefs');
  assert.equal((result as {preferences:{roles:string}}).preferences.roles,'Engineer');
  const other=await runTool(otherOwner,'get_search_preferences',{},'prefs') as {preferences:unknown;websiteUrl:string};
  assert.equal(other.preferences,null);assert.ok(other.websiteUrl.endsWith('/onboarding?edit=preferences'));
  const request={company:'Sourced employer',role:'Engineer',jobUrl:'https://jobs.example/engineer',idempotencyKey:randomUUID()};
  const saved=await runTool(searchOwner,'create_application',request,'create') as {id:string;stage:string};
  assert.equal(saved.stage,'Saved');
  assert.equal((await runTool(searchOwner,'create_application',request,'retry') as {id:string}).id,saved.id);
  await assert.rejects(getRecord(otherOwner,'application',saved.id));
});
test('unfinished onboarding resumes privately across devices with retry and conflict protection',async()=>{
  const input={profile:createOnboardingProfile(),screen:'build',answers:{...createStarterResumeAnswers(),email:'unfinished@'},builtResume:false};
  const request={action:'save_draft',input,idempotencyKey:randomUUID()};
  const first=await saveOnboarding(alice.id,request);
  assert.ok('draft' in first);
  assert.ok(first.draft);
  assert.deepEqual(await saveOnboarding(alice.id,request),first);
  assert.equal((await onboardingState(alice.id)).draft?.data.answers.email,'unfinished@');
  assert.equal((await onboardingState(bob.id)).draft,null);
  await assert.rejects(getRecord(bob.id,'onboarding_draft',first.draft.id),{status:404});
  await assert.rejects(saveOnboarding(alice.id,{...request,idempotencyKey:randomUUID()}),{status:409});
  await saveOnboarding(alice.id,{...request,expectedVersion:first.draft.version,idempotencyKey:randomUUID()});
  await assert.rejects(saveOnboarding(alice.id,{...request,expectedVersion:first.draft.version,idempotencyKey:randomUUID()}),{status:409});
  await assert.rejects(saveOnboarding(alice.id,{...request,input:{...input,answers:{...input.answers,summary:'x'.repeat(4001)}},idempotencyKey:randomUUID()}));
});
test('profile reload, retry and Auth0 name refresh preserve the chosen portal name', async () => {
  const request = {action:'save_profile', input:{...profileInput(), step:'resume'}, idempotencyKey:randomUUID()};
  const saved = await saveOnboarding(alice.id, request);
  assert.deepEqual(await saveOnboarding(alice.id, request), saved);
  assert.equal((await listRecords(alice.id, 'profile')).length, 1);
  assert.equal((await getOnboardingProfile(alice.id))?.data.displayName, 'Alex');
  assert.equal(await getOnboardingProfile(bob.id), null);
  await saveUser({...alice, name:'Name from identity provider'}, 'https://issuer.test/', 'alice');
  assert.equal((await getSnapshot(alice.id)).user.name, 'Alex');
  const profile = saved.profile!;
  await assert.rejects(saveOnboarding(alice.id, {...request, input:{...request.input, displayName:'Changed'}}), {status:409});
  await assert.rejects(saveOnboarding(alice.id, {...request, idempotencyKey:randomUUID()}), {status:409});
  await saveOnboarding(alice.id, {...request, expectedVersion:profile.version, idempotencyKey:randomUUID()});
  await assert.rejects(saveOnboarding(alice.id, {...request, expectedVersion:profile.version, idempotencyKey:randomUUID()}), {status:409});
});

test('starter resumes derive from answers, download privately without Storage and replay once', async () => {
  const answers = {...createStarterResumeAnswers('Alex'), email:'alex@example.test', skills:'TypeScript, Research'};
  const request = {action:'save_starter_resume', input:{answers}, idempotencyKey:randomUUID()};
  const saved = await saveOnboarding(alice.id, request);
  assert.ok('resume' in saved);
  assert.deepEqual(await saveOnboarding(alice.id, request), saved);
  assert.equal((await listRecords(alice.id, 'source_resume')).length, 1);
  const source = saved.resume;
  assert.ok(source);
  assert.equal(source.data.origin, 'builder');
  assert.equal(source.data.storagePath, '');
  assert.match(source.data.text, /TypeScript/);
  assert.equal(source.data.generatedResume.preview.fullName, 'Alex');
  const file = await downloadResume(alice.id, source.id);
  assert.match(await file.data.text(), /alex@example.test/);
  await assert.rejects(downloadResume(bob.id, source.id), {status:404});
  await assert.rejects(getRecord(bob.id, 'source_resume', source.id), {status:404});
  await assert.rejects(saveOnboarding(bob.id, {action:'save_profile', input:{...profileInput(), sourceResumeId:source.id}, idempotencyKey:randomUUID()}), {status:404});
  await assert.rejects(saveOnboarding(alice.id, {...request, input:{answers, sourceText:'untrusted'}, idempotencyKey:randomUUID()}));
});

test('completion requires an owned resume and desired roles; scheduling requires explicit opt-in', async () => {
  const profile = (await getOnboardingProfile(alice.id))!;
  const {completedAt: _completedAt, ...input} = profile.data;
  const request = {action:'save_profile', input:{...input, step:'complete'}, expectedVersion:profile.version, idempotencyKey:randomUUID()};
  await assert.rejects(saveOnboarding(alice.id, request));
  const source = (await listRecords(alice.id, 'source_resume'))[0];
  const complete = {...request, input:{...request.input, sourceResumeId:source.id, resumePath:'build', preferences:{...input.preferences, roles:'Product designer'}}};
  await assert.rejects(saveOnboarding(alice.id, {...complete, input:{...complete.input, cadence:'daily', discoveryConsent:false}}));
  const saved = await saveOnboarding(alice.id, complete);
  assert.ok(saved.profile?.data.completedAt);
  assert.equal(saved.profile?.data.cadence, 'manual');
  assert.equal(saved.profile?.data.discoveryConsent, false);
  assert.equal((await getSnapshot(alice.id)).onboarding?.data.step, 'complete');
});

test('profile and generated source rows remain protected by PostgreSQL ownership policies', async () => {
  const profile = (await getOnboardingProfile(alice.id))!;
  await withOwnerTransaction(bob.id, async () => {
    assert.equal((await currentClient().query('SELECT * FROM tracker.records WHERE id=$1', [profile.id])).rows.length, 0);
  });
  await assert.rejects(withOwnerTransaction(bob.id, async () => {
    await currentClient().query("INSERT INTO tracker.records(id,owner_id,kind,data) VALUES($1,$2,'profile','{}')", [randomUUID(), alice.id]);
  }), /row-level security/i);
});

