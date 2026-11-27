import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { setPoolForTests, currentClient, withOwnerTransaction } from '../src/lib/tracker/db';
import { createRecord, getRecord, listRecords, saveUser } from '../src/lib/tracker/store';
import { executeAction, getSnapshot } from '../src/lib/tracker/service';
import type { Application, StoredRecord } from '../src/lib/tracker/types';
import type { Analysis, GeneratedResume } from '../src/app/types';
import { executeResumeAction, listResumeSummaries, listResumeWorkspace, stableResumeId } from '../src/lib/resume-workspace/service';
import { persistResumeResult } from '../src/lib/resume-workspace/persistence';
import { completeAnswers } from '../src/lib/resume-workspace/validation';
import type { ResumeAnalysis, ResumeDraft, ResumeJob, ResumeVersion, SourceResume } from '../src/lib/resume-workspace/types';

const alice = { id: 'a1000000-0000-4000-8000-000000000001', email: 'alice@resumes.test', name: 'Alice' };
const bob = { id: 'b1000000-0000-4000-8000-000000000001', email: 'bob@resumes.test', name: 'Bob' };
const analysis: Analysis = { score: 83, matchedSkills: [{ name: 'TypeScript', match: true }], missingSkills: ['PostgreSQL'], recommendations: { improvements: ['Add concrete database project evidence.'], strengths: ['Frontend experience'], skillGaps: [], format: [] }, detailedAnalysis: 'This resume is a strong fit for the role.' };
const answers = { fullName: 'Alice Example', contactDetails: 'alice@resumes.test', targetTitle: 'Software engineer' };
const generated: GeneratedResume = { latex: '\\documentclass{article}\n\\begin{document}Alice\\end{document}', preview: { fullName: 'Alice Example', headline: 'Software engineer', contact: ['alice@resumes.test'], sections: [], skillGroups: [{ label: 'Languages', skills: ['TypeScript'] }] }, tailoringNotes: ['Emphasizes role evidence.'], assumptions: [], followUpQuestions: [] };
const generationRequestKey = 'c1000000-0000-4000-8000-000000000001';

let database: PGlite;
let firstApp: Application;
let secondApp: Application;
let bobApp: Application;
let source: StoredRecord<SourceResume>;
let savedAnalysis: StoredRecord<ResumeAnalysis>;
let generationJob: StoredRecord<ResumeJob>;
let generatedVersion: StoredRecord<ResumeVersion>;

function jobInput(operation: 'analyze' | 'generate', overrides: Partial<ResumeJob> = {}): ResumeJob {
  return {
    type: operation === 'analyze' ? 'analysis' : 'generation', input: {}, operation, status: 'running',
    sourceResumeId: source.id, analysisId: operation === 'analyze' ? null : savedAnalysis.id,
    sourceText: source.data.text, jobDescription: firstApp.jobDescription,
    ...(operation === 'generate' ? { analysis } : {}), answers: operation === 'analyze' ? {} : completeAnswers(analysis, firstApp.jobDescription, answers).answers,
    resultId: null, error: null, runId: 'completed-test-workflow', attempts: 1, attemptToken: 'test-attempt-1', ...overrides,
  };
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'test-only' });
  database = new PGlite();
  await database.exec(await readFile(new URL('../drizzle/0000_tracker.sql', import.meta.url), 'utf8'));
  await database.exec('SET ROLE vibecheck_app');
  let queue = Promise.resolve();
  const pool = { connect: async () => {
    const previous = queue; let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; }); await previous;
    return { query: async (query: string, values?: unknown[]) => database.query(query, values), release };
  } };
  setPoolForTests(pool as unknown as Pool);
  await saveUser(alice, 'https://issuer.test/', 'alice');
  await saveUser(bob, 'https://issuer.test/', 'bob');
  firstApp = await executeAction(alice.id, 'create_application', { company: 'Acme', role: 'Software engineer', jobDescription: 'Build accessible TypeScript applications and PostgreSQL services.' }, 'resume-first-app') as Application;
  secondApp = await executeAction(alice.id, 'create_application', { company: 'Other company', role: 'Data analyst', jobDescription: 'Analyze complex datasets for business decisions.' }, 'resume-second-app') as Application;
  bobApp = await executeAction(bob.id, 'create_application', { company: 'Acme', role: 'Software engineer' }, 'bob-resume-app') as Application;
  source = await createRecord<SourceResume>(alice.id, 'source_resume', { filename: 'alice.txt', mimeType: 'text/plain', size: 120, storagePath: `${alice.id}/original.txt`, text: 'Alice built production TypeScript software and led an accessible design project.' });
});
after(async () => { await database?.close(); });

test('completed analysis persists across reads and remains bound to its source and application', async () => {
  const job = await createRecord<ResumeJob>(alice.id, 'ai_job', jobInput('analyze'), { applicationId: firstApp.id });
  const result = await persistResumeResult(alice.id, job.id, job.data.attemptToken, analysis);
  assert.equal(result.status, 'succeeded');
  savedAnalysis = await getRecord<ResumeAnalysis>(alice.id, 'analysis', result.resultId!);
  assert.equal(savedAnalysis.applicationId, firstApp.id);
  assert.equal(savedAnalysis.data.sourceText, source.data.text);
  assert.equal(savedAnalysis.data.jobDescription, firstApp.jobDescription);
  assert.deepEqual(savedAnalysis.data.analysis, analysis);
  const reloaded = await listResumeWorkspace(alice.id, firstApp.id);
  assert.equal(reloaded.analyses[0].id, savedAnalysis.id);
  await assert.rejects(executeResumeAction(bob.id, 'get_resume', { id: savedAnalysis.id, kind: 'analysis' }), { status: 404 });
  await assert.rejects(executeResumeAction(alice.id, 'get_resume_questions', { applicationId: secondApp.id, analysisId: savedAnalysis.id }), { status: 404 });
});

test('saved answers restore after reads; concurrent editors cannot overwrite each other', async () => {
  const input = { applicationId: firstApp.id, analysisId: savedAnalysis.id, answers };
  const original = await executeResumeAction(alice.id, 'save_resume_draft', input) as StoredRecord<ResumeDraft>;
  const same = await executeResumeAction(alice.id, 'save_resume_draft', input);
  assert.deepEqual(same, original);
  const editors = await Promise.allSettled([
    executeResumeAction(alice.id, 'save_resume_draft', { ...input, answers: { ...answers, fullName: 'Alice Updated' }, expectedVersion: 1 }),
    executeResumeAction(alice.id, 'save_resume_draft', { ...input, answers: { ...answers, fullName: 'Stale Editor' }, expectedVersion: 1 }),
  ]);
  assert.equal(editors.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = editors.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  const restored = await executeResumeAction(alice.id, 'get_resume_questions', { applicationId: firstApp.id, analysisId: savedAnalysis.id }) as { answers: Record<string, string>; draft: StoredRecord<ResumeDraft> };
  assert.equal(restored.answers.fullName, 'Alice Updated');
  assert.equal(restored.draft.version, 2);
  assert.equal((await listRecords(alice.id, 'builder_draft', { applicationId: firstApp.id })).length, 1);
  await assert.rejects(executeResumeAction(bob.id, 'save_resume_draft', { ...input, applicationId: bobApp.id }), { status: 404 });
  await assert.rejects(executeResumeAction(alice.id, 'save_resume_draft', { ...input, applicationId: secondApp.id }), { status: 404 });
});

test('generation checkpoints preserve exact source, analysis, answers and job-description snapshots', async () => {
  generationJob = await createRecord<ResumeJob>(alice.id, 'ai_job', jobInput('generate'), { applicationId: firstApp.id, id: stableResumeId(alice.id, `job:${generationRequestKey}`) });
  await executeAction(alice.id, 'update_application', { id: firstApp.id, expectedVersion: firstApp.version, jobDescription: 'A new job description entered after generation started.' }, 'change-jd-after-start');
  const results = await Promise.all([
    persistResumeResult(alice.id, generationJob.id, generationJob.data.attemptToken, generated),
    persistResumeResult(alice.id, generationJob.id, generationJob.data.attemptToken, generated),
  ]);
  assert.equal(results[0].resultId, results[1].resultId);
  const versions = await listRecords<ResumeVersion>(alice.id, 'resume_version', { applicationId: firstApp.id });
  assert.equal(versions.length, 1);
  generatedVersion = versions[0];
  assert.equal(generatedVersion.data.jobDescription, firstApp.jobDescription);
  assert.equal(generatedVersion.data.sourceText, source.data.text);
  assert.deepEqual(generatedVersion.data.analysis, analysis);
  assert.deepEqual(generatedVersion.data.answers, generationJob.data.answers);
  assert.deepEqual(generatedVersion.data.generatedResume, generated);
  assert.equal((await getRecord<ResumeJob>(alice.id, 'ai_job', generationJob.id)).data.status, 'succeeded');
  const replay = await persistResumeResult(alice.id, generationJob.id, generationJob.data.attemptToken, { ...generated, latex: 'A later provider response must not overwrite the original.' });
  assert.equal(replay.resultId, generatedVersion.id);
  assert.equal((await getRecord<ResumeVersion>(alice.id, 'resume_version', generatedVersion.id)).data.generatedResume.latex, generated.latex);
  const retriedRequest = await executeResumeAction(alice.id, 'generate_resume', { applicationId: firstApp.id, analysisId: savedAnalysis.id, answers, idempotencyKey: generationRequestKey }) as StoredRecord<ResumeJob>;
  assert.equal(retriedRequest.id, generationJob.id);
  assert.equal(retriedRequest.data.status, 'succeeded');
});

test('superseded attempts and invalid outputs cannot create partial or duplicate result records', async () => {
  const superseded = await persistResumeResult(alice.id, generationJob.id, 'old-attempt-token', generated);
  assert.equal(superseded.status, 'superseded');
  const invalidJob = await createRecord<ResumeJob>(alice.id, 'ai_job', jobInput('generate', { attemptToken: 'invalid-output-attempt' }), { applicationId: firstApp.id });
  await assert.rejects(persistResumeResult(alice.id, invalidJob.id, invalidJob.data.attemptToken, { latex: 'missing preview' } as GeneratedResume));
  await assert.rejects(getRecord(alice.id, 'resume_version', stableResumeId(alice.id, `result:${invalidJob.id}`)), { status: 404 });
  assert.equal((await getRecord<ResumeJob>(alice.id, 'ai_job', invalidJob.id)).data.status, 'running');
  assert.equal((await listRecords(alice.id, 'resume_version')).length, 1);
});

test('submitted resume selection is retry-safe and rejects cross-user or cross-application versions', async () => {
  const application = await getRecord(alice.id, 'application', firstApp.id);
  const selected = await executeResumeAction(alice.id, 'select_submitted_resume', { applicationId: firstApp.id, versionId: generatedVersion.id, expectedVersion: application.version }) as StoredRecord<{ submittedResumeVersionId: string | null; submittedSourceResumeId?: string | null }>;
  const repeated = await executeResumeAction(alice.id, 'select_submitted_resume', { applicationId: firstApp.id, versionId: generatedVersion.id, expectedVersion: application.version });
  assert.deepEqual(selected, repeated);
  assert.equal(selected.data.submittedResumeVersionId, generatedVersion.id);
  assert.equal(selected.data.submittedSourceResumeId, null);

  const currentSelected = await executeResumeAction(alice.id, 'select_current_resume', { applicationId: firstApp.id, sourceResumeId: source.id, expectedVersion: selected.version }) as StoredRecord<{ submittedResumeVersionId: string | null; submittedSourceResumeId?: string | null }>;
  assert.equal(currentSelected.data.submittedSourceResumeId, source.id);
  assert.equal(currentSelected.data.submittedResumeVersionId, null);
  const currentRepeated = await executeResumeAction(alice.id, 'select_current_resume', { applicationId: firstApp.id, sourceResumeId: source.id, expectedVersion: currentSelected.version });
  assert.deepEqual(currentSelected, currentRepeated);
  await assert.rejects(executeResumeAction(bob.id, 'select_current_resume', { applicationId: bobApp.id, sourceResumeId: source.id, expectedVersion: 1 }), { status: 404 });

  await assert.rejects(executeResumeAction(alice.id, 'select_submitted_resume', { applicationId: secondApp.id, versionId: generatedVersion.id, expectedVersion: 1 }), { status: 404 });
  await assert.rejects(executeResumeAction(bob.id, 'select_submitted_resume', { applicationId: bobApp.id, versionId: generatedVersion.id, expectedVersion: 1 }), { status: 404 });
  await assert.rejects(executeResumeAction(bob.id, 'get_ai_job', { id: generationJob.id }), { status: 404 });
  await withOwnerTransaction(bob.id, async () => {
    const rows = await currentClient().query('SELECT * FROM tracker.records WHERE id=ANY($1::uuid[])', [[generatedVersion.id, savedAnalysis.id, generationJob.id, source.id]]);
    assert.equal(rows.rows.length, 0);
  });
});

test('workspace and library return compact artifact summaries while explicit record reads retain full content', async () => {
  const hugeVersion: ResumeVersion = { ...generatedVersion.data, label: 'Large saved version', sourceText: 'SOURCE_SECRET_'.repeat(12000), jobDescription: 'JOB_SECRET_'.repeat(12000), answers: { fullName: 'PRIVATE_ANSWER_'.repeat(10000) }, generatedResume: { ...generated, latex: 'LATEX_SECRET_'.repeat(12000) } };
  const large = await createRecord<ResumeVersion>(alice.id, 'resume_version', hugeVersion, { applicationId: firstApp.id });
  const snapshot = await getSnapshot(alice.id);
  const serialized = JSON.stringify(snapshot);
  assert.ok(serialized.length < 20000, `Expected compact metadata, received ${serialized.length} bytes`);
  for (const secret of ['SOURCE_SECRET_', 'JOB_SECRET_', 'PRIVATE_ANSWER_', 'LATEX_SECRET_']) assert.equal(serialized.includes(secret), false);
  assert.equal(snapshot.versions.find(version => version.id === large.id)?.label, 'Large saved version');
  assert.equal('answers' in snapshot.drafts[0], false);
  const library = await listResumeSummaries(alice.id);
  assert.ok(JSON.stringify(library).length < 20000);
  assert.equal(library.summariesOnly, true);
  const read = await executeResumeAction(alice.id, 'get_resume', { id: large.id, kind: 'resume_version' }) as StoredRecord<ResumeVersion>;
  assert.equal(read.data.generatedResume.latex, hugeVersion.generatedResume.latex);
  assert.equal((await listResumeSummaries(bob.id)).versions.length, 0);
});
