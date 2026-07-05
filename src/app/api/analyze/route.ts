import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { extractPdfText } from '@/app/lib/pdfUtils';
import { extractResumeBuilderProfileFromText, mergeResumeBuilderProfiles } from '@/app/lib/resumeBuilderProfile';
import { logRequest, logResponse } from './middleware';
import { env } from '@/utils/env';

// Force Serverless runtime (not Edge) so Vercel honors extended timeouts / Fluid compute.
export const runtime = 'nodejs';
export const maxDuration = 300; // hobby+fluid allows up to 300s; ignored otherwise
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const MAX_JOB_DESCRIPTION_BYTES = 256 * 1024;
const MIN_USEFUL_TEXT_LENGTH = 25;
const ACCEPTED_RESUME_TYPES = new Set(['application/pdf', 'text/plain']);

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

function createResponse(data: unknown, status: number = 200): NextResponse {
  // Ensure the data is JSON-serializable
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });

  try {
    const sanitizedData = JSON.parse(JSON.stringify(data));
    const response = new NextResponse(JSON.stringify(sanitizedData), {
      status,
      headers,
    });

    // Log the response for debugging
    logResponse(response);
    return response;
  } catch (error) {
    console.error('Error creating response:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error: Failed to serialize response' }),
      {
        status: 500,
        headers,
      }
    );
  }
}

function createErrorResponse(error: string, status: number = 500): NextResponse {
  return createResponse({ error }, status);
}

function ensureFile(blob: Blob, name: string = 'file'): File {
  if (blob instanceof File) return blob;
  return new File([blob], name, { type: blob.type });
}

function getResumeContentType(file: File): string {
  const explicitType = file.type?.toLowerCase();
  if (ACCEPTED_RESUME_TYPES.has(explicitType)) return explicitType;

  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';

  return explicitType || 'unknown';
}

function validateResumeUpload(file: File, contentType: string): string | null {
  if (file.size <= 0) return 'Resume file is empty';
  if (file.size > MAX_RESUME_BYTES) return 'Resume file is too large. Upload a PDF or TXT file under 8 MB.';
  if (!ACCEPTED_RESUME_TYPES.has(contentType)) return 'Unsupported resume file type. Upload a PDF or TXT file.';
  return null;
}

function validateJobDescriptionUpload(file: File): string | null {
  if (file.size <= 0) return 'Job description is empty';
  if (file.size > MAX_JOB_DESCRIPTION_BYTES) return 'Job description is too large. Paste a shorter job description.';
  return null;
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Log environment configuration
  env.logConfig();
  
  // Log incoming request
  await logRequest(request);

  console.log('Starting new analysis request...');
  
  try {
    // Verify request content type
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('multipart/form-data')) {
      return createErrorResponse(`Invalid content type: ${contentType}`, 400);
    }

    // Get the form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error('FormData parsing error:', error);
      return createErrorResponse(
        `Failed to parse form data: ${sanitizeError(error)}`,
        400
      );
    }

    // Get and validate files
    const resume = formData.get('resume');
    const jobDescriptionFile = formData.get('jobDescription');

    if (!resume || !jobDescriptionFile) {
      return createErrorResponse('Missing required files', 400);
    }

    // Type checking and conversion
    if (!(resume instanceof Blob) || !(jobDescriptionFile instanceof Blob)) {
      return createErrorResponse('Invalid file format', 400);
    }

    // Convert blobs to files
    const resumeFile = ensureFile(resume, 'resume');
    const jobDescriptionBlob = ensureFile(jobDescriptionFile, 'jobDescription');
    const resumeContentType = getResumeContentType(resumeFile);

    const resumeUploadError = validateResumeUpload(resumeFile, resumeContentType);
    if (resumeUploadError) {
      return createErrorResponse(resumeUploadError, 400);
    }

    const jobDescriptionUploadError = validateJobDescriptionUpload(jobDescriptionBlob);
    if (jobDescriptionUploadError) {
      return createErrorResponse(jobDescriptionUploadError, 400);
    }

    console.log('Processing files:', {
      resume: {
        name: resumeFile.name,
        type: resumeContentType,
        size: resumeFile.size
      },
      jobDescription: {
        name: jobDescriptionBlob.name,
        type: jobDescriptionBlob.type,
        size: jobDescriptionBlob.size
      }
    });

    // Extract text content
    let resumeText: string;
    let rawResumeText = '';
    let jobDescription: string;

    try {
      // Handle PDF files
      if (resumeContentType === 'application/pdf') {
        console.log('Extracting text from PDF...');
        rawResumeText = await extractPdfText(resumeFile);
      } else {
        rawResumeText = await resumeFile.text();
      }

      jobDescription = await jobDescriptionBlob.text();
      resumeText = normalizeExtractedText(rawResumeText);
      jobDescription = normalizeExtractedText(jobDescription);

      // Log extracted content lengths
      console.log('Content extracted:', {
        resumeLength: resumeText.length,
        jobDescriptionLength: jobDescription.length,
      });

      // Validate content
      if (!resumeText || resumeText.length < MIN_USEFUL_TEXT_LENGTH) {
        return createErrorResponse('Resume text is too short or could not be read. Upload a text-based PDF or TXT resume.', 400);
      }
      if (!jobDescription || jobDescription.length < MIN_USEFUL_TEXT_LENGTH) {
        return createErrorResponse('Job description is too short. Paste the full job description before analyzing.', 400);
      }

    } catch (error) {
      console.error('Text extraction error:', error);
      return createErrorResponse(
        `Failed to extract text: ${sanitizeError(error)}`,
        400
      );
    }

    try {
      if (!env.api.deepseek.isConfigured) {
        return createErrorResponse(
          'AI analysis is not configured. Set DEEPSEEK_API_KEY before running analysis.',
          500
        );
      }

      // Attempt analysis with timeout. On Hobby w/Fluid, allow up to 300s; otherwise Vercel will cap earlier.
      const ANALYSIS_TIMEOUT_MS = 280_000; // slightly under 300s ceiling

      console.log('Starting analysis at', Date.now());

      const analysisPromise = (async () => {
        console.log('Calling analyzeWithAI at', Date.now());
        const result = await analyzeWithAI(resumeText, jobDescription);
        console.log('analyzeWithAI resolved at', Date.now());
        return result;
      })();

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          console.log('AI analysis timeout triggered at', Date.now());
          reject(new Error('AI analysis timed out. Please try again.'));
        }, ANALYSIS_TIMEOUT_MS);
      });
      
      const analysis = await Promise.race([
        analysisPromise,
        timeoutPromise
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

      // Normalize and validate analysis result structure
      const normalizeSkillNames = (arr: any): string[] => {
        if (!Array.isArray(arr)) return [];
        const stop = new Set(['cloud', 'backend', 'frontend', 'soft skills', 'soft_skills', 'communication']);
        const seen = new Set<string>();
        return arr
          .map((s) => (typeof s === 'string' ? s : s?.name))
          .filter(Boolean)
          .map((s) => String(s).replace(/\s+/g, ' ').trim())
          .filter((s) => {
            const key = s.toLowerCase().replace(/\s+/g, '_');
            if (stop.has(key) && !/(aws|azure|gcp|kubernetes)/i.test(s)) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      };

      const normalizeMatchedSkills = (arr: any): Array<{ name: string; match: boolean }> => {
        return normalizeSkillNames(arr).map((name) => ({ name, match: true }));
      };

      const normalizeTextList = (arr: any): string[] => {
        if (!Array.isArray(arr)) return [];
        const stop = ['cloud', 'backend', 'frontend', 'soft skills', 'soft_skills', 'communication'];
        return Array.from(
          new Set(
            arr
              .map((s) => (typeof s === 'string' ? s : s?.toString()))
              .filter(Boolean)
              .map((s) => s.trim())
              .filter((s) => s.length > 2)
              .filter((s) => !stop.includes(s.toLowerCase()) && !/:\s*(cloud|communication|soft skills)/i.test(s))
          )
        );
      };

      const rawScore = typeof (analysis as any)?.score === 'number' && !Number.isNaN((analysis as any).score)
        ? (analysis as any).score
        : 0;
      const evaluation = (analysis as any)?.evaluation;
      const resumeSections = (analysis as any)?.resumeSections;
      const resumeBuilderProfile = mergeResumeBuilderProfiles(
        (analysis as any)?.resumeBuilderProfile,
        extractResumeBuilderProfileFromText(rawResumeText)
      );
      const roleRequirements = (analysis as any)?.roleRequirements;
      const priorityActions = (analysis as any)?.priorityActions;

      const normalized = {
        score: Math.max(0, Math.min(100, Math.round(rawScore))),
        matchedSkills: normalizeMatchedSkills((analysis as any)?.matchedSkills),
        missingSkills: normalizeSkillNames((analysis as any)?.missingSkills),
        recommendations: {
          improvements: normalizeTextList((analysis as any)?.recommendations?.improvements ?? []),
          strengths: normalizeTextList((analysis as any)?.recommendations?.strengths ?? []),
          skillGaps: normalizeTextList((analysis as any)?.recommendations?.skillGaps ?? []),
          format: normalizeTextList((analysis as any)?.recommendations?.format ?? []),
        },
        detailedAnalysis: typeof (analysis as any)?.detailedAnalysis === 'string'
          ? (analysis as any).detailedAnalysis
          : ((analysis as any)?.summary as string) ?? '',
        ...(evaluation && typeof evaluation === 'object' ? { evaluation } : {}),
        ...(resumeSections && typeof resumeSections === 'object' ? { resumeSections } : {}),
        ...(resumeBuilderProfile ? { resumeBuilderProfile } : {}),
        ...(Array.isArray(roleRequirements) ? { roleRequirements } : {}),
        ...(Array.isArray(priorityActions) ? { priorityActions } : {}),
      };

      // Serialize response
      try {
        const response = createResponse(normalized);
        console.log('Analysis completed successfully');
        return response;
      } catch (serializeError) {
        console.error('Response serialization failed:', serializeError);
        throw new Error('Failed to serialize analysis result', { cause: serializeError });
      }

    } catch (error) {
      console.error('Analysis error:', {
        error: error instanceof Error ? error.stack : error,
        resumeLength: resumeText?.length,
        jdLength: jobDescription?.length
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown analysis error';
      return createErrorResponse(
        errorMessage,
        500
      );
    }

  } catch (error) {
    console.error('Unhandled error:', error);
    return createErrorResponse(sanitizeError(error));
  }
}

// Handle OPTIONS requests for CORS
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
