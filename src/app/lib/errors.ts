import { OpenAI } from 'openai';

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

type OpenAIErrorCode = string | undefined;

export function formatError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    switch (error.status) {
      case 401:
        return 'Authentication failed. Please check your API key.';
      case 429:
        return 'Rate limit exceeded. Please try again in a few moments.';
      case 500:
        return 'OpenAI service error. Please try again later.';
      default:
        return `API Error: ${error.message}`;
    }
  }

  if (error instanceof ConfigurationError) {
    return `Configuration Error: ${error.message}`;
  }

  if (error instanceof ValidationError) {
    return `Validation Error: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

export function handleOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    console.error('OpenAI API Error:', {
      status: error.status,
      message: error.message,
      code: error.code as OpenAIErrorCode,
      type: error.type
    });

    throw new APIError(
      formatError(error),
      error.status,
      error.code as OpenAIErrorCode
    );
  }

  console.error('Unexpected Error:', error);
  throw new Error(formatError(error));
}

type ValidFileType = 
  | 'application/pdf'
  | 'text/plain'
  | 'application/msword'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const VALID_FILE_TYPES: ValidFileType[] = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export function validateResume(file: File | null): void {
  if (!file) {
    throw new ValidationError('No resume file provided');
  }

  if (!VALID_FILE_TYPES.includes(file.type as ValidFileType)) {
    throw new ValidationError(
      'Invalid file type. Please upload a PDF, DOC, DOCX, or TXT file.'
    );
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      'File too large. Maximum size is 5MB.'
    );
  }
}

export function validateJobDescription(text: string): void {
  if (!text.trim()) {
    throw new ValidationError('Job description cannot be empty');
  }

  const MIN_LENGTH = 50;
  if (text.trim().length < MIN_LENGTH) {
    throw new ValidationError(
      `Job description must be at least ${MIN_LENGTH} characters long`
    );
  }

  const MAX_LENGTH = 5000;
  if (text.length > MAX_LENGTH) {
    throw new ValidationError(
      `Job description cannot exceed ${MAX_LENGTH} characters`
    );
  }
}