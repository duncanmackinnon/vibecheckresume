import type { Analysis, GeneratedResume } from '@/app/types';
import type { ResumeJob } from '@/lib/resume-workspace/types';

export async function resumeWorkflow(ownerId: string, jobId: string, attemptToken: string) {
  'use workflow';
  try {
    const input = await loadResumeJob(ownerId, jobId, attemptToken);
    if (!input) return { status: 'already_processed' };
    const output = input.operation === 'analyze'
      ? await analyzeResumeStep(input)
      : await generateResumeStep(input);
    return await saveResumeResult(ownerId, jobId, attemptToken, output);
  } catch {
    await failResumeJob(ownerId, jobId, attemptToken);
    return { status: 'failed' };
  }
}

async function loadResumeJob(ownerId: string, jobId: string, attemptToken: string): Promise<ResumeJob | null> {
  'use step';
  const { requiredRecord } = await import('@/lib/resume-workspace/service');
  const { withOwnerTransaction, updateRecord } = await import('@/lib/tracker/store');
  const { getApplication } = await import('@/lib/tracker/service');
  return withOwnerTransaction(ownerId, async () => {
    const job = await requiredRecord<ResumeJob>(ownerId, 'ai_job', jobId);
    if (job.data.attemptToken !== attemptToken || job.data.status === 'succeeded' || job.data.status === 'failed') return null;
    await getApplication(ownerId, job.applicationId!);
    await updateRecord(ownerId, 'ai_job', job.id, { ...job.data, status: 'running' }, job.version);
    return job.data;
  });
}

async function analyzeResumeStep(input: ResumeJob): Promise<Analysis> {
  'use step';
  const { analyzeWithAI } = await import('@/app/lib/deepseekEnhancer');
  const { extractResumeBuilderProfileFromText, mergeResumeBuilderProfiles } = await import('@/app/lib/resumeBuilderProfile');
  const analysis = await analyzeWithAI(input.sourceText, input.jobDescription);
  return {
    ...analysis,
    resumeBuilderProfile: mergeResumeBuilderProfiles(analysis.resumeBuilderProfile, extractResumeBuilderProfileFromText(input.sourceText)),
  };
}

async function generateResumeStep(input: ResumeJob): Promise<GeneratedResume> {
  'use step';
  const { generateTailoredResume } = await import('@/app/lib/resumeGenerator');
  if (!input.analysis) throw new Error('The saved analysis is unavailable.');
  return generateTailoredResume({ sourceText: input.sourceText, analysis: input.analysis, jobDescription: input.jobDescription, answers: input.answers });
}

async function saveResumeResult(ownerId: string, jobId: string, attemptToken: string, output: Analysis | GeneratedResume) {
  'use step';
  const { persistResumeResult } = await import('@/lib/resume-workspace/persistence');
  return persistResumeResult(ownerId, jobId, attemptToken, output);
}

async function failResumeJob(ownerId: string, jobId: string, attemptToken: string) {
  'use step';
  const { requiredRecord } = await import('@/lib/resume-workspace/service');
  const { withOwnerTransaction, updateRecord } = await import('@/lib/tracker/store');
  await withOwnerTransaction(ownerId, async () => {
    const job = await requiredRecord<ResumeJob>(ownerId, 'ai_job', jobId);
    if (job.data.attemptToken !== attemptToken || job.data.status === 'succeeded') return;
    await updateRecord(ownerId, 'ai_job', job.id, { ...job.data, status: 'failed', error: 'Resume AI could not finish this request. Your saved inputs are safe. Retry when the provider is available.' }, job.version);
  });
}
