import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Analysis, GeneratedResume } from '@/app/types';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { generateTailoredResume } from '@/app/lib/resumeGenerator';
import { capabilities } from '@/lib/tracker/config';
import { getApplication } from '@/lib/tracker/service';
import { createRecord, getRecord, idempotent, listRecords, updateRecord, withOwnerTransaction } from '@/lib/tracker/store';
import type { ApplicationData, RecordKind, StoredRecord } from '@/lib/tracker/types';
import { persistResumeResult } from './persistence';
import { extensionForMimeType } from '@/lib/resume-parser/formats';
import type { ResumeAnalysis, ResumeDraft, ResumeJob, ResumeVersion, ResumeWorkspaceData, ResumeWorkspaceSummaryData, SourceResume } from './types';
import { analysisSchema, answersSchema, completeAnswers, generatedResumeSchema, resumeIdSchema, SaveSessionBundleSchema, SUPPORTED_RESUME_MIMES, validateUpload } from './validation';
import { privateResumeStorage, readUpload } from './storage';

const key = z.string().uuid();
const app = { applicationId: resumeIdSchema };
export const resumeActionSchemas = {
  list_resumes: z.object({ applicationId: resumeIdSchema.optional() }),
  get_resume: z.object({ id: resumeIdSchema, kind: z.enum(['source_resume', 'analysis', 'resume_version']) }),
  save_source_preview: z.object({ id: resumeIdSchema, generatedResume: generatedResumeSchema }),
  analyze_resume: z.object({ ...app, sourceResumeId: resumeIdSchema, idempotencyKey: key }),
  get_resume_questions: z.object({ ...app, analysisId: resumeIdSchema }),
  save_resume_draft: z.object({ ...app, analysisId: resumeIdSchema, answers: answersSchema, expectedVersion: z.number().int().positive().optional() }),
  generate_resume: z.object({ ...app, analysisId: resumeIdSchema, answers: answersSchema, idempotencyKey: key }),
  select_submitted_resume: z.object({ ...app, versionId: resumeIdSchema, expectedVersion: z.number().int().positive() }),
  select_current_resume: z.object({ ...app, sourceResumeId: resumeIdSchema, expectedVersion: z.number().int().positive() }),
  get_ai_job: z.object({ id: resumeIdSchema }),
  retry_ai_job: z.object({ id: resumeIdSchema, expectedVersion: z.number().int().positive() }),
} as const;
export type ResumeAction = keyof typeof resumeActionSchemas;

export class ResumeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function stableResumeId(ownerId: string, value: string) {
  const hash = createHash('sha256').update(`${ownerId}:${value}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function requiredRecord<T>(ownerId: string, kind: RecordKind, id: string, applicationId?: string): Promise<StoredRecord<T>> {
  const record = await getRecord<T>(ownerId, kind, id);
  if (!record || (applicationId && record.applicationId !== applicationId)) throw new ResumeError('Resume record not found.', 404);
  return record;
}

export async function findResumeRecord<T>(ownerId: string, kind: RecordKind, id: string): Promise<StoredRecord<T> | null> {
  try { return await getRecord<T>(ownerId, kind, id); }
  catch (error) { if (error && typeof error === 'object' && 'status' in error && error.status === 404) return null; throw error; }
}

export async function listResumeWorkspace(ownerId: string, applicationId?: string): Promise<ResumeWorkspaceData> {
  if (applicationId) await getApplication(ownerId, applicationId);
  const [sources, analyses, drafts, versions, jobs] = await Promise.all([
    listRecords<SourceResume>(ownerId, 'source_resume'), listRecords<ResumeAnalysis>(ownerId, 'analysis'),
    listRecords<ResumeDraft>(ownerId, 'builder_draft'), listRecords<ResumeVersion>(ownerId, 'resume_version'), listRecords<ResumeJob>(ownerId, 'ai_job'),
  ]);
  const related = <T>(records: StoredRecord<T>[]) => records.filter(record => !applicationId || record.applicationId === applicationId);
  // File bytes are private; extracted resume text is returned only for an explicit owned-record read.
  const reconciledJobs = await Promise.all(related(jobs).map(job => reconcileResumeJob(ownerId, job)));
  return { sources: sources.map(record => ({ ...record, data: { ...record.data, hasPreview: Boolean(record.data.generatedResume), text: '', storagePath: '', fileBase64: undefined, parsedResume: undefined, starterAnswers: undefined, generatedResume: undefined } })), analyses: related(analyses), drafts: related(drafts), versions: related(versions), jobs: reconciledJobs.map(publicJob) };
}

export function publicJob(job: StoredRecord<ResumeJob>): StoredRecord<ResumeJob> {
  return { ...job, data: { ...job.data, sourceText: '', jobDescription: '', analysis: undefined, answers: {}, runId: null, attemptToken: '' } };
}

export async function listResumeSummaries(ownerId: string, applicationId?: string): Promise<ResumeWorkspaceSummaryData> {
  const data = await listResumeWorkspace(ownerId, applicationId);
  return {
    summariesOnly: true,
    sources: data.sources.map(record => ({ ...record, data: { filename: record.data.filename, mimeType: record.data.mimeType, size: record.data.size, origin: record.data.origin, hasPreview: record.data.hasPreview } })),
    analyses: data.analyses.map(record => ({ ...record, data: { sourceResumeId: record.data.sourceResumeId, score: record.data.analysis.score } })),
    drafts: data.drafts.map(record => ({ ...record, data: { analysisId: record.data.analysisId } })),
    versions: data.versions.map(record => ({ ...record, data: { analysisId: record.data.analysisId, sourceResumeId: record.data.sourceResumeId, label: record.data.label, fullName: record.data.generatedResume.preview.fullName, headline: record.data.generatedResume.preview.headline } })),
    jobs: data.jobs,
  };
}

export async function reconcileResumeJob(ownerId: string, job: StoredRecord<ResumeJob>) {
  if (!['queued', 'running'].includes(job.data.status)) return job;
  const age = Date.now() - Date.parse(job.updatedAt);
  if (age < 15000) return job;
  let interrupted = !job.data.runId && age > (job.data.status === 'queued' ? 120000 : 1200000);
  if (job.data.runId) {
    try { const { getRun } = await import('workflow/api'); interrupted = ['failed', 'cancelled', 'completed'].includes(await getRun(job.data.runId).status); }
    catch { return job; }
  }
  if (!interrupted) return job;
  return withOwnerTransaction(ownerId, async () => {
    const current = await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id);
    if (current.data.attemptToken !== job.data.attemptToken || current.data.status === 'succeeded' || current.data.status === 'failed') return current;
    return updateRecord<ResumeJob>(ownerId, 'ai_job', job.id, { ...current.data, status: 'failed', error: 'The background job was interrupted. Retry to continue with your saved inputs.' }, current.version);
  });
}

export const resumeUploadSchema = z.object({ filename: z.string().min(1).max(180), mimeType: z.enum(SUPPORTED_RESUME_MIMES), size: z.number().int().min(1).max(8 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: key });
type ResumeUploadInput = z.infer<typeof resumeUploadSchema>;

async function uploadIntent(ownerId: string, input: unknown) {
  const args = resumeUploadSchema.parse(input);
  try { validateUpload({ name: args.filename, type: args.mimeType, size: args.size } as File); }
  catch (error) { throw new ResumeError(error instanceof Error ? error.message : 'Choose a supported resume file.'); }
  const id = stableResumeId(ownerId, `upload:${args.idempotencyKey}`);
  const ext = extensionForMimeType(args.mimeType, args.filename);
  return idempotent(ownerId, `resume-upload:${args.idempotencyKey}`, 'prepare_resume_upload', args, async () => ({ ...args, id, storagePath: `${ownerId}/${id}.${ext}` }));
}

/** Only a path-limited upload token reaches the browser; the service credential stays here. */
export async function prepareResumeUpload(ownerId: string, input: unknown) {
  const intent = await uploadIntent(ownerId, input);
  const existing = await findResumeRecord<SourceResume>(ownerId, 'source_resume', intent.id);
  if (existing) return { id: existing.id, complete: true };
  const { data, error } = await privateResumeStorage().createSignedUploadUrl(intent.storagePath, { upsert: false });
  if (error || !data) throw new ResumeError('The private upload could not be prepared. Please try again.', 503);
  return { id: intent.id, signedUrl: data.signedUrl, complete: false };
}

export async function completeResumeUpload(ownerId: string, input: unknown) {
  const intent = await uploadIntent(ownerId, input);
  const existing = await findResumeRecord<SourceResume>(ownerId, 'source_resume', intent.id);
  if (existing) return existing;
  const { data: file, error } = await privateResumeStorage().download(intent.storagePath);
  if (error || !file) throw new ResumeError('Upload the resume file before completing this request.', 409);
  if (file.size !== intent.size || file.size > 8 * 1024 * 1024) throw new ResumeError('The uploaded file does not match the selected resume. Start a new upload.', 409);
  const bytes = await file.arrayBuffer();
  if (createHash('sha256').update(Buffer.from(bytes)).digest('hex') !== intent.sha256) throw new ResumeError('The uploaded file contents do not match the selected resume. Start a new upload.', 409);
  const { text, parsedResume } = await readUpload(new File([bytes], intent.filename, { type: intent.mimeType })).catch(error => { throw new ResumeError(error instanceof Error ? error.message : 'The resume could not be read.'); });
  return createRecord<SourceResume>(ownerId, 'source_resume', { filename: intent.filename, mimeType: intent.mimeType, size: intent.size, storagePath: intent.storagePath, text, sha256: intent.sha256, ...(parsedResume ? { parsedResume } : {}) }, { id: intent.id });
}

/** Server-side convenience used by import and PostgreSQL direct uploads; hosted deployments may also use signed Supabase URLs. */
export async function uploadResume(ownerId: string, file: File, idempotencyKey: string) {
  const { mimeType, bytes, text, parsedResume } = await readUpload(file);
  const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  const input: ResumeUploadInput = { filename: file.name, mimeType, size: file.size, sha256, idempotencyKey };
  const intent = await uploadIntent(ownerId, input);
  const existing = await findResumeRecord<SourceResume>(ownerId, 'source_resume', intent.id);
  if (existing) return existing;
  if (!capabilities().storage) {
    return createRecord<SourceResume>(
      ownerId,
      'source_resume',
      { filename: file.name, mimeType, size: file.size, storagePath: '', fileBase64: Buffer.from(bytes).toString('base64'), text, sha256, ...(parsedResume ? { parsedResume } : {}) },
      { id: intent.id },
    );
  }
  const uploaded = await privateResumeStorage().upload(intent.storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw new ResumeError('The private upload could not be saved. Please try again.', 503);
  return completeResumeUpload(ownerId, input);
}

export async function downloadResume(ownerId: string, id: string) {
  const resume = await requiredRecord<SourceResume>(ownerId, 'source_resume', resumeIdSchema.parse(id));
  if (!resume.data.storagePath) {
    if (resume.data.fileBase64) {
      return { resume, data: new Blob([Buffer.from(resume.data.fileBase64, 'base64')], { type: resume.data.mimeType }) };
    }
    return { resume, data: new Blob([resume.data.text], { type: 'text/plain;charset=utf-8' }) };
  }
  const { data, error } = await privateResumeStorage().download(resume.data.storagePath);
  if (error || !data) throw new ResumeError('The resume file could not be downloaded. Please try again.', 503);
  return { resume, data };
}

export async function resumeDownloadLink(ownerId: string, id: string) {
  const resume = await requiredRecord<SourceResume>(ownerId, 'source_resume', resumeIdSchema.parse(id));
  const { data, error } = await privateResumeStorage().createSignedUrl(resume.data.storagePath, 60, { download: resume.data.filename });
  if (error || !data) throw new ResumeError('The resume file could not be downloaded. Please try again.', 503);
  return data.signedUrl;
}

function attemptTimestamps(job: StoredRecord<ResumeJob>): string[] {
  if (Array.isArray(job.data.attemptedAt)) return job.data.attemptedAt;
  const count = Number.isSafeInteger(job.data.attempts) && job.data.attempts > 0 ? Math.min(job.data.attempts, 1000) : 1;
  return Array.from({ length: count }, () => job.createdAt);
}

async function enforceAILimit(ownerId: string) {
  const jobs = await listRecords<ResumeJob>(ownerId, 'ai_job');
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const configuredLimit = Number(process.env.RESUME_AI_DAILY_LIMIT || 20);
  const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 1000 ? configuredLimit : 20;
  const attempts = jobs.reduce((sum, job) => sum + attemptTimestamps(job).filter(at => Date.parse(at) > since).length, 0);
  if (attempts >= limit) throw new ResumeError('Your daily resume AI limit has been reached. Try again tomorrow.', 429);
}

async function dispatchJob(ownerId: string, job: StoredRecord<ResumeJob>) {
  try {
    const [{ start }, { resumeWorkflow }] = await Promise.all([import('workflow/api'), import('@/workflows/resume')]);
    const run = await start(resumeWorkflow, [ownerId, job.id, job.data.attemptToken]);
    await withOwnerTransaction(ownerId, async () => {
      const current = await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id);
      if (current.data.attemptToken === job.data.attemptToken) await updateRecord(ownerId, 'ai_job', current.id, { ...current.data, runId: run.runId }, current.version);
    });
  } catch (dispatchError) {
    if (process.env.NODE_ENV !== 'test') {
      try {
        await withOwnerTransaction(ownerId, async () => {
          const current = await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id);
          if (current.data.attemptToken === job.data.attemptToken && current.data.status === 'queued') {
            await updateRecord(ownerId, 'ai_job', current.id, { ...current.data, status: 'running' }, current.version);
          }
        });
        if (job.data.operation === 'analyze') {
          const analysis = await analyzeWithAI(job.data.sourceText, job.data.jobDescription);
          await persistResumeResult(ownerId, job.id, job.data.attemptToken, analysis);
        } else {
          if (!job.data.analysis) throw new ResumeError('Analyze the resume before generating a tailored version.');
          const generatedResume = await generateTailoredResume({
            sourceText: job.data.sourceText,
            analysis: job.data.analysis,
            jobDescription: job.data.jobDescription,
            answers: job.data.answers,
          });
          await persistResumeResult(ownerId, job.id, job.data.attemptToken, generatedResume);
        }
        return publicJob(await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id));
      } catch (inlineError) {
        const message = inlineError instanceof Error ? inlineError.message : dispatchError instanceof Error ? dispatchError.message : 'The resume AI request failed.';
        await withOwnerTransaction(ownerId, async () => {
          const current = await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id);
          if (current.data.attemptToken === job.data.attemptToken && ['queued', 'running'].includes(current.data.status)) {
            await updateRecord(ownerId, 'ai_job', current.id, { ...current.data, status: 'failed', error: message }, current.version);
          }
        });
        return publicJob(await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id));
      }
    }
    await withOwnerTransaction(ownerId, async () => {
      const current = await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id);
      if (current.data.attemptToken === job.data.attemptToken && current.data.status === 'queued') {
        await updateRecord(ownerId, 'ai_job', current.id, { ...current.data, status: 'failed', error: 'The background job could not be started. Use Retry to try again.' }, current.version);
      }
    });
  }
  return publicJob(await requiredRecord<ResumeJob>(ownerId, 'ai_job', job.id));
}

async function queueJob(ownerId: string, applicationId: string, idempotencyKey: string, input: Pick<ResumeJob, 'operation' | 'sourceResumeId' | 'analysisId' | 'sourceText' | 'jobDescription' | 'analysis' | 'answers'>) {
  const id = stableResumeId(ownerId, `job:${idempotencyKey}`);
  const { job, created } = await withOwnerTransaction(ownerId, async () => {
    const existing = await findResumeRecord<ResumeJob>(ownerId, 'ai_job', id);
    if (existing) {
      if (existing.applicationId !== applicationId || existing.data.operation !== input.operation || existing.data.analysisId !== input.analysisId || existing.data.sourceResumeId !== input.sourceResumeId || !isDeepStrictEqual(existing.data.answers, input.answers)) throw new ResumeError('This request key was already used for a different resume request.', 409);
      return { job: existing, created: false };
    }
    if (!process.env.DEEPSEEK_API_KEY) throw new ResumeError('Resume AI is not configured yet. Tracking and saved resumes remain available.', 503);
    await enforceAILimit(ownerId);
    const job = await createRecord<ResumeJob>(ownerId, 'ai_job', { ...input, type: input.operation === 'analyze' ? 'analysis' : 'generation', input: {}, status: 'queued', resultId: null, error: null, runId: null, attempts: 1, attemptedAt: [new Date().toISOString()], attemptToken: randomUUID() }, { id, applicationId });
    return { job, created: true };
  });
  return created ? dispatchJob(ownerId, job) : publicJob(job);
}

export async function executeResumeAction(ownerId: string, action: ResumeAction, input: unknown): Promise<unknown> {
  switch (action) {
    case 'save_source_preview': {
      const args = resumeActionSchemas.save_source_preview.parse(input);
      return withOwnerTransaction(ownerId, async () => {
        const source = await requiredRecord<SourceResume>(ownerId, 'source_resume', args.id);
        const savedPreview = generatedResumeSchema.safeParse(source.data.generatedResume);
        if (!savedPreview.success || !isDeepStrictEqual(savedPreview.data, args.generatedResume)) {
          await updateRecord<SourceResume>(ownerId, 'source_resume', source.id, {
            ...source.data,
            generatedResume: args.generatedResume,
          }, source.version);
        }
        return { id: source.id };
      });
    }
    case 'list_resumes': {
      const args = resumeActionSchemas.list_resumes.parse(input); return listResumeSummaries(ownerId, args.applicationId);
    }
    case 'get_resume': {
      const args = resumeActionSchemas.get_resume.parse(input);
      const record = await requiredRecord<Record<string, unknown>>(ownerId, args.kind, args.id);
      if (args.kind === 'source_resume') return { ...record, data: { ...record.data, storagePath: undefined, fileBase64: undefined }, downloadUrl: `/api/resumes/${record.id}?download=1` };
      return record;
    }
    case 'analyze_resume': {
      const args = resumeActionSchemas.analyze_resume.parse(input);
      const application = await getApplication(ownerId, args.applicationId);
      const source = await requiredRecord<SourceResume>(ownerId, 'source_resume', args.sourceResumeId);
      if (application.jobDescription.trim().length < 25) throw new ResumeError('Add the full job description to this application before analyzing.');
      return queueJob(ownerId, application.id, args.idempotencyKey, { operation: 'analyze', sourceResumeId: source.id, analysisId: null, sourceText: source.data.text, jobDescription: application.jobDescription, answers: {} });
    }
    case 'get_resume_questions': {
      const args = resumeActionSchemas.get_resume_questions.parse(input);
      await getApplication(ownerId, args.applicationId);
      const analysis = await requiredRecord<ResumeAnalysis>(ownerId, 'analysis', args.analysisId, args.applicationId);
      const draft = await findResumeRecord<ResumeDraft>(ownerId, 'builder_draft', stableResumeId(ownerId, `draft:${args.analysisId}`));
      return { ...completeAnswers(analysis.data.analysis, analysis.data.jobDescription, draft?.data.answers || {}), draft };
    }
    case 'save_resume_draft': {
      const args = resumeActionSchemas.save_resume_draft.parse(input);
      await getApplication(ownerId, args.applicationId);
      await requiredRecord<ResumeAnalysis>(ownerId, 'analysis', args.analysisId, args.applicationId);
      return withOwnerTransaction(ownerId, async () => {
        const id = stableResumeId(ownerId, `draft:${args.analysisId}`);
        const current = await findResumeRecord<ResumeDraft>(ownerId, 'builder_draft', id);
        if (current && isDeepStrictEqual(current.data.answers, args.answers)) return current;
        if (current && !args.expectedVersion) throw new ResumeError('This draft changed. Reload the saved draft before editing.', 409);
        return current ? updateRecord(ownerId, 'builder_draft', id, { analysisId: args.analysisId, answers: args.answers }, args.expectedVersion!) : createRecord(ownerId, 'builder_draft', { analysisId: args.analysisId, answers: args.answers }, { id, applicationId: args.applicationId });
      });
    }
    case 'generate_resume': {
      const args = resumeActionSchemas.generate_resume.parse(input);
      await getApplication(ownerId, args.applicationId);
      const analysis = await requiredRecord<ResumeAnalysis>(ownerId, 'analysis', args.analysisId, args.applicationId);
      const answers = completeAnswers(analysis.data.analysis, analysis.data.jobDescription, args.answers);
      if (answers.missing.length) return { status: 'needs_answers', questions: answers.missing, answers: answers.answers };
      return queueJob(ownerId, args.applicationId, args.idempotencyKey, { operation: 'generate', analysisId: analysis.id, sourceResumeId: analysis.data.sourceResumeId, sourceText: analysis.data.sourceText, jobDescription: analysis.data.jobDescription, analysis: analysis.data.analysis, answers: answers.answers });
    }
    case 'select_submitted_resume': {
      const args = resumeActionSchemas.select_submitted_resume.parse(input);
      await requiredRecord<ResumeVersion>(ownerId, 'resume_version', args.versionId, args.applicationId);
      const application = await requiredRecord<ApplicationData>(ownerId, 'application', args.applicationId);
      if (application.data.submittedResumeVersionId === args.versionId && !application.data.submittedSourceResumeId) return application;
      return updateRecord(ownerId, 'application', application.id, { ...application.data, submittedResumeVersionId: args.versionId, submittedSourceResumeId: null }, args.expectedVersion);
    }
    case 'select_current_resume': {
      const args = resumeActionSchemas.select_current_resume.parse(input);
      await requiredRecord<SourceResume>(ownerId, 'source_resume', args.sourceResumeId);
      const application = await requiredRecord<ApplicationData>(ownerId, 'application', args.applicationId);
      if (application.data.submittedSourceResumeId === args.sourceResumeId && !application.data.submittedResumeVersionId) return application;
      return updateRecord(ownerId, 'application', application.id, { ...application.data, submittedSourceResumeId: args.sourceResumeId, submittedResumeVersionId: null }, args.expectedVersion);
    }
    case 'get_ai_job': {
      const args = resumeActionSchemas.get_ai_job.parse(input); return publicJob(await reconcileResumeJob(ownerId, await requiredRecord<ResumeJob>(ownerId, 'ai_job', args.id)));
    }
    case 'retry_ai_job': {
      const args = resumeActionSchemas.retry_ai_job.parse(input);
      const retry = await withOwnerTransaction(ownerId, async () => {
        const current = await requiredRecord<ResumeJob>(ownerId, 'ai_job', args.id);
        if (current.data.retrySourceVersion === args.expectedVersion && current.data.status !== 'failed') return { job: current, dispatch: false };
        if (current.data.status !== 'failed') throw new ResumeError('Only failed jobs can be retried.', 409);
        if (!process.env.DEEPSEEK_API_KEY) throw new ResumeError('Resume AI is not configured yet.', 503);
        await enforceAILimit(ownerId);
        const attemptedAt = [...attemptTimestamps(current).filter(at => Date.parse(at) > Date.now() - 24 * 60 * 60 * 1000), new Date().toISOString()];
        const previousAttempts = Number.isSafeInteger(current.data.attempts) && current.data.attempts > 0 ? current.data.attempts : 1;
        const job = await updateRecord<ResumeJob>(ownerId, 'ai_job', current.id, { ...current.data, status: 'queued', error: null, runId: null, attempts: previousAttempts + 1, attemptedAt, attemptToken: randomUUID(), retrySourceVersion: args.expectedVersion }, args.expectedVersion);
        return { job, dispatch: true };
      });
      return retry.dispatch ? dispatchJob(ownerId, retry.job) : publicJob(retry.job);
    }
  }
}

export const legacyImportSchema = z.object({ applicationId: resumeIdSchema, company: z.string().min(1), role: z.string().min(1), confirmed: z.literal(true), attachGenerated: z.boolean(), analysis: analysisSchema, jobDescription: z.string().max(256000), answers: answersSchema, generatedResume: generatedResumeSchema.optional() });
export async function importLegacyResume(ownerId: string, input: unknown) {
  const candidate = input && typeof input === 'object' && 'attachGenerated' in input && input.attachGenerated === false ? { ...input, generatedResume: undefined } : input;
  const args = legacyImportSchema.parse(candidate);
  if (args.attachGenerated && !args.generatedResume) throw new ResumeError('Choose a valid generated resume or import only the analysis.');
  const application = await getApplication(ownerId, args.applicationId);
  if (application.company !== args.company || application.role !== args.role) throw new ResumeError('The selected company or role changed. Review the destination again.', 409);
  return withOwnerTransaction(ownerId, async () => {
    const id = stableResumeId(ownerId, 'legacy-analysis-import-v1');
    const existing = await findResumeRecord<ResumeAnalysis>(ownerId, 'analysis', id);
    if (existing) {
      if (existing.applicationId !== application.id) throw new ResumeError('Your browser-session analysis has already been imported into another application.', 409);
      return { analysis: existing, alreadyImported: true };
    }
    const analysis = await createRecord<ResumeAnalysis>(ownerId, 'analysis', { sourceResumeId: null, sourceText: '', jobDescription: args.jobDescription, analysis: args.analysis as unknown as Analysis, imported: true }, { id, applicationId: application.id });
    await createRecord<ResumeDraft>(ownerId, 'builder_draft', { analysisId: id, answers: args.answers }, { id: stableResumeId(ownerId, `draft:${id}`), applicationId: application.id });
    let version = null;
    if (args.attachGenerated && args.generatedResume) version = await createRecord<ResumeVersion>(ownerId, 'resume_version', { analysisId: id, sourceResumeId: null, sourceText: '', jobDescription: args.jobDescription, analysis: args.analysis as unknown as Analysis, answers: args.answers, generatedResume: args.generatedResume as GeneratedResume, jobId: null, label: 'Imported resume', imported: true }, { id: stableResumeId(ownerId, 'legacy-version-import-v1'), applicationId: application.id });
    return { analysis, version, alreadyImported: false };
  });
}

export async function saveSessionBundle(ownerId: string, input: unknown) {
  const args = SaveSessionBundleSchema.parse(input);
  return withOwnerTransaction(ownerId, async () => {
    let source = args.sourceResumeId
      ? await findResumeRecord<SourceResume>(ownerId, 'source_resume', args.sourceResumeId)
      : null;
    if (!source) {
      const filename = args.sourceFilename || 'session-resume.txt';
      const mimeType = args.sourceMimeType || 'text/plain';
      source = await createRecord<SourceResume>(ownerId, 'source_resume', {
        filename,
        mimeType,
        size: Buffer.byteLength(args.sourceText, 'utf8'),
        storagePath: '',
        text: args.sourceText,
      });
    }
    const application = await createRecord<ApplicationData>(ownerId, 'application', {
      company: args.company,
      role: args.role,
      stage: 'Saved',
      jobUrl: args.jobUrl || '',
      jobDescription: args.jobDescription,
      location: '',
      compensation: '',
      priority: 'medium',
      tags: [],
      appliedDate: null,
      deadline: null,
      archived: false,
      submittedResumeVersionId: null,
      submittedSourceResumeId: args.useCurrentResume && !args.generatedResume ? source.id : null,
    });
    const analysis = await createRecord<ResumeAnalysis>(
      ownerId,
      'analysis',
      {
        sourceResumeId: source.id,
        sourceText: args.sourceText,
        jobDescription: args.jobDescription,
        analysis: args.analysis as unknown as Analysis,
      },
      { applicationId: application.id },
    );
    const answers = args.answers || {};
    let draft: StoredRecord<ResumeDraft> | null = null;
    if (Object.keys(answers).length > 0) {
      draft = await createRecord<ResumeDraft>(
        ownerId,
        'builder_draft',
        { analysisId: analysis.id, answers },
        { id: stableResumeId(ownerId, `draft:${analysis.id}`), applicationId: application.id },
      );
    }
    let version: StoredRecord<ResumeVersion> | null = null;
    if (args.generatedResume) {
      version = await createRecord<ResumeVersion>(
        ownerId,
        'resume_version',
        {
          analysisId: analysis.id,
          sourceResumeId: source.id,
          sourceText: args.sourceText,
          jobDescription: args.jobDescription,
          analysis: args.analysis as unknown as Analysis,
          answers,
          generatedResume: args.generatedResume as unknown as GeneratedResume,
          jobId: null,
          label: args.label?.trim() || `${args.company}: ${args.role}`,
        },
        { applicationId: application.id },
      );
    }
    return {
      application,
      sourceResumeId: source.id,
      analysisId: analysis.id,
      draftId: draft?.id ?? null,
      versionId: version?.id ?? null,
    };
  });
}
