'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ResumeGenerator from '@/components/ResumeGenerator';
import type { Analysis } from '../types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ResumeBuilderPage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('latestAnalysis') : null;
    const storedJobDescription = typeof window !== 'undefined' ? sessionStorage.getItem('latestJobDescription') : null;

    if (stored) {
      try {
        setAnalysis(JSON.parse(stored));
        setJobDescription(storedJobDescription ?? '');
      } catch {
        setAnalysis(null);
      }
    }
  }, []);

  const handleNewAnalysis = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('latestAnalysis');
      sessionStorage.removeItem('latestJobDescription');
      sessionStorage.removeItem('latestGeneratedResume');
      sessionStorage.removeItem('latestResumeGenerationAnswers');
    }
    router.push('/');
  };

  if (!analysis) {
    return (
      <div className="clay-shell flex items-center justify-center px-6">
        <div className="clay-content clay-panel max-w-md space-y-4 p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">No resume analysis found.</p>
          <p className="text-sm text-gray-600">Run an analysis before opening the resume builder.</p>
          <Link
            href="/"
            className="clay-button inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white"
          >
            Go to Analyzer
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="clay-shell px-4 py-6 sm:px-8">
      <div className="clay-content mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="clay-kicker text-xs font-bold uppercase">Resume Fit Studio</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Resume Builder</h1>
            <p className="text-sm text-slate-600">Generate a role-tailored resume preview from the report evidence.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/result"
              className="clay-secondary-button inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-slate-800"
            >
              Back to Report
            </Link>
            <button
              onClick={handleNewAnalysis}
              className="clay-secondary-button inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-slate-800"
            >
              New Analysis
            </button>
          </div>
        </div>

        <ResumeGenerator analysis={analysis} jobDescription={jobDescription} />
      </div>
    </div>
  );
}
