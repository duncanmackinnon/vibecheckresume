import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';

export const STAGES = ['Saved', 'Applied', 'Screening', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn'] as const;
export type Stage = typeof STAGES[number];
export type RecordKind = 'application' | 'entry' | 'source_resume' | 'analysis' | 'builder_draft' | 'resume_version' | 'ai_job' | 'conversation' | 'message' | 'connection' | 'usage' | 'profile' | 'job_match' | 'discovery_run' | 'onboarding_draft';
export interface User { id: string; email: string; name: string }
export interface RecordMeta { id: string; ownerId: string; applicationId: string | null; version: number; createdAt: string; updatedAt: string }
export interface StoredRecord<T> extends RecordMeta { kind: RecordKind; data: T }
export interface ApplicationData {
  company: string; role: string; stage: Stage; jobUrl: string; jobDescription: string;
  location: string; compensation: string; priority: 'low' | 'medium' | 'high'; tags: string[];
  appliedDate: string | null; deadline: string | null; archived: boolean; submittedResumeVersionId: string | null; submittedSourceResumeId?: string | null;
}
export type Application = RecordMeta & ApplicationData;
export interface EntryData {
  kind: 'note' | 'contact' | 'task' | 'interview' | 'activity'; title: string; body: string;
  dueDate: string | null; completed: boolean; startAt: string | null; endAt: string | null;
  timezone: string; email: string; phone: string; url: string; contactRole: string;
}
export type TrackerEntry = RecordMeta & EntryData;
export interface SourceResumeData { filename: string; mimeType: string; size: number; storagePath: string; fileBase64?: string; text: string; origin?: 'builder'; starterAnswers?: import('@/lib/onboarding/starter-resume').StarterResumeAnswers; generatedResume?: GeneratedResume }
export type SourceResume = RecordMeta & SourceResumeData;
export interface AnalysisData { sourceResumeId: string | null; sourceText?: string; jobDescription: string; analysis: Analysis; imported?: boolean }
export type AnalysisRecord = RecordMeta & AnalysisData;
export interface ResumeDraftData { analysisId: string; answers: ResumeGenerationAnswers }
export type ResumeDraft = RecordMeta & ResumeDraftData;
export interface ResumeVersionData { analysisId: string; sourceResumeId: string | null; sourceText?: string; analysis?: Analysis; jobDescription: string; answers: ResumeGenerationAnswers; generatedResume: GeneratedResume; label: string; jobId?: string | null; imported?: boolean }
export type ResumeVersion = RecordMeta & ResumeVersionData;
export interface AiJobData { type: 'analysis' | 'generation'; status: 'queued' | 'running' | 'succeeded' | 'failed'; input: Record<string, unknown>; resultId: string | null; error: string | null; workflowRunId?: string; attempts?: number; operation?: 'analyze' | 'generate'; sourceResumeId?: string | null; analysisId?: string | null; sourceText?: string; jobDescription?: string; analysis?: Analysis; answers?: ResumeGenerationAnswers; runId?: string | null; attemptToken?: string }
export type AiJob = RecordMeta & AiJobData;
export interface ConversationData { title: string }
export type Conversation = RecordMeta & ConversationData;
export interface MessageData { conversationId: string; role: 'user' | 'assistant'; content: string }
export type ChatMessage = RecordMeta & MessageData;
export interface ConnectionData { enabled: boolean; lastUsedAt: string | null; revokedBefore?: string | null }
export interface Capabilities { database: boolean; auth: boolean; auth0?: boolean; storage: boolean; deepseek: boolean; openai: boolean }
export type SourceResumeSummary = RecordMeta & Pick<SourceResumeData, 'filename' | 'mimeType' | 'size'>;
export type AnalysisSummary = RecordMeta & { sourceResumeId: string | null; score: number; imported?: boolean };
export type DraftSummary = RecordMeta & Pick<ResumeDraftData, 'analysisId'>;
export type ResumeVersionSummary = RecordMeta & Pick<ResumeVersionData, 'analysisId' | 'sourceResumeId' | 'label'> & { headline?: string; fullName?: string };
export type AiJobSummary = RecordMeta & Pick<AiJobData, 'type' | 'status' | 'resultId' | 'error' | 'attempts'>;
export interface TrackerSnapshot {
  onboarding?: StoredRecord<import('@/lib/onboarding/types').OnboardingProfileData> | null;
  user: User; applications: Application[]; entries: TrackerEntry[]; resumes: SourceResumeSummary[];
  analyses: AnalysisSummary[]; drafts: DraftSummary[]; versions: ResumeVersionSummary[]; jobs: AiJobSummary[];
  conversations: Conversation[]; connection: ConnectionData; capabilities: Capabilities; demo: boolean;
}
export function flatten<T>(record: StoredRecord<T>): RecordMeta & T {
  const { data, kind: _kind, ...meta } = record;
  return { ...data, ...meta };
}
