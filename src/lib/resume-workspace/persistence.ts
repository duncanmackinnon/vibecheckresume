import type { Analysis, GeneratedResume } from '@/app/types';
import { createRecord, updateRecord, withOwnerTransaction } from '@/lib/tracker/store';
import { findResumeRecord, requiredRecord, stableResumeId } from './service';
import { analysisSchema, generatedResumeSchema } from './validation';
import type { ResumeAnalysis, ResumeJob, ResumeVersion } from './types';

/** The output ID belongs to the job, so step replay can never create a second version. */
export async function persistResumeResult(ownerId: string, jobId: string, attemptToken: string, output: Analysis | GeneratedResume) {
  return withOwnerTransaction(ownerId, async () => {
    const job = await requiredRecord<ResumeJob>(ownerId, 'ai_job', jobId);
    if (job.data.attemptToken !== attemptToken) return { status: 'superseded' };
    const resultId = stableResumeId(ownerId, `result:${job.id}`);
    const kind = job.data.operation === 'analyze' ? 'analysis' : 'resume_version';
    const existing = await findResumeRecord(ownerId, kind, resultId);
    if (!existing) {
      if (job.data.operation === 'analyze') {
        const analysis = analysisSchema.parse(output) as unknown as Analysis;
        await createRecord<ResumeAnalysis>(ownerId, 'analysis', { sourceResumeId: job.data.sourceResumeId, sourceText: job.data.sourceText, jobDescription: job.data.jobDescription, analysis }, { id: resultId, applicationId: job.applicationId! });
      } else {
        const generatedResume = generatedResumeSchema.parse(output);
        await createRecord<ResumeVersion>(ownerId, 'resume_version', {
          analysisId: job.data.analysisId!, sourceResumeId: job.data.sourceResumeId,
          sourceText: job.data.sourceText, jobDescription: job.data.jobDescription, analysis: job.data.analysis!,
          answers: job.data.answers, generatedResume, jobId, label: 'Tailored resume',
        }, { id: resultId, applicationId: job.applicationId! });
      }
    }
    if (job.data.status !== 'succeeded' || job.data.resultId !== resultId) {
      await updateRecord(ownerId, 'ai_job', job.id, { ...job.data, status: 'succeeded', resultId, error: null }, job.version);
    }
    return { status: 'succeeded', resultId };
  });
}
