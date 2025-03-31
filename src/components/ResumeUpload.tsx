'use client';

import { useEffect, useState } from 'react';
import { analyzeResume } from '../app/lib/deepseek';

interface PDFTextResult {
  text: string;
  success: boolean;
}
import FileUpload from './FileUpload';
import JobDescription from './JobDescription';
import AnalysisResult from './AnalysisResult';
import LoadingSpinner from './LoadingSpinner';
import type { Analysis } from '@/app/types';

export default function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isEnvironmentValid, setIsEnvironmentValid] = useState(true);
  const supportedFileTypes = ['application/pdf', 'text/plain'];

  useEffect(() => {
    // Check environment configuration on client-side
    async function validateEnvironment() {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (!data.status || data.status !== 'ok') {
          setIsEnvironmentValid(false);
          setError('Application configuration error. Please contact support.');
        }
      } catch (error) {
        setIsEnvironmentValid(false);
        setError('Unable to verify application configuration.');
      }
    }

    validateEnvironment();
    
    // Reset any stale state
    setIsLoading(false);
    setAnalysis(null);
  }, []);

  const handleFile = (newFile: File) => {
    setFile(newFile);
    setError(null);
    setAnalysis(null);
    setIsLoading(false);
  };

  const [prevInputs, setPrevInputs] = useState({
    file: null as File | null,
    jobDescriptionFile: null as File | null
  });

  const handleSubmit = async (jobDescriptionFile: File) => {
    if (!isEnvironmentValid || !file) {
      setError('Application is not properly configured. Please try again later.');
      setIsLoading(false);
      return;
    }

    // Reset analysis if inputs changed
    if (file !== prevInputs.file || jobDescriptionFile !== prevInputs.jobDescriptionFile) {
      setAnalysis(null);
      setPrevInputs({ file, jobDescriptionFile });
    }

    setError(null);
    setIsLoading(true);

    // Validate file type first
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      setError('Unsupported file type. Please upload PDF or text files');
      setIsLoading(false);
      return;
    }

    // Process PDF files
    let analysisContent = file;
    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        let extractedText = '';

        // Upload raw PDF file to API (matches Deepseek web interface)
        try {
          const formData = new FormData();
          formData.append('resume', new Blob([arrayBuffer], {type: 'application/pdf'}), file.name);
          formData.append('jobDescription', 'dummy');
          
          const analysis = await analyzeResume(formData);
          extractedText = analysis.detailedAnalysis;
        } catch (error) {
          console.error('PDF upload failed:', error);
          throw new Error('Failed to upload PDF. Please try another file.');
        }

        // Validate extracted text
        if (!extractedText?.trim() || extractedText.length < 100) {
          throw new Error('PDF appears to be empty or unreadable');
        }

        if (!/[a-zA-Z]{4,}/.test(extractedText)) {
          throw new Error('PDF contains no readable text content');
        }

        analysisContent = new File([extractedText], file.name, {
          type: 'text/plain',
          lastModified: Date.now()
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'PDF processing failed';
        setError(`PDF Error: ${errorMsg}`);
        setIsLoading(false);
        return;
      }
    }

    // Prepare form data with validated content
    // Prepare form data with validated content
    const formData = new FormData();
    formData.append('resume', analysisContent);
    formData.append('jobDescription', jobDescriptionFile);
    formData.append('originalFormat', file.type);
    formData.append('contentType', analysisContent.type);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze resume');
      }

      setAnalysis(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze resume';
      setError(`Analysis Error: ${message}`);
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isEnvironmentValid) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Configuration Error</strong>
        <p className="mt-2">The application is not properly configured. Please try again later or contact support.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Upload Resume</h2>
        <FileUpload onFileUpload={handleFile} />
        {file && (
          <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center">
            <svg 
              className="h-5 w-5 mr-2" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            <span>{file.name} uploaded successfully</span>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Enter Job Description</h2>
        <JobDescription 
          onJobDescriptionSubmit={handleSubmit}
          isDisabled={!file || isLoading}
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-8 bg-white rounded-lg shadow-sm">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">
            Analyzing your resume...
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 p-6 rounded-lg shadow-sm">
          <div className="flex items-center text-red-700">
            <svg 
              className="h-5 w-5 mr-2" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Error:</span>
            <span className="ml-2">{error}</span>
          </div>
        </div>
      )}

      {analysis && (
        <>
          <pre className="hidden">{JSON.stringify(analysis, null, 2)}</pre>
          <AnalysisResult
            matchScore={analysis.score}
            strengths={analysis.recommendations?.strengths || []}
            weaknesses={analysis.recommendations?.improvements || []}
            missingSkills={analysis.missingSkills}
            recommendations={[
              ...(analysis.recommendations?.skillGaps || []),
              ...(analysis.recommendations?.format || [])
            ]}
            detailedAnalysis={analysis.detailedAnalysis}
          />
        </>
      )}
    </div>
  );
}