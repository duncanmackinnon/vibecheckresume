import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { analyzeResume as localAnalyze } from '@/app/lib/localAnalysis';
import {
  validateResume,
  validateJobDescription,
  ValidationError
} from '@/app/lib/errors';
import { extractPdfText } from '@/app/lib/pdfUtils';
import { logRequest, logResponse } from './middleware';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Matches Vercel's 10s timeout limit
export const fetchCache = 'force-no-store';

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

function createResponse(data: unknown, status: number = 200): NextResponse {
  // Ensure the data is JSON-serializable
  try {
    const sanitizedData = JSON.parse(JSON.stringify(data));
    const response = new NextResponse(JSON.stringify(sanitizedData), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });

    // Log the response for debugging
    logResponse(response);
    return response;
  } catch (error) {
    console.error('Error creating response:', error);
    return createErrorResponse('Internal server error: Failed to serialize response');
  }
}

function createErrorResponse(error: string, status: number = 500): NextResponse {
  return createResponse({ error }, status);
}

function ensureFile(blob: Blob, name: string = 'file'): File {
  if (blob instanceof File) return blob;
  return new File([blob], name, { type: blob.type });
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

    console.log('Processing files:', {
      resume: {
        name: resumeFile.name,
        type: resumeFile.type,
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
    let jobDescription: string;

    try {
      // Handle PDF files
      if (resumeFile.type === 'application/pdf') {
        console.log('Extracting text from PDF...');
        resumeText = await extractPdfText(resumeFile);
      } else {
        resumeText = await resumeFile.text();
      }

      jobDescription = await jobDescriptionBlob.text();

      // Log extracted content lengths
      console.log('Content extracted:', {
        resumeLength: resumeText.length,
        jobDescriptionLength: jobDescription.length,
        resumePreview: resumeText.substring(0, 100),
        jobDescriptionPreview: jobDescription.substring(0, 100)
      });

      // Validate content
      if (!resumeText?.trim() || resumeText.length < 10) {
        return createErrorResponse('Resume text too short or empty', 400);
      }
      if (!jobDescription?.trim() || jobDescription.length < 10) {
        return createErrorResponse('Job description too short or empty', 400);
      }

    } catch (error) {
      console.error('Text extraction error:', error);
      return createErrorResponse(
        `Failed to extract text: ${sanitizeError(error)}`,
        400
      );
    }

    try {
      // Attempt analysis with timeout
      interface AnalysisResult {
        score: number;
        summary: string;
        strengths: string[];
        weaknesses: string[];
      }

      // Ensure both Promise.race parameters return the same type
      console.log('Starting analysis at', Date.now());
      const analysisPromise: Promise<AnalysisResult> = env.api.deepseek.isConfigured
        ? (async () => {
            console.log('Calling analyzeWithAI at', Date.now());
            const result = await analyzeWithAI(resumeText, jobDescription);
            console.log('analyzeWithAI resolved at', Date.now());
            return result;
          })()
        : (async () => {
            console.log('Calling localAnalyze at', Date.now());
            const result = await localAnalyze(resumeText, jobDescription);
            console.log('localAnalyze resolved at', Date.now());
            return result;
          })();
      
      const analysis = await Promise.race<AnalysisResult>([
        analysisPromise,
        new Promise<AnalysisResult>((_, reject) =>
          setTimeout(() => {
            console.log('Timeout triggered at', Date.now());
            reject(new Error('Analysis timed out after 120 seconds'));
          }, 120000)
        )
      ]);

      // Validate analysis result structure
      if (
        !analysis?.score ||
        typeof (analysis as any).summary !== 'string' ||
        !Array.isArray((analysis as any).strengths) ||
        !Array.isArray((analysis as any).weaknesses)
      ) {
        // Attempt to map fields from the returned analysis to match AnalysisResult
        const a: any = analysis;
        const mapped = {
          score: a?.score ?? 0,
          summary: a?.detailedAnalysis ?? '',
          strengths: a?.recommendations?.strengths ?? [],
          weaknesses: a?.recommendations?.improvements ?? [],
        };
        if (
          mapped.score &&
          typeof mapped.summary === 'string' &&
          Array.isArray(mapped.strengths) &&
          Array.isArray(mapped.weaknesses)
        ) {
          console.warn('Analysis result did not match expected structure, but was mapped successfully.');
          (analysis as any).summary = mapped.summary;
          (analysis as any).strengths = mapped.strengths;
          (analysis as any).weaknesses = mapped.weaknesses;
        } else {
          console.error('Invalid analysis result:', analysis);
          throw new Error('Invalid analysis result structure');
        }
      }

      // Serialize response
      try {
        const response = createResponse(analysis);
        console.log('Analysis completed in ${Date.now() - startTime}ms');
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