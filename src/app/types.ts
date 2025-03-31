export interface Analysis {
  score: number;
  matchedSkills: Array<{
    name: string;
    match: boolean;
  }>;
  missingSkills: string[];
  isChunked?: boolean;
  recommendations: {
    improvements?: string[];
    strengths?: string[];
    skillGaps?: string[];
    format?: string[];
  };
  detailedAnalysis: string;
  modifiedResume?: string;
}

export interface ApiResponse<T = any> {
  data: T;
  error?: string;
}

export interface ResumeAnalysisRequest {
  resumeText: string;
  jobDescription: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export type AnalyzeFunction = (params: ResumeAnalysisRequest) => Promise<Analysis>;

export interface FileWithPreview extends File {
  preview?: string;
}

export interface UploadProps {
  onFileUpload: (file: File) => void;
}

export interface JobDescriptionProps {
  onJobDescriptionSubmit: (text: string) => void;
  isDisabled?: boolean;
}

export interface AnalysisResultProps extends Analysis {}

export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  message?: string;
}

export interface ErrorMessage {
  message: string;
  code?: string;
  details?: Record<string, any>;
}

export interface ApiErrorResponse {
  error: ErrorMessage;
  status: number;
}

export interface AnalysisMetrics {
  duration: number;
  tokensUsed: number;
  promptLength: number;
  responseLength: number;
}

export interface AnalysisContext {
  timestamp: string;
  environment: string;
  version: string;
  metrics: AnalysisMetrics;
}

export interface ExtendedAnalysis extends Analysis {
  context: AnalysisContext;
}

// Environment validation types
export interface EnvVars {
  required: string[];
  optional: string[];
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// File processing types
export interface FileProcessingResult {
  text: string;
  metadata: {
    filename: string;
    filesize: number;
    filetype: string;
    wordCount: number;
    charCount: number;
  };
}

// Cache types
export interface CacheConfig {
  ttl: number;
  maxSize: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expires: number;
}