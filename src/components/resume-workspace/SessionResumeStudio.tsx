'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookmarkPlus, ClipboardPaste, FileCheck2, FileText, RotateCcw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import { createInitialResumeGenerationAnswers } from '@/app/lib/resumeGeneratorQuestions';
import {
  readSessionSourceResume,
  writeSessionSourceResume,
  type SessionSourceResume,
} from '@/lib/onboarding/session';
import { PENDING_BUNDLE_KEY } from '@/components/auth/WorkspaceAccess';
import AnalysisResult from '@/components/AnalysisResult';
import ResumeGenerator from '@/components/ResumeGenerator';
import ResumePreview from '@/components/ResumePreview';

interface SavedSourceOption {
  id: string;
  filename: string;
  origin?: 'builder';
}

type StudioStep = 'input' | 'report' | 'builder' | 'preview' | 'kept';

interface StudioSessionData {
  step?: StudioStep;
  jobDescription: string;
  analysis: Analysis | null;
  analysisMode?: 'ai' | 'deterministic';
  answers: ResumeGenerationAnswers;
  generatedResume: GeneratedResume | null;
  generateMode?: 'ai' | 'deterministic';
  selectedSourceResumeId?: string | null;
}

function studioStorageKey(scopeKey: string) {
  return `vibecheck:session-studio:v1:${scopeKey}`;
}

function readStudioSession(scopeKey: string): StudioSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(studioStorageKey(scopeKey));
    if (!raw || raw.length > 1_000_000) return null;
    const parsed = JSON.parse(raw) as StudioSessionData;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStudioSession(scopeKey: string, data: StudioSessionData) {
  try {
    localStorage.setItem(studioStorageKey(scopeKey), JSON.stringify(data));
  } catch {
    /* Optional browser draft cache. */
  }
}

function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}

async function fileToBase64(selected: File): Promise<string> {
  const bytes = new Uint8Array(await selected.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function resolveInitialStep(saved: StudioSessionData): StudioStep {
  if (saved.step === 'kept') return 'kept';
  if (saved.step === 'preview' && saved.generatedResume) return 'preview';
  if (saved.step === 'builder' && saved.analysis) return 'builder';
  if (saved.step === 'report' && saved.analysis) return 'report';
  if (saved.step === 'input') return 'input';
  if (saved.generatedResume) return 'preview';
  if (saved.analysis) return 'report';
  return 'input';
}

export default function SessionResumeStudio({
  applicationId,
  defaultRoleTitle = '',
  defaultJobDescription = '',
  mode = 'library',
  signedIn = false,
  aiConfigured = false,
  savedSources = [],
  onLibrarySaved,
}: {
  applicationId?: string;
  defaultRoleTitle?: string;
  defaultJobDescription?: string;
  mode?: 'library' | 'application';
  signedIn?: boolean;
  aiConfigured?: boolean;
  savedSources?: SavedSourceOption[];
  onLibrarySaved?: () => void;
}) {
  const router = useRouter();
  const scopeKey = applicationId || 'analyze';
  const [step, setStep] = useState<StudioStep>('input');
  const [source, setSource] = useState<SessionSourceResume | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedSourceResumeId, setSelectedSourceResumeId] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState(defaultJobDescription);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'ai' | 'deterministic' | undefined>(undefined);
  const [answers, setAnswers] = useState<ResumeGenerationAnswers>({});
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [generateMode, setGenerateMode] = useState<'ai' | 'deterministic' | undefined>(undefined);
  const [company, setCompany] = useState('');
  const [roleTitle, setRoleTitle] = useState(defaultRoleTitle);
  const [jobUrl, setJobUrl] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [busy, setBusy] = useState<'extract' | 'load' | 'analyze' | 'generate' | 'save' | 'library' | ''>('');
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractingPending = useRef(false);

  const extractUploadedFile = useCallback(async (file: File) => {
    setBusy('extract');
    setError('');
    try {
      let nextSource: SessionSourceResume;
      if (file.type === 'text/plain' || /\.txt$/i.test(file.name)) {
        const text = (await file.text()).replace(/\0/g, '').trim();
        if (text.length < 25) throw new Error('The resume has too little readable text. Upload at least 25 characters.');
        nextSource = {
          schemaVersion: 1,
          filename: file.name,
          mimeType: 'text/plain',
          origin: 'upload',
          text,
          updatedAt: new Date().toISOString(),
        };
      } else {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/resumes/session', { method: 'POST', body: form });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Could not extract text from PDF resume.');
        const pendingPdfBase64 = file.size <= 2_500_000 ? await fileToBase64(file).catch(() => '') : '';
        nextSource = {
          schemaVersion: 1,
          filename: String(payload.filename || file.name),
          mimeType: 'application/pdf',
          origin: 'upload',
          text: String(payload.text || ''),
          ...(pendingPdfBase64 ? { pendingPdfBase64 } : {}),
          updatedAt: new Date().toISOString(),
        };
      }
      writeSessionSourceResume(nextSource);
      setSource(nextSource);
      setUploadedFile(file);
      setSelectedSourceResumeId(null);
      setShowPaste(false);
      toast.success(`Loaded ${nextSource.filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your resume could not be loaded.');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const loadSavedSource = useCallback(async (id: string) => {
    if (!id) return;
    setBusy('load');
    setError('');
    try {
      const res = await fetch(`/api/resumes/${encodeURIComponent(id)}?kind=source_resume`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.data?.text) {
        throw new Error(payload.error || 'Could not load that saved resume.');
      }
      const nextSource: SessionSourceResume = {
        schemaVersion: 1,
        filename: String(payload.data.filename || 'saved-resume.txt'),
        mimeType: payload.data.mimeType === 'application/pdf' ? 'application/pdf' : 'text/plain',
        origin: payload.data.origin === 'builder' ? 'builder' : 'upload',
        text: String(payload.data.text),
        updatedAt: String(payload.updatedAt || new Date().toISOString()),
      };
      setSource(nextSource);
      setUploadedFile(null);
      setSelectedSourceResumeId(id);
      setShowPaste(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that saved resume.');
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    const existingSource = readSessionSourceResume();
    if (existingSource) setSource(existingSource);
    const saved = readStudioSession(scopeKey);
    if (saved) {
      setJobDescription(saved.jobDescription || defaultJobDescription);
      setAnalysis(saved.analysis);
      setAnalysisMode(saved.analysisMode);
      setAnswers(saved.answers || {});
      setGeneratedResume(saved.generatedResume);
      setGenerateMode(saved.generateMode);
      setStep(resolveInitialStep(saved));
      if (saved.selectedSourceResumeId) setSelectedSourceResumeId(saved.selectedSourceResumeId);
      if (saved.answers?.targetTitle) setRoleTitle((prev) => prev || saved.answers.targetTitle);
    } else {
      setJobDescription(defaultJobDescription);
      setStep('input');
    }
    setHydrated(true);

    if (existingSource?.pendingPdfBase64 && !existingSource.text && !extractingPending.current) {
      extractingPending.current = true;
      const file = base64ToFile(existingSource.pendingPdfBase64, existingSource.filename, 'application/pdf');
      void extractUploadedFile(file);
    }
  }, [scopeKey, defaultJobDescription, extractUploadedFile]);

  useEffect(() => {
    if (hydrated && signedIn && !source && !selectedSourceResumeId && savedSources.length > 0) {
      void loadSavedSource(savedSources[0].id);
    }
  }, [hydrated, signedIn, source, selectedSourceResumeId, savedSources, loadSavedSource]);

  useEffect(() => {
    if (!hydrated) return;
    writeStudioSession(scopeKey, {
      step,
      jobDescription,
      analysis,
      analysisMode,
      answers,
      generatedResume,
      generateMode,
      selectedSourceResumeId,
    });
  }, [hydrated, scopeKey, step, jobDescription, analysis, analysisMode, answers, generatedResume, generateMode, selectedSourceResumeId]);

  function usePastedResume() {
    const text = pastedText.replace(/\0/g, '').trim();
    if (text.length < 25) {
      setError('Paste at least 25 characters of resume text.');
      return;
    }
    const nextSource: SessionSourceResume = {
      schemaVersion: 1,
      filename: 'pasted-resume.txt',
      mimeType: 'text/plain',
      origin: 'upload',
      text,
      updatedAt: new Date().toISOString(),
    };
    writeSessionSourceResume(nextSource);
    setSource(nextSource);
    setUploadedFile(null);
    setSelectedSourceResumeId(null);
    setShowPaste(false);
    setError('');
    toast.success('Resume text loaded');
  }

  function keepCurrentResume() {
    if (!source?.text || source.text.trim().length < 25) {
      setError('Upload a PDF or TXT resume, paste your resume text, or select a saved resume first.');
      return;
    }
    setError('');
    setGeneratedResume(null);
    setGenerateMode(undefined);
    setStep('kept');
    toast.success('Keeping your current resume as-is');
  }

  async function runAnalyze() {
    if (!source?.text || source.text.trim().length < 25) {
      setError('Upload a PDF or TXT resume, paste your resume text, or select a saved resume first.');
      return;
    }
    if (jobDescription.trim().length < 25) {
      setError('Paste a target job description (at least 25 characters) to analyze fit.');
      return;
    }
    setBusy('analyze');
    setError('');
    try {
      const res = await fetch('/api/resumes/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          resumeText: source.text,
          jobDescription: jobDescription.trim(),
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.analysis) throw new Error(payload.error || 'Resume analysis failed.');
      const nextAnalysis = payload.analysis as Analysis;
      setAnalysis(nextAnalysis);
      setAnalysisMode(payload.mode === 'ai' ? 'ai' : 'deterministic');
      const prefilled = createInitialResumeGenerationAnswers(nextAnalysis, jobDescription.trim());
      if (!prefilled.targetTitle && (roleTitle || defaultRoleTitle)) {
        prefilled.targetTitle = roleTitle || defaultRoleTitle;
      }
      setAnswers(prefilled);
      if (!roleTitle && prefilled.targetTitle) setRoleTitle(prefilled.targetTitle);
      setGeneratedResume(null);
      setGenerateMode(undefined);
      setStep('report');
      toast.success(`Analyzed fit: ${nextAnalysis.score}% match`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function runGenerate(submittedAnswers?: ResumeGenerationAnswers) {
    if (!analysis) return;
    const activeAnswers = submittedAnswers ?? answers;
    setBusy('generate');
    setError('');
    try {
      const trimmedJd = jobDescription.trim();
      const res = await fetch('/api/resumes/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          resumeText: source?.text,
          analysis,
          jobDescription: trimmedJd,
          answers: activeAnswers,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.generatedResume) throw new Error(payload.error || 'Tailored resume generation failed.');
      const created = payload.generatedResume as GeneratedResume;
      setAnswers(activeAnswers);
      setGeneratedResume(created);
      setGenerateMode(payload.mode === 'ai' ? 'ai' : 'deterministic');
      if (!roleTitle && activeAnswers.targetTitle?.trim()) setRoleTitle(activeAnswers.targetTitle.trim());
      setStep('preview');
      toast.success('Tailored resume ready to preview & export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function saveKeptToLibrary() {
    if (!signedIn || !source?.text || selectedSourceResumeId || busy) return;
    setBusy('library');
    setError('');
    try {
      let targetFile = uploadedFile;
      if (!targetFile) {
        if (source.pendingPdfBase64) {
          targetFile = base64ToFile(source.pendingPdfBase64, source.filename, 'application/pdf');
        } else {
          targetFile = new File([source.text], source.filename.replace(/\.pdf$/i, '.txt') || 'resume.txt', {
            type: 'text/plain',
          });
        }
      }
      const form = new FormData();
      form.append('resume', targetFile);
      form.append('idempotencyKey', crypto.randomUUID());
      const res = await fetch('/api/resumes', { method: 'POST', body: form });
      const payload = await res.json();
      if (!res.ok || !payload.id) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save your resume to the library.');
      }
      setSelectedSourceResumeId(String(payload.id));
      toast.success('Original resume saved to your library');
      onLibrarySaved?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your resume to the library.');
    } finally {
      setBusy('');
    }
  }

  async function saveToTracker(event: FormEvent) {
    event.preventDefault();
    if (!source?.text) return;
    const trimmedJd = jobDescription.trim();
    if (!analysis && trimmedJd.length < 25) return;
    if (!company.trim() || !roleTitle.trim()) {
      setError('Enter both company and role title before saving to your tracker.');
      return;
    }

    setBusy('save');
    setError('');
    try {
      let resolvedAnalysis = analysis;
      if (!resolvedAnalysis) {
        const res = await fetch('/api/resumes/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'analyze',
            resumeText: source.text,
            jobDescription: trimmedJd,
          }),
        });
        const payload = await res.json();
        if (!res.ok || !payload.analysis) throw new Error(payload.error || 'Could not score role fit before saving.');
        resolvedAnalysis = payload.analysis as Analysis;
        setAnalysis(resolvedAnalysis);
        setAnalysisMode(payload.mode === 'ai' ? 'ai' : 'deterministic');
      }

      const useCurrent = step === 'kept';
      const bundle = {
        company: company.trim(),
        role: roleTitle.trim(),
        jobUrl: jobUrl.trim() || undefined,
        jobDescription: trimmedJd,
        sourceResumeId: selectedSourceResumeId,
        sourceFilename: source.filename,
        sourceMimeType: source.mimeType,
        sourceText: source.text,
        analysis: resolvedAnalysis,
        answers,
        generatedResume: useCurrent ? null : generatedResume,
        useCurrentResume: useCurrent,
        label: `${company.trim()}: ${roleTitle.trim()}`,
      };

      if (!signedIn) {
        window.localStorage.setItem(PENDING_BUNDLE_KEY, JSON.stringify(bundle));
        router.push('/signin?mode=signup&adopt=1&returnTo=%2Fanalyze');
        return;
      }

      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_session_bundle', input: bundle }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.application?.id) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save to your tracker.');
      }
      try {
        window.localStorage.removeItem(studioStorageKey(scopeKey));
        window.localStorage.removeItem(PENDING_BUNDLE_KEY);
      } catch {
        /* ignore storage error */
      }
      toast.success('Saved application and resume selection to your tracker');
      onLibrarySaved?.();
      router.push(`/applications/${payload.application.id}#resume-workspace`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save to your tracker.');
    } finally {
      setBusy('');
    }
  }

  function resetToNewAnalysis() {
    setAnalysis(null);
    setAnalysisMode(undefined);
    setAnswers({});
    setGeneratedResume(null);
    setGenerateMode(undefined);
    setError('');
    setStep('input');
  }

  const finalStepTarget: StudioStep = step === 'kept' ? 'kept' : generatedResume ? 'preview' : 'kept';
  const canOpenFinalStep = Boolean(generatedResume || step === 'kept');
  const canShowTrackerSave =
    mode !== 'application' &&
    Boolean(source?.text) &&
    (step === 'preview' || step === 'kept') &&
    (Boolean(analysis) || jobDescription.trim().length >= 25);

  return (
    <div id="session-resume-studio" className="vc-resume-workspace min-w-0 space-y-6">
      <nav aria-label="Resume workflow steps" className="clay-panel px-4 py-3 sm:px-5">
        <ol className="flex flex-wrap gap-2">
          <li>
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep('input');
              }}
              aria-current={step === 'input' ? 'step' : undefined}
              className={`min-h-[44px] rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                step === 'input'
                  ? 'border-[#26594c] bg-[#26594c] text-white'
                  : 'border-[#7d8c7d] bg-[#fbfaf6] text-[#1d322c] hover:bg-[#e6eddf]'
              }`}
            >
              1. Upload &amp; JD
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!analysis}
              onClick={() => {
                setError('');
                setStep('report');
              }}
              aria-current={step === 'report' ? 'step' : undefined}
              className={`min-h-[44px] rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                step === 'report'
                  ? 'border-[#26594c] bg-[#26594c] text-white'
                  : analysis
                    ? 'border-[#7d8c7d] bg-[#fbfaf6] text-[#1d322c] hover:bg-[#e6eddf]'
                    : 'border-[#d4dccb] bg-[#fbfaf6] text-[#4e5f56] opacity-60'
              }`}
            >
              2. Fit Report
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!analysis}
              onClick={() => {
                setError('');
                setStep('builder');
              }}
              aria-current={step === 'builder' ? 'step' : undefined}
              className={`min-h-[44px] rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                step === 'builder'
                  ? 'border-[#26594c] bg-[#26594c] text-white'
                  : analysis
                    ? 'border-[#7d8c7d] bg-[#fbfaf6] text-[#1d322c] hover:bg-[#e6eddf]'
                    : 'border-[#d4dccb] bg-[#fbfaf6] text-[#4e5f56] opacity-60'
              }`}
            >
              3. Resume Builder
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!canOpenFinalStep}
              onClick={() => {
                setError('');
                setStep(finalStepTarget);
              }}
              aria-current={step === 'preview' || step === 'kept' ? 'step' : undefined}
              className={`min-h-[44px] rounded-lg border px-3.5 py-2 text-xs font-bold transition ${
                step === 'preview' || step === 'kept'
                  ? 'border-[#26594c] bg-[#26594c] text-white'
                  : canOpenFinalStep
                    ? 'border-[#7d8c7d] bg-[#fbfaf6] text-[#1d322c] hover:bg-[#e6eddf]'
                    : 'border-[#d4dccb] bg-[#fbfaf6] text-[#4e5f56] opacity-60'
              }`}
            >
              4. Preview / Keep Current
            </button>
          </li>
        </ol>
      </nav>

      {step === 'input' && (
        <section className="clay-panel p-5 sm:p-6" aria-labelledby="session-studio-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Resume Fit Studio</p>
              <h2 id="session-studio-title" className="mt-2 text-2xl font-bold text-slate-900">
                Compare your resume against a job description, or keep your current resume.
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                {aiConfigured
                  ? 'Powered by DeepSeek for evidence-backed scoring and tailored LaTeX resume generation, with deterministic fallback when offline.'
                  : 'Score role fit against any job description, review your fit report, answer targeted follow-up questions, and export a tailored LaTeX resume.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="clay-secondary-button flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
                disabled={Boolean(busy)}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} aria-hidden="true" />
                {busy === 'extract' ? 'Reading file…' : source ? 'Replace resume (PDF/TXT)' : 'Upload PDF or TXT'}
              </button>
              <button
                type="button"
                className="clay-secondary-button flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
                disabled={Boolean(busy)}
                onClick={() => {
                  setShowPaste((prev) => !prev);
                  if (!pastedText && source?.text) setPastedText(source.text);
                }}
              >
                <ClipboardPaste size={15} aria-hidden="true" />
                Paste text
              </button>
              <input
                ref={fileRef}
                aria-label="Session resume file"
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="sr-only"
                disabled={Boolean(busy)}
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) void extractUploadedFile(chosen);
                }}
              />
            </div>
          </div>

          {savedSources.length > 0 && (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-800">
                Or choose from your saved PostgreSQL library
                <select
                  aria-label="Saved library resume"
                  className="clay-input mt-1.5 w-full p-2.5 font-normal sm:max-w-md"
                  value={selectedSourceResumeId || ''}
                  disabled={Boolean(busy)}
                  onChange={(event) => void loadSavedSource(event.target.value)}
                >
                  <option value="">Select a saved resume…</option>
                  {savedSources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.filename}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {showPaste && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-4">
              <label className="block text-sm font-semibold text-slate-800">
                Paste resume text
                <textarea
                  rows={6}
                  className="clay-input mt-2 w-full p-3 text-sm font-normal"
                  placeholder="Paste your plain-text resume here (at least 25 characters)…"
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="clay-button px-4 py-2 text-sm font-semibold text-white" onClick={usePastedResume}>
                  Use pasted resume
                </button>
                <button type="button" className="clay-secondary-button px-4 py-2 text-sm font-semibold" onClick={() => setShowPaste(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {source ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/70 bg-white/80 px-4 py-3 text-sm">
              <div className="flex items-center gap-2.5">
                <FileText size={17} className="text-teal-800" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-900">{source.filename}</p>
                  <p className="text-xs text-slate-500">
                    {selectedSourceResumeId ? 'From your saved library · ' : source.origin === 'builder' ? 'Built from onboarding answers · ' : 'Loaded for analysis · '}
                    {source.text.length ? `${source.text.length.toLocaleString()} characters ready` : 'Extracting text…'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-sm text-slate-600">
              Upload a PDF or TXT resume, pick a saved library resume, or paste your resume text above to begin.
            </p>
          )}

          <label className="mt-5 block text-sm font-semibold text-slate-800">
            Target job description
            <textarea
              rows={7}
              className="clay-input mt-2 w-full p-3 text-sm font-normal"
              placeholder="Paste the job posting responsibilities and requirements (at least 25 characters)…"
              value={jobDescription}
              disabled={Boolean(busy)}
              onChange={(event) => {
                setJobDescription(event.target.value);
                setError('');
              }}
            />
          </label>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="clay-secondary-button px-4 py-3 text-sm font-semibold"
              disabled={Boolean(busy) || !source?.text}
              onClick={keepCurrentResume}
            >
              Keep current resume
            </button>
            <button
              type="button"
              className="clay-button flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white"
              disabled={Boolean(busy) || !source?.text || jobDescription.trim().length < 25}
              onClick={() => void runAnalyze()}
            >
              <FileCheck2 size={15} aria-hidden="true" />
              {busy === 'analyze' ? 'Analyzing Resume…' : 'Analyze Resume'}
            </button>
          </div>
        </section>
      )}

      {step === 'report' && analysis && (
        <div className="space-y-6">
          <div className="clay-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Step 2 of 4</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Detailed Fit Report</h2>
              <p className="mt-1 text-sm text-slate-600">
                Review the evidence scorecard, then open the Resume Builder or keep your current resume.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="clay-secondary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
                onClick={() => {
                  setError('');
                  setStep('input');
                }}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Edit inputs
              </button>
              <button
                type="button"
                className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                onClick={keepCurrentResume}
              >
                Keep current resume
              </button>
              <button
                type="button"
                className="clay-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white"
                onClick={() => {
                  setError('');
                  setStep('builder');
                }}
              >
                Open Resume Builder
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          <AnalysisResult
            embedded
            mode={analysisMode}
            matchScore={analysis.score}
            strengths={analysis.recommendations.strengths}
            weaknesses={analysis.recommendations.improvements}
            missingSkills={analysis.missingSkills}
            recommendations={[...analysis.recommendations.skillGaps, ...analysis.recommendations.format]}
            detailedAnalysis={analysis.detailedAnalysis}
            evaluation={analysis.evaluation}
            roleRequirements={analysis.roleRequirements}
            priorityActions={analysis.priorityActions}
          />

          <section className="clay-panel p-6" aria-labelledby="studio-report-cta-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="clay-kicker text-xs font-bold uppercase">Next Step</p>
                <h3 id="studio-report-cta-heading" className="mt-2 text-2xl font-black text-slate-950">
                  Build a Role-Tailored Resume
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  Use the extracted resume profile, this report, and targeted follow-up questions to generate a preview with LaTeX export, or keep your current resume as-is.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="clay-secondary-button px-4 py-3 text-sm font-bold text-slate-800"
                  onClick={keepCurrentResume}
                >
                  Keep current resume
                </button>
                <button
                  type="button"
                  className="clay-button inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-white"
                  onClick={() => {
                    setError('');
                    setStep('builder');
                  }}
                >
                  Open Resume Builder
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {step === 'builder' && analysis && (
        <div className="space-y-6">
          <div className="clay-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Step 3 of 4</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Resume Builder</h2>
              <p className="mt-1 text-sm text-slate-600">
                Review the extracted profile and answer targeted role questions before generating the preview.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="clay-secondary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
                disabled={Boolean(busy)}
                onClick={() => {
                  setError('');
                  setStep('report');
                }}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back to Fit Report
              </button>
              <button
                type="button"
                className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                disabled={Boolean(busy)}
                onClick={keepCurrentResume}
              >
                Keep current resume instead
              </button>
            </div>
          </div>

          <ResumeGenerator
            analysis={analysis}
            jobDescription={jobDescription}
            answers={answers}
            onAnswersChange={(nextAnswers) => {
              setAnswers(nextAnswers);
              setError('');
            }}
            onGenerate={runGenerate}
            isGenerating={busy === 'generate'}
            error={error}
            generateLabel="Generate Resume Preview"
            generatingLabel="Generating..."
            secondaryAction={
              <button
                type="button"
                className="clay-secondary-button px-4 py-3 text-sm font-bold text-slate-800"
                disabled={Boolean(busy)}
                onClick={keepCurrentResume}
              >
                Keep current resume instead
              </button>
            }
            nextStepText="After generation, the resume opens in preview with Print / Save PDF, Copy LaTeX, and .tex export, plus an option to save to your job tracker."
          />
        </div>
      )}

      {step === 'preview' && generatedResume && (
        <section className="clay-panel space-y-6 p-5 sm:p-6" aria-labelledby="session-generated-heading">
          <div className="resume-preview-chrome flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Step 4 of 4</p>
              <h2 id="session-generated-heading" className="mt-1 text-2xl font-bold text-slate-900">
                Resume Preview
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Review the formatted resume before printing or exporting LaTeX.
                {generateMode && (
                  <span className="ml-2 text-xs font-semibold text-teal-800">
                    ({generateMode === 'ai' ? 'Generated with DeepSeek AI' : 'Deterministic LaTeX assembly'})
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="clay-secondary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
                onClick={() => {
                  setError('');
                  setStep('builder');
                }}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back to Builder
              </button>
              <button
                type="button"
                className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                onClick={() => {
                  setError('');
                  setStep('report');
                }}
              >
                Back to Fit Report
              </button>
              <button
                type="button"
                className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                onClick={keepCurrentResume}
              >
                Keep current resume instead
              </button>
              <button
                type="button"
                className="clay-secondary-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
                onClick={resetToNewAnalysis}
              >
                <RotateCcw size={14} aria-hidden="true" />
                New Analysis
              </button>
            </div>
          </div>

          <div className="vc-selected-resume vc-studio-resume-preview">
            <ResumePreview generatedResume={generatedResume} />
          </div>
        </section>
      )}

      {step === 'kept' && source && (
        <section className="clay-panel space-y-5 p-5 sm:p-6" aria-labelledby="session-kept-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">Current Resume Kept</p>
              <h2 id="session-kept-heading" className="mt-1 text-2xl font-bold text-slate-900">
                Using your original resume as-is
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Your uploaded or selected resume is kept untouched without rewriting or reformatting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis ? (
                <>
                  <button
                    type="button"
                    className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                    onClick={() => {
                      setError('');
                      setStep('report');
                    }}
                  >
                    Back to Fit Report
                  </button>
                  <button
                    type="button"
                    className="clay-button px-4 py-2.5 text-sm font-semibold text-white"
                    onClick={() => {
                      setError('');
                      setStep('builder');
                    }}
                  >
                    Open Resume Builder
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="clay-button px-4 py-2.5 text-sm font-semibold text-white"
                  onClick={() => {
                    setError('');
                    setStep('input');
                  }}
                >
                  Tailor to a job description
                </button>
              )}
              <button
                type="button"
                className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                onClick={() => {
                  setError('');
                  setStep('input');
                }}
              >
                Replace resume
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-teal-200/80 bg-white/90 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-[#e6eddf] text-teal-900">
                  <FileText size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{source.filename}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {source.mimeType === 'application/pdf' ? 'PDF original' : 'Plain text original'} ·{' '}
                    {source.text.length.toLocaleString()} characters ready
                    {analysis ? ` · ${analysis.score}% fit score recorded` : ''}
                  </p>
                </div>
              </div>
              {signedIn && !selectedSourceResumeId && (
                <button
                  type="button"
                  className="clay-secondary-button px-4 py-2.5 text-sm font-semibold"
                  disabled={Boolean(busy)}
                  onClick={() => void saveKeptToLibrary()}
                >
                  {busy === 'library' ? 'Saving…' : 'Save original to Resume Library'}
                </button>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>
      )}

      {canShowTrackerSave && (
        <section className="clay-panel resume-preview-chrome p-5 sm:p-6" aria-labelledby="save-tracker-heading">
          <h3 id="save-tracker-heading" className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BookmarkPlus size={19} className="text-teal-800" aria-hidden="true" />
            Save to Job Tracker
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {signedIn
              ? step === 'kept'
                ? 'Creates a tracked application with this job description, fit analysis, and your current resume marked as the one you are using.'
                : 'Creates a tracked application with this job description, fit analysis, answers, and tailored resume saved in PostgreSQL.'
              : 'You’ll create an account or sign in next. Your analyzed JD, fit report, and resume selection will save straight to your tracker.'}
          </p>
          <form className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={(event) => void saveToTracker(event)}>
            <label className="block min-w-0 text-sm font-semibold text-slate-800">
              Company
              <input
                type="text"
                required
                maxLength={160}
                placeholder="e.g. Stripe"
                className="clay-input mt-1.5 w-full p-3 font-normal"
                value={company}
                disabled={Boolean(busy)}
                onChange={(event) => setCompany(event.target.value)}
              />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-slate-800">
              Role title
              <input
                type="text"
                required
                maxLength={160}
                placeholder="e.g. Full-Stack Engineer"
                className="clay-input mt-1.5 w-full p-3 font-normal"
                value={roleTitle}
                disabled={Boolean(busy)}
                onChange={(event) => setRoleTitle(event.target.value)}
              />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-slate-800">
              Job URL <span className="text-xs font-normal text-slate-500">Optional</span>
              <input
                type="url"
                maxLength={500}
                placeholder="https://..."
                className="clay-input mt-1.5 w-full p-3 font-normal"
                value={jobUrl}
                disabled={Boolean(busy)}
                onChange={(event) => setJobUrl(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 md:col-span-3">
              <button
                type="submit"
                className="clay-button flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white"
                disabled={Boolean(busy)}
              >
                <BookmarkPlus size={16} aria-hidden="true" />
                {busy === 'save' ? 'Saving to tracker…' : signedIn ? 'Save to Job Tracker' : 'Save to Job Tracker (create free account)'}
              </button>
              {!signedIn && (
                <Link className="text-sm font-semibold text-teal-800 underline underline-offset-4" href="/signin">
                  Already have an account?
                </Link>
              )}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
