// Include our DOMMatrix polyfill (for pdfjs-dist in SSR)
import './domMatrixPolyfill';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { analyzeResume as localAnalyzeResume } from './localAnalysis';
import { Buffer } from 'buffer';

// PDF.js worker setup
// (Optional) In case you'd like to do PDF parsing here as well
const pdfjsLib = await import('pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js';

/**
 * Analyzes resume and job description to provide matching analysis
 */
export async function analyzeResume(formData: FormData, signal?: AbortSignal) {
  // Extract text content from FormData
  const resumeText = formData.get('resume');
  const jobDescriptionText = formData.get('jobDescription');

  if (typeof resumeText !== 'string') {
    throw new Error('Resume text is required');
  }

  if (typeof jobDescriptionText !== 'string') {
    throw new Error('Job description text is required');
  }

  // Debug logs
  console.log('Resume text preview in analyzer:', resumeText.substring(0, 200));
  console.log('Job description preview in analyzer:', jobDescriptionText.substring(0, 200));

  // Perform the analysis using the local analyzer
  const result = localAnalyzeResume(resumeText, jobDescriptionText);
  
  // Debug logs
  console.log('Analysis result:', {
    score: result.score,
    matchedSkillsCount: result.matchedSkills.filter(s => s.match).length,
    missingSkillsCount: result.missingSkills.length
  });

  return result;
}