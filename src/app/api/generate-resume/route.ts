import { NextRequest, NextResponse } from 'next/server';
import { generateTailoredResume } from '@/app/lib/resumeGenerator';
import {
  createInitialResumeGenerationAnswers,
  getResumeGenerationQuestions,
} from '@/app/lib/resumeGeneratorQuestions';
import type { Analysis, ResumeGenerationAnswers } from '@/app/types';
import { env } from '@/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_GENERATE_REQUEST_BYTES = 1024 * 1024;
const MAX_JOB_DESCRIPTION_CHARS = 256 * 1024;

type GenerateResumeBody = {
  analysis?: unknown;
  jobDescription?: unknown;
  answers?: unknown;
};

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

function createResponse(data: unknown, status: number = 200): NextResponse {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });

  return new NextResponse(JSON.stringify(JSON.parse(JSON.stringify(data))), {
    status,
    headers,
  });
}

function createErrorResponse(error: string, status: number = 500): NextResponse {
  return createResponse({ error }, status);
}

function isAnalysis(value: unknown): value is Analysis {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Analysis).score === 'number' &&
    Array.isArray((value as Analysis).matchedSkills) &&
    Array.isArray((value as Analysis).missingSkills) &&
    typeof (value as Analysis).recommendations === 'object' &&
    typeof (value as Analysis).detailedAnalysis === 'string'
  );
}

function normalizeAnswers(value: unknown): ResumeGenerationAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<ResumeGenerationAnswers>((answers, [key, answer]) => {
    if (typeof answer === 'string') {
      answers[key] = answer.replace(/\0/g, '').trim();
    }
    return answers;
  }, {});
}

function validateRequiredAnswers(
  analysis: Analysis,
  answers: ResumeGenerationAnswers,
  jobDescription: string
): string | null {
  const profileRequired = [
    { id: 'fullName', label: 'Full name' },
    { id: 'contactDetails', label: 'Contact details' },
    { id: 'targetTitle', label: 'Target title' },
  ];
  const missingProfile = profileRequired
    .filter((question) => !answers[question.id]?.trim())
    .map((question) => question.label);
  const missingDynamic = getResumeGenerationQuestions(analysis, jobDescription)
    .filter((question) => question.required && !answers[question.id]?.trim())
    .map((question) => question.label);
  const missing = Array.from(new Set([...missingProfile, ...missingDynamic]));

  if (missing.length > 0) {
    return `Missing required resume generator answers: ${missing.join(', ')}`;
  }

  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return createErrorResponse(`Invalid content type: ${contentType}`, 400);
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_GENERATE_REQUEST_BYTES) {
      return createErrorResponse('Resume generation request is too large.', 413);
    }

    let body: GenerateResumeBody;
    try {
      body = await request.json();
    } catch (error) {
      return createErrorResponse(`Failed to parse JSON: ${sanitizeError(error)}`, 400);
    }

    if (!body || typeof body !== 'object') {
      return createErrorResponse('Request body must be a JSON object.', 400);
    }

    if (!isAnalysis(body.analysis)) {
      return createErrorResponse('Missing valid analysis data for resume generation.', 400);
    }

    const jobDescription = typeof body.jobDescription === 'string'
      ? body.jobDescription.replace(/\0/g, '').trim()
      : '';

    if (jobDescription.length > MAX_JOB_DESCRIPTION_CHARS) {
      return createErrorResponse('Job description is too large.', 413);
    }

    const answers = {
      ...createInitialResumeGenerationAnswers(body.analysis, jobDescription),
      ...normalizeAnswers(body.answers),
    };
    const answerError = validateRequiredAnswers(body.analysis, answers, jobDescription);
    if (answerError) {
      return createErrorResponse(answerError, 400);
    }

    if (!env.api.deepseek.isConfigured) {
      return createErrorResponse(
        'AI resume generation is not configured. Set DEEPSEEK_API_KEY before generating resumes.',
        500
      );
    }

    console.log('Starting resume generation request:', {
      score: body.analysis.score,
      jobDescriptionLength: jobDescription.length,
      answeredQuestions: Object.values(answers).filter(Boolean).length,
    });

    const generatedResume = await generateTailoredResume({
      analysis: body.analysis,
      jobDescription,
      answers,
    });

    return createResponse(generatedResume);
  } catch (error) {
    console.error('Resume generation route error:', error);
    return createErrorResponse(sanitizeError(error));
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
