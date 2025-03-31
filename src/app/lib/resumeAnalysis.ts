import { Analysis } from '../types';
import { ConfigurationError } from './errors';
import { analyzeResume as deepseekAnalyze } from './deepseek';

export async function analyzeResume(
  formData: FormData,
  signal?: AbortSignal
): Promise<Analysis> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError('Deepseek API key is not configured');
  }

  const resumeFile = formData.get('resume') as File;
  const jobDescription = formData.get('jobDescription') as string;

  if (!resumeFile || !jobDescription) {
    throw new Error('Missing required input');
  }

  let resumeText = '';
  try {
    resumeText = await resumeFile.text();
  } catch (error) {
    console.error('File processing error:', error);
    throw new Error(`Failed to process file: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Create new FormData with processed content
  const processedFormData = new FormData();
  processedFormData.append('resume', new Blob([resumeText], { type: 'text/plain' }));
  processedFormData.append('jobDescription', jobDescription);

  try {
    return await deepseekAnalyze(processedFormData, signal);
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}