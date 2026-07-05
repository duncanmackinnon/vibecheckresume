'use client';

import { useEffect, useState } from 'react';
import AnalysisResult from '@/components/AnalysisResult';
import type { Analysis } from '../types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ResultPage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('latestAnalysis') : null;
    if (stored) {
      try {
        setAnalysis(JSON.parse(stored));
      } catch {
        setAnalysis(null);
      }
    }
  }, []);

  const handleNewAnalysis = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('latestAnalysis');
      sessionStorage.removeItem('latestJobDescription');
    }
    router.push('/');
  };

  if (!analysis) {
    return (
      <div className="clay-shell flex items-center justify-center px-6">
        <div className="clay-content clay-panel max-w-md space-y-4 p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">No analysis to show yet.</p>
          <p className="text-sm text-gray-600">Upload a resume and job description first.</p>
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
            <h1 className="mt-2 text-3xl font-black text-slate-950">Analysis Report</h1>
            <p className="text-sm text-slate-600">AI-enhanced resume and job-description match</p>
          </div>
          <button
            onClick={handleNewAnalysis}
            className="clay-secondary-button inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-slate-800"
          >
            New Analysis
          </button>
        </div>

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
          evaluation={analysis.evaluation}
          roleRequirements={analysis.roleRequirements}
          priorityActions={analysis.priorityActions}
          onNewAnalysis={handleNewAnalysis}
        />

        <section className="clay-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Next Step</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">Build a tailored resume</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Use the extracted resume profile, this report, and targeted follow-up questions to generate a LaTeX resume.
              </p>
            </div>
            <Link
              href="/resume-builder"
              className="clay-button inline-flex items-center justify-center px-4 py-3 text-sm font-bold text-white"
            >
              Open Resume Builder
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
