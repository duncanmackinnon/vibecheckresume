import { NextRequest } from 'next/server';
import { analyzeResume } from '@/app/lib/deepseek';
import {
  validateResume,
  validateJobDescription,
  ValidationError
} from '@/app/lib/errors';

const getAnalyzer = () => analyzeResume;

export async function POST(request: NextRequest) {
  console.log('Starting new analysis request...');
  const startTime = Date.now();

  try {
    // Parse the request
    const formData = await request.formData();
    const resume = formData.get('resume');
    const jobDescriptionFile = formData.get('jobDescription');
    
    if (!(resume instanceof File)) {
      throw new ValidationError('Invalid resume file upload');
    }
    if (!(jobDescriptionFile instanceof File)) {
      throw new ValidationError('Invalid job description file upload');
    }
    
    const jobDescription = await jobDescriptionFile.text();

    try {
      // Validate inputs
      validateResume(resume);
      validateJobDescription(jobDescription);
    } catch (error) {
      if (error instanceof ValidationError) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      throw error;
    }

    // Log file details
    console.log('Resume file details:', {
      name: resume.name,
      type: resume.type,
      size: resume.size
    });

    // Get resume text content
    const resumeText = await resume.text();
    console.log('Successfully extracted resume text, length:', resumeText.length);

    // Perform analysis with timeout
    console.log('Starting resume analysis...');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.log('Analysis timeout after 90 seconds');
    }, 90000); // Balanced timeout for single-pass processing
    
    try {
      const analyzeResume = getAnalyzer();
      const formData = new FormData();
      formData.append('resume', resume);
      formData.append('jobDescription', jobDescription);
      const analysis = await analyzeResume(formData, controller.signal);

      clearTimeout(timeout);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Analysis completed in ${duration}s`);
      
      return new Response(
        JSON.stringify(analysis), 
        { 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error) {
        console.error('Analysis error:', error.name, error.message);
        
        if (error.name === 'AbortError') {
          return new Response(
            JSON.stringify({
              error: 'Analysis timed out (120 seconds) - File too large',
              solution: 'Try reducing file size or simplifying job description'
            }),
            {
              status: 504,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }

        if (error.message.includes('Invalid response') ||
            error.message.includes('truncated')) {
          return new Response(
            JSON.stringify({
              error: 'Invalid analysis response',
              details: 'The AI provider returned an incomplete or malformed response'
            }),
            {
              status: 502,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }
      
      throw error;
    }

  } catch (error) {
    console.error('Error during analysis:', error);

    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({ error: error.message }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }
    return new Response(
      JSON.stringify({ error: 'An unknown error occurred' }),
      { status: 500 }
    );
  }
}