/** @jest-environment node */
import type { StoredRecord } from '@/lib/tracker/types';
import type { Analysis, GeneratedResume } from '@/app/types';
import { completeResumeUpload, executeResumeAction, importLegacyResume, prepareResumeUpload, reconcileResumeJob, resumeDownloadLink, stableResumeId } from '../service';
import { createHash } from 'node:crypto';
import { persistResumeResult } from '../persistence';
import { validateUpload } from '../validation';
import type { ResumeJob } from '../types';

const mockRecords = new Map<string, StoredRecord<unknown>>();
const mockOperations = new Map<string, { input: unknown; result: unknown }>();
const mockDownload = jest.fn();
const mockSignedUpload = jest.fn();
const mockReadUpload = jest.fn();
const mockWorkflowStatus = jest.fn();
jest.mock('@/lib/tracker/store', () => ({
  withOwnerTransaction: jest.fn(async (_owner: string, operation: () => Promise<unknown>) => operation()),
  idempotent: jest.fn(async (ownerId: string, key: string, _operation: string, input: unknown, callback: () => Promise<unknown>) => {
    const stored = mockOperations.get(`${ownerId}:${key}`);
    if (stored) { if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw Object.assign(new Error('Idempotency conflict'), { status: 409 }); return stored.result; }
    const result = await callback(); mockOperations.set(`${ownerId}:${key}`, { input, result }); return result;
  }),
  getRecord: jest.fn(async (ownerId: string, kind: string, id: string) => {
    const record = mockRecords.get(id);
    if (!record || record.ownerId !== ownerId || record.kind !== kind) throw Object.assign(new Error('Not found'), { status: 404 });
    return structuredClone(record);
  }),
  listRecords: jest.fn(async (ownerId: string, kind: string) => [...mockRecords.values()].filter(record => record.ownerId === ownerId && record.kind === kind).map(record => structuredClone(record))),
  createRecord: jest.fn(async (ownerId: string, kind: string, data: unknown, options: { id: string; applicationId?: string }) => {
    const record = { id: options.id, ownerId, kind, applicationId: options.applicationId || null, data: structuredClone(data), version: 1, createdAt: '2026-09-13T12:00:00Z', updatedAt: '2026-09-13T12:00:00Z' } as StoredRecord<unknown>;
    if (mockRecords.has(record.id)) throw new Error('Duplicate record');
    mockRecords.set(record.id, record); return structuredClone(record);
  }),
  updateRecord: jest.fn(async (ownerId: string, kind: string, id: string, data: unknown, version: number) => {
    const record = mockRecords.get(id);
    if (!record || record.ownerId !== ownerId || record.kind !== kind) throw Object.assign(new Error('Not found'), { status: 404 });
    if (record.version !== version) throw Object.assign(new Error('Conflict'), { status: 409 });
    const next = { ...record, data: structuredClone(data), version: version + 1 };
    mockRecords.set(id, next); return structuredClone(next);
  }),
}));
jest.mock('@/lib/tracker/service', () => ({ getApplication: jest.fn(async (owner: string, id: string) => {
  const record = mockRecords.get(id);
  if (!record || record.ownerId !== owner || record.kind !== 'application') throw Object.assign(new Error('Not found'), { status: 404 });
  return { ...record, ...(record.data as object) };
}) }));
jest.mock('../storage', () => ({ privateResumeStorage: () => ({ download: (...args: unknown[]) => mockDownload(...args), createSignedUploadUrl: (...args: unknown[]) => mockSignedUpload(...args), createSignedUrl: jest.fn() }), readUpload: (...args: unknown[]) => mockReadUpload(...args) }));
jest.mock('workflow/api', () => ({ getRun: () => ({ get status() { return mockWorkflowStatus(); } }) }));

const owner = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const appId = '20000000-0000-4000-8000-000000000001';
const otherAppId = '20000000-0000-4000-8000-000000000002';
const analysisId = '30000000-0000-4000-8000-000000000001';
const jobId = '40000000-0000-4000-8000-000000000001';
const analysis: Analysis = { score: 72, matchedSkills: [{ name: 'TypeScript', match: true }], missingSkills: [], recommendations: { improvements: [], strengths: [], skillGaps: [], format: [] }, detailedAnalysis: 'A strong fit for this role.' };
const generated: GeneratedResume = { latex: '\\documentclass{article}', preview: { fullName: 'A Person', contact: ['person@example.com'], sections: [], skillGroups: [] }, tailoringNotes: [], assumptions: [], followUpQuestions: [] };
const answers = { fullName: 'A Person', contactDetails: 'person@example.com', targetTitle: 'Engineer' };
function seed(id: string, kind: StoredRecord<unknown>['kind'], data: unknown, applicationId: string | null = appId, recordOwner = owner) {
  mockRecords.set(id, { id, kind, data: structuredClone(data), ownerId: recordOwner, applicationId, version: 1, createdAt: '2026-09-13T12:00:00Z', updatedAt: '2026-09-13T12:00:00Z' });
}
function seedJob() {
  const job: ResumeJob = { type: 'generation', input: {}, operation: 'generate', status: 'running', analysisId, sourceResumeId: null, sourceText: 'Original source text', jobDescription: 'The job description at generation time', analysis, answers, resultId: null, error: null, runId: 'run-1', attempts: 1, attemptToken: 'attempt-1' };
  seed(jobId, 'ai_job', job);
}

beforeEach(() => {
  mockRecords.clear();
  mockOperations.clear();
  mockDownload.mockReset(); mockSignedUpload.mockReset(); mockReadUpload.mockReset(); mockWorkflowStatus.mockReset();
  seed(appId, 'application', { company: 'Acme', role: 'Engineer', jobDescription: 'Build reliable software and services.' }, null);
  seed(otherAppId, 'application', { company: 'Other', role: 'Analyst', jobDescription: 'Analyze useful business data.' }, null);
  seed(analysisId, 'analysis', { analysis, sourceResumeId: null, sourceText: 'Original source text', jobDescription: 'Build reliable software and services.' });
});

test('owned resume reads reject another account', async () => {
  await expect(executeResumeAction(outsider, 'get_resume', { id: analysisId, kind: 'analysis' })).rejects.toMatchObject({ status: 404 });
});

test('generation cannot attach an analysis from a different application', async () => {
  await expect(executeResumeAction(owner, 'generate_resume', { applicationId: otherAppId, analysisId, answers, idempotencyKey: jobId })).rejects.toMatchObject({ status: 404 });
});

test('missing builder evidence returns questions before creating an AI job', async () => {
  const response = await executeResumeAction(owner, 'generate_resume', { applicationId: appId, analysisId, answers: {}, idempotencyKey: jobId });
  expect(response).toMatchObject({ status: 'needs_answers', questions: expect.arrayContaining([expect.objectContaining({ id: 'fullName' })]) });
  expect([...mockRecords.values()].filter(record => record.kind === 'ai_job')).toHaveLength(0);
});

test('workflow replay creates one immutable version with its original input snapshots', async () => {
  seedJob();
  const first = await persistResumeResult(owner, jobId, 'attempt-1', generated);
  const replay = await persistResumeResult(owner, jobId, 'attempt-1', { ...generated, latex: 'changed provider response' });
  expect(replay.resultId).toBe(first.resultId);
  const versions = [...mockRecords.values()].filter(record => record.kind === 'resume_version');
  expect(versions).toHaveLength(1);
  expect(versions[0].data).toMatchObject({ sourceText: 'Original source text', jobDescription: 'The job description at generation time', answers, generatedResume: generated });
  expect(mockRecords.get(jobId)?.data).toMatchObject({ status: 'succeeded', resultId: first.resultId });
});

test('a stale workflow attempt cannot overwrite the retry result', async () => {
  seedJob();
  expect(await persistResumeResult(owner, jobId, 'superseded-attempt', generated)).toEqual({ status: 'superseded' });
  expect([...mockRecords.values()].filter(record => record.kind === 'resume_version')).toHaveLength(0);
});

test('draft writes reject stale versions without losing the saved answers', async () => {
  await executeResumeAction(owner, 'save_resume_draft', { applicationId: appId, analysisId, answers });
  await executeResumeAction(owner, 'save_resume_draft', { applicationId: appId, analysisId, answers: { ...answers, fullName: 'Updated Name' }, expectedVersion: 1 });
  await expect(executeResumeAction(owner, 'save_resume_draft', { applicationId: appId, analysisId, answers, expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
  expect(mockRecords.get(stableResumeId(owner, `draft:${analysisId}`))?.data).toMatchObject({ answers: { fullName: 'Updated Name' } });
});

test('legacy import requires exact company/role and never implicitly attaches a generated resume', async () => {
  await expect(importLegacyResume(owner, { applicationId: appId, company: 'Wrong', role: 'Engineer', confirmed: true, attachGenerated: false, analysis, jobDescription: '', answers })).rejects.toMatchObject({ status: 409 });
  await importLegacyResume(owner, { applicationId: appId, company: 'Acme', role: 'Engineer', confirmed: true, attachGenerated: false, analysis, jobDescription: '', answers, generatedResume: generated });
  expect([...mockRecords.values()].filter(record => record.kind === 'resume_version')).toHaveLength(0);
  await expect(importLegacyResume(owner, { applicationId: otherAppId, company: 'Other', role: 'Analyst', confirmed: true, attachGenerated: false, analysis, jobDescription: '', answers })).rejects.toMatchObject({ status: 409 });
});

test('uploads reject oversize and mismatched file types', () => {
  expect(() => validateUpload({ name: 'resume.pdf', type: 'application/pdf', size: 8 * 1024 * 1024 + 1 } as File)).toThrow('8 MB');
  expect(() => validateUpload({ name: 'resume.exe', type: 'application/pdf', size: 100 } as File)).toThrow('Unsupported');
  expect(validateUpload({ name: 'resume.txt', type: 'text/plain', size: 100 } as File)).toBe('text/plain');
});

test('signed upload prepares an owner-scoped path and rejects reusing its request key for different bytes', async () => {
  mockSignedUpload.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed-path' }, error: null });
  const input = { filename: 'resume.txt', mimeType: 'text/plain', size: 30, sha256: 'a'.repeat(64), idempotencyKey: jobId };
  await prepareResumeUpload(owner, input);
  expect(mockSignedUpload).toHaveBeenCalledWith(`${owner}/${stableResumeId(owner, `upload:${jobId}`)}.txt`, { upsert: false });
  await expect(prepareResumeUpload(owner, { ...input, sha256: 'b'.repeat(64) })).rejects.toMatchObject({ status: 409 });
});

test('upload completion validates stored byte digest and cannot read another owner’s upload', async () => {
  const bytes = new TextEncoder().encode('Resume evidence and employment history');
  const input = { filename: 'resume.txt', mimeType: 'text/plain', size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), idempotencyKey: jobId };
  mockDownload.mockResolvedValue({ data: new Blob([bytes]), error: null });
  mockReadUpload.mockResolvedValue({ text: 'Resume evidence and employment history' });
  const first = await completeResumeUpload(owner, input);
  const retry = await completeResumeUpload(owner, input);
  expect(retry.id).toBe(first.id);
  expect(mockDownload).toHaveBeenCalledTimes(1);
  await expect(resumeDownloadLink(outsider, first.id)).rejects.toMatchObject({ status: 404 });
  const changedKey = '40000000-0000-4000-8000-000000000003';
  await expect(completeResumeUpload(owner, { ...input, idempotencyKey: changedKey, sha256: 'b'.repeat(64) })).rejects.toMatchObject({ status: 409 });
});

test('an interrupted workflow exposes a safe retry state and preserves snapshot inputs', async () => {
  seedJob();
  mockWorkflowStatus.mockResolvedValue('cancelled');
  const job = mockRecords.get(jobId) as StoredRecord<ResumeJob>;
  job.updatedAt = '2020-01-01T00:00:00Z';
  const updated = await reconcileResumeJob(owner, job);
  expect(updated.data).toMatchObject({ status: 'failed', sourceText: 'Original source text', answers });
  expect(updated.data.error).toMatch(/interrupted/);
});

test('retrying an old job consumes today’s quota, even when the job was created years ago', async () => {
  const previousLimit = process.env.RESUME_AI_DAILY_LIMIT;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.RESUME_AI_DAILY_LIMIT = '1'; process.env.DEEPSEEK_API_KEY = 'test-only';
  try {
    seedJob();
    const old = mockRecords.get(jobId) as StoredRecord<ResumeJob>;
    old.createdAt = '2020-01-01T00:00:00Z'; old.data.status = 'failed';
    const first = await executeResumeAction(owner, 'retry_ai_job', { id: jobId, expectedVersion: old.version }) as StoredRecord<ResumeJob>;
    expect(first.data.attemptedAt).toHaveLength(1);
    expect(Date.parse(first.data.attemptedAt![0])).toBeGreaterThan(Date.now() - 60000);
    // Workflow dispatch is unavailable in this isolated test and persists a failed state.
    expect(first.data.status).toBe('failed');
    await expect(executeResumeAction(owner, 'retry_ai_job', { id: jobId, expectedVersion: first.version })).rejects.toMatchObject({ status: 429 });
    expect((mockRecords.get(jobId)?.data as ResumeJob).attempts).toBe(2);
  } finally {
    if (previousLimit === undefined) delete process.env.RESUME_AI_DAILY_LIMIT; else process.env.RESUME_AI_DAILY_LIMIT = previousLimit;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test.each(['0', '-5', 'not-a-number', '1000001'])('invalid quota configuration %s falls back to a bounded positive limit', async limit => {
  const previousLimit = process.env.RESUME_AI_DAILY_LIMIT;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.RESUME_AI_DAILY_LIMIT = limit; process.env.DEEPSEEK_API_KEY = 'test-only';
  try {
    seedJob();
    const recent = mockRecords.get(jobId) as StoredRecord<ResumeJob>;
    recent.createdAt = new Date().toISOString(); recent.data.status = 'failed'; recent.data.attempts = 20;
    await expect(executeResumeAction(owner, 'retry_ai_job', { id: jobId, expectedVersion: 1 })).rejects.toMatchObject({ status: 429 });
  } finally {
    if (previousLimit === undefined) delete process.env.RESUME_AI_DAILY_LIMIT; else process.env.RESUME_AI_DAILY_LIMIT = previousLimit;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});
