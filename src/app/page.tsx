'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Analysis } from './types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function LoadingSpinner({ className = '', progress, ...props }: { className?: string; progress?: number }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} {...props}>
      <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent" />
      {progress !== undefined && (
        <div className="absolute text-sm font-bold text-blue-600">
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-red-700">{message}</p>
        </div>
      </div>
    </div>
  );
}

function sanitizeFile(file: File): File {
  return new File([file], file.name, {
    type: file.type || 'application/octet-stream',
  });
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    router.prefetch('/result');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !jobDescription.trim()) return;

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('resume', sanitizeFile(file));
      const jobDescriptionBlob = new Blob([jobDescription.trim()], { type: 'text/plain' });
      formData.append('jobDescription', jobDescriptionBlob, 'jobDescription.txt');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const status = response.status;
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${status}` })) || { error: `HTTP error! status: ${status}` };
        const errorValue = errorData.error;
        const errorMessage =
          typeof errorValue === 'string'
            ? errorValue
            : errorValue?.message
            ? errorValue.message
            : JSON.stringify(errorValue ?? `HTTP error! status: ${status}`);
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Invalid response type from server');
      }

      const data = await response.json();
      if (!data || typeof data.score !== 'number' || !Array.isArray(data.matchedSkills)) {
        throw new Error('Invalid analysis result structure');
      }

      // Save locally and navigate to dedicated results page
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('latestAnalysis', JSON.stringify(data));
      }
      router.push('/result');
      return; // keep loading true until route changes
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 p-8">
      {loading && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 bg-white/10 text-white px-10 py-8 rounded-2xl border border-white/20 shadow-2xl">
            <div className="h-24 w-24 rounded-full border-8 border-white/25 border-t-indigo-400 animate-spin" style={{ animationDuration: '1.5s' }} />
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">Analyzing with AI...</p>
              <p className="text-sm text-slate-200">Hang tight—this can take a bit.</p>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-2 animate-fade-in">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Resume Match Analyzer
          </h1>
          <p className="text-gray-600">
            Get detailed feedback on how well your resume matches job requirements
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-xl shadow-md transition-all hover:shadow-lg">
          <div className="space-y-1">
            <label htmlFor="resume-upload" className="block text-sm font-medium text-gray-700">
              Upload Resume
            </label>
            <input
              type="file"
              accept="application/pdf"
              id="resume-upload"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  setFile(selectedFile);
                  setError('');
                }
              }}
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Job Description
            </label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={6}
              placeholder="Paste the job description here..."
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value);
                setError('');
              }}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !file || !jobDescription.trim()}
            className="w-full p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2"
          >
            {loading && <LoadingSpinner key="spinner" />}
            {loading ? 'Analyzing...' : 'Analyze Resume'}
          </button>
        </form>

        {error && <ErrorDisplay message={error} />}
      </div>
    </div>
  );
}
