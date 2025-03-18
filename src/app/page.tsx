'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import JobDescription from '@/components/JobDescription';
import AnalysisResult from '@/components/AnalysisResult';
import type { ResumeAnalysis } from './types';

export default function Home() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis>({
    result: null,
    isLoading: false,
    error: null,
  });

  const handleFileUpload = (file: File) => {
    if (!file.type.match('application/pdf') && !file.type.match('text/plain')) {
      setAnalysis({
        result: null,
        isLoading: false,
        error: 'Please upload a PDF or TXT file',
      });
      return;
    }
    
    setResumeFile(file);
    setAnalysis({ result: null, isLoading: false, error: null });
  };

  const handleJobDescriptionSubmit = async (description: string) => {
    if (!resumeFile) {
      setAnalysis({
        result: null,
        isLoading: false,
        error: 'Please upload a resume first',
      });
      return;
    }

    setAnalysis({ ...analysis, isLoading: true, error: null });

    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('jobDescription', description);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze resume');
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setAnalysis({
        result: {
          score: result.score,
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
        },
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setAnalysis({
        result: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to analyze resume. Please try again.',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Smart Resume Analyzer
        </h1>
        <p className="text-lg text-gray-600">
          Upload your resume and compare it with job descriptions to find the perfect match
        </p>
      </div>

      <div className="space-y-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 1: Upload Your Resume
          </h2>
          <FileUpload onFileUpload={handleFileUpload} />
          {resumeFile && (
            <p className="mt-2 text-sm text-green-600 text-center">
              ✓ {resumeFile.name} uploaded successfully
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Step 2: Enter Job Description
          </h2>
          <JobDescription onJobDescriptionSubmit={handleJobDescriptionSubmit} />
        </div>

        {analysis.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
            {analysis.error}
          </div>
        )}

        {(analysis.isLoading || analysis.result) && (
          <AnalysisResult
            score={analysis.result?.score ?? 0}
            matchedSkills={analysis.result?.matchedSkills ?? []}
            missingSkills={analysis.result?.missingSkills ?? []}
            isLoading={analysis.isLoading}
          />
        )}
      </div>
    </div>
  );
}
