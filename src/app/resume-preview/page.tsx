'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ResumePreview from '@/components/ResumePreview';
import type { GeneratedResume } from '../types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isGeneratedResume(value: unknown): value is GeneratedResume {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as GeneratedResume).latex === 'string' &&
    (value as GeneratedResume).preview &&
    typeof (value as GeneratedResume).preview.fullName === 'string' &&
    Array.isArray((value as GeneratedResume).preview.contact) &&
    Array.isArray((value as GeneratedResume).preview.sections) &&
    Array.isArray((value as GeneratedResume).preview.skillGroups) &&
    Array.isArray((value as GeneratedResume).tailoringNotes) &&
    Array.isArray((value as GeneratedResume).followUpQuestions)
  );
}

export default function ResumePreviewPage() {
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('latestGeneratedResume') : null;

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (isGeneratedResume(parsed)) {
          setGeneratedResume(parsed);
        }
      } catch {
        setGeneratedResume(null);
      }
    }

    setLoaded(true);
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

  if (!loaded) {
    return (
      <div className="clay-shell flex items-center justify-center px-6">
        <div className="clay-content clay-panel max-w-md p-8 text-center text-sm font-semibold text-slate-700">
          Loading resume preview...
        </div>
      </div>
    );
  }

  if (!generatedResume) {
    return (
      <div className="clay-shell flex items-center justify-center px-6">
        <div className="clay-content clay-panel max-w-md space-y-4 p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">No generated resume found.</p>
          <p className="text-sm text-gray-600">Generate a tailored resume before opening the preview.</p>
          <Link
            href="/resume-builder"
            className="clay-button inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white"
          >
            Go to Resume Builder
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="clay-shell px-4 py-6 sm:px-8">
      <div className="clay-content mx-auto max-w-7xl space-y-6">
        <div className="resume-preview-chrome flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="clay-kicker text-xs font-bold uppercase">Resume Fit Studio</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Resume Preview</h1>
            <p className="text-sm text-slate-600">Review the formatted resume before copying or downloading the LaTeX.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/resume-builder"
              className="clay-secondary-button inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-slate-800"
            >
              Back to Builder
            </Link>
            <Link
              href="/result"
              className="clay-secondary-button inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-slate-800"
            >
              Back to Report
            </Link>
            <button
              type="button"
              onClick={handleNewAnalysis}
              className="clay-secondary-button inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-slate-800"
            >
              New Analysis
            </button>
          </div>
        </div>

        <ResumePreview generatedResume={generatedResume} />
      </div>
    </div>
  );
}
