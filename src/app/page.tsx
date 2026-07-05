'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const ACCEPTED_RESUME_TYPES = new Set(['application/pdf', 'text/plain']);

function getResumeContentType(file: File): string {
  const explicitType = file.type?.toLowerCase();
  if (ACCEPTED_RESUME_TYPES.has(explicitType)) return explicitType;

  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';

  return explicitType || 'unknown';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateResumeFile(file: File): string | null {
  const contentType = getResumeContentType(file);
  if (!ACCEPTED_RESUME_TYPES.has(contentType)) return 'Upload a PDF or TXT resume.';
  if (file.size > MAX_RESUME_BYTES) return 'Resume file must be under 8 MB.';
  if (file.size <= 0) return 'Resume file is empty.';
  return null;
}

function LoadingSpinner({ className = '', progress, ...props }: { className?: string; progress?: number }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} {...props}>
      <div className="animate-spin h-8 w-8 border-4 border-teal-700 rounded-full border-t-transparent" />
      {progress !== undefined && (
        <div className="absolute text-sm font-bold text-teal-800">
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="clay-panel mt-4 p-4 border-l-4 border-red-500">
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
    type: getResumeContentType(file),
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

    const fileValidationError = validateResumeFile(file);
    if (fileValidationError) {
      setError(fileValidationError);
      return;
    }

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
        sessionStorage.setItem('latestJobDescription', jobDescription.trim());
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
    <div className="clay-shell px-4 py-6 sm:px-8">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 backdrop-blur-sm">
          <div className="clay-panel flex flex-col items-center gap-4 px-10 py-8 text-slate-900">
            <div className="h-24 w-24 rounded-full border-8 border-teal-800/20 border-t-teal-700 animate-spin" style={{ animationDuration: '1.5s' }} />
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">Analyzing with AI...</p>
              <p className="text-sm text-slate-600">Hang tight - this can take a bit.</p>
            </div>
          </div>
        </div>
      )}

      <main className="clay-content mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="clay-kicker text-xs font-bold uppercase">Resume Fit Studio</p>
            <h1 className="text-4xl font-black text-slate-950 sm:text-5xl">
              Resume Match Analyzer
            </h1>
          </div>
          <div className="clay-panel px-4 py-3 text-sm font-semibold text-slate-700">
            Evidence-backed ATS scoring
          </div>
        </header>

        <section className="grid flex-1 gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
          <aside className="clay-panel flex flex-col justify-between gap-8 p-6 sm:p-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                General ATS
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-black leading-tight text-slate-950">
                  Compare resume evidence against the job in front of you.
                </h2>
                <p className="max-w-xl text-sm leading-6 text-slate-600">
                  Upload a PDF resume, paste the role, and get a scored fit report with category evidence.
                </p>
              </div>
            </div>

            <div className="grid gap-4 text-sm text-slate-700">
              {['Structured resume evidence', 'Skill and role alignment', 'Fairness-aware scoring'].map((item, index) => (
                <div key={item} className="flex items-center gap-3 border-t border-white/70 pt-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4c7b4] text-sm font-black text-rose-900 shadow-inner">
                    {index + 1}
                  </span>
                  <span className="font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="clay-panel flex flex-col gap-6 p-6 sm:p-8">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Analyzer Inputs</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Upload and compare</h2>
            </div>

            <div className="space-y-2">
              <label htmlFor="resume-upload" className="block text-sm font-semibold text-slate-700">
                Upload Resume
              </label>
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                id="resume-upload"
                className="clay-input block w-full p-3 text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#f4c7b4] file:px-4 file:py-2 file:text-sm file:font-bold file:text-rose-900 hover:file:bg-[#efb59d]"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    const validationError = validateResumeFile(selectedFile);
                    if (validationError) {
                      setFile(null);
                      setError(validationError);
                      e.currentTarget.value = '';
                      return;
                    }

                    setFile(selectedFile);
                    setError('');
                  }
                }}
                disabled={loading}
              />
              <p className="text-xs text-slate-500">PDF or TXT files under 8 MB.</p>
              {file && (
                <p className="text-xs font-semibold text-teal-800">
                  Selected: {file.name} ({formatFileSize(file.size)})
                </p>
              )}
            </div>

            <div className="flex flex-1 flex-col space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                Job Description
              </label>
              <textarea
                className="clay-input min-h-[240px] w-full flex-1 resize-y p-4 text-sm leading-6 text-slate-800 placeholder:text-slate-400"
                rows={8}
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
              className="clay-button flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white"
            >
              {loading && <LoadingSpinner key="spinner" />}
              {loading ? 'Analyzing...' : 'Analyze Resume'}
            </button>
          </form>
        </section>

        {error && <ErrorDisplay message={error} />}
      </main>
    </div>
  );
}
