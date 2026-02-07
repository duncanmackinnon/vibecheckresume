'use client';

import { useEffect, useState } from 'react';
import AnalysisResult from '@/components/AnalysisResult';
import type { Analysis } from '../types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
    }
    router.push('/');
  };

  if (!analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
          <p className="text-lg font-semibold text-gray-800">No analysis to show yet.</p>
          <p className="text-sm text-gray-600">Upload a resume and job description first.</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
          >
            Go to Analyzer
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Analysis Report</h1>
            <p className="text-sm text-slate-600">AI-enhanced resume/job description match</p>
          </div>
          <button
            onClick={handleNewAnalysis}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-sm"
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
          onNewAnalysis={handleNewAnalysis}
        />
      </div>
    </div>
  );
}
