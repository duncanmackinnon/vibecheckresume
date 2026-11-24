import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import type { StoredRecord } from '@/lib/tracker/types';

export interface SourceResume {
  filename: string;
  mimeType: 'application/pdf' | 'text/plain';
  size: number;
  storagePath: string;
  text: string;
  sha256?: string;
  origin?: 'builder';
  starterAnswers?: import('@/lib/onboarding/starter-resume').StarterResumeAnswers;
  generatedResume?: GeneratedResume;
}

export interface ResumeAnalysis {
  sourceResumeId: string | null;
  sourceText: string;
  jobDescription: string;
  analysis: Analysis;
  imported?: boolean;
}

export interface ResumeDraft {
  analysisId: string;
  answers: ResumeGenerationAnswers;
}

export interface ResumeVersion {
  analysisId: string;
  sourceResumeId: string | null;
  sourceText: string;
  jobDescription: string;
  analysis: Analysis;
  answers: ResumeGenerationAnswers;
  generatedResume: GeneratedResume;
  jobId: string | null;
  label: string;
  imported?: boolean;
}

export interface ResumeJob {
  type: 'analysis' | 'generation';
  input: Record<string, unknown>;
  operation: 'analyze' | 'generate';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  sourceResumeId: string | null;
  analysisId: string | null;
  sourceText: string;
  jobDescription: string;
  analysis?: Analysis;
  answers: ResumeGenerationAnswers;
  resultId: string | null;
  error: string | null;
  runId: string | null;
  attempts: number;
  attemptToken: string;
  retrySourceVersion?: number;
  attemptedAt?: string[];
}

export interface ResumeWorkspaceData {
  sources: StoredRecord<SourceResume>[];
  analyses: StoredRecord<ResumeAnalysis>[];
  drafts: StoredRecord<ResumeDraft>[];
  versions: StoredRecord<ResumeVersion>[];
  jobs: StoredRecord<ResumeJob>[];
}

export interface ResumeWorkspaceSummaryData {
  summariesOnly: true;
  sources: StoredRecord<Pick<SourceResume, 'filename' | 'mimeType' | 'size' | 'origin'>>[];
  analyses: StoredRecord<{ sourceResumeId: string | null; score: number }>[];
  drafts: StoredRecord<Pick<ResumeDraft, 'analysisId'>>[];
  versions: StoredRecord<{ analysisId: string; sourceResumeId: string | null; label: string; fullName: string; headline?: string }>[];
  jobs: StoredRecord<ResumeJob>[];
}
