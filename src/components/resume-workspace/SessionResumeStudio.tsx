'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Analysis, GeneratedResume, ResumeGenerationAnswers, ResumeGenerationQuestion } from '@/app/types';
import {
  createInitialResumeGenerationAnswers,
  getResumeGenerationQuestions,
  hasRequiredResumeGenerationAnswers,
} from '@/app/lib/resumeGeneratorQuestions';
import {
  readSessionSourceResume,
  writeSessionSourceResume,
  type SessionSourceResume,
} from '@/lib/onboarding/session';
import AnalysisResult from '@/components/AnalysisResult';
import ResumePreview from '@/components/ResumePreview';

interface StudioSessionData {
  jobDescription: string;
  analysis: Analysis | null;
  analysisMode?: 'ai' | 'deterministic';
  answers: ResumeGenerationAnswers;
  generatedResume: GeneratedResume | null;
  generateMode?: 'ai' | 'deterministic';
}

function studioStorageKey(scopeKey: string) {
  return `vibecheck:session-studio:v1:${scopeKey}`;
}

function readStudioSession(scopeKey: string): StudioSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(studioStorageKey(scopeKey));
    if (!raw || raw.length > 1_000_000) return null;
    const parsed = JSON.parse(raw) as StudioSessionData;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStudioSession(scopeKey: string, data: StudioSessionData) {
  try {
    sessionStorage.setItem(studioStorageKey(scopeKey), JSON.stringify(data));
  } catch {
    /* Optional browser convenience storage. */
  }
}

function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}

export default function SessionResumeStudio({
  applicationId,
  defaultRoleTitle = '',
  defaultJobDescription = '',
  mode = 'library',
}: {
  applicationId?: string;
  defaultRoleTitle?: string;
  defaultJobDescription?: string;
  mode?: 'library' | 'application';
}) {
  const scopeKey = applicationId || 'library';
  const [source, setSource] = useState<SessionSourceResume | null>(null);
  const [jobDescription, setJobDescription] = useState(defaultJobDescription);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'ai' | 'deterministic' | undefined>(undefined);
  const [answers, setAnswers] = useState<ResumeGenerationAnswers>({});
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [generateMode, setGenerateMode] = useState<'ai' | 'deterministic' | undefined>(undefined);
  const [busy, setBusy] = useState<'extract' | 'analyze' | 'generate' | ''>('');
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
        nextSource = {
          schemaVersion: 1,
          filename: String(payload.filename || file.name),
          mimeType: 'application/pdf',
          origin: 'upload',
          text: String(payload.text || ''),
          updatedAt: new Date().toISOString(),
        };
      }
      writeSessionSourceResume(nextSource);
      setSource(nextSource);
      toast.success(`Loaded ${nextSource.filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your resume could not be loaded.');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    const existingSource = readSessionSourceResume();
    setSource(existingSource);
    const saved = readStudioSession(scopeKey);
    if (saved) {
      setJobDescription(saved.jobDescription || defaultJobDescription);
      setAnalysis(saved.analysis);
      setAnalysisMode(saved.analysisMode);
      setAnswers(saved.answers || {});
      setGeneratedResume(saved.generatedResume);
      setGenerateMode(saved.generateMode);
    } else {
      setJobDescription(defaultJobDescription);
    }
    setHydrated(true);

    if (existingSource?.pendingPdfBase64 && !existingSource.text && !extractingPending.current) {
      extractingPending.current = true;
      const file = base64ToFile(existingSource.pendingPdfBase64, existingSource.filename, 'application/pdf');
      void extractUploadedFile(file);
    }
  }, [scopeKey, defaultJobDescription, extractUploadedFile]);

  useEffect(() => {
    if (!hydrated) return;
    writeStudioSession(scopeKey, {
      jobDescription,
      analysis,
      analysisMode,
      answers,
      generatedResume,
      generateMode,
    });
  }, [hydrated, scopeKey, jobDescription, analysis, analysisMode, answers, generatedResume, generateMode]);

  const questions: ResumeGenerationQuestion[] = useMemo(() => {
    if (!analysis) return [];
    return [
      { id: 'fullName', label: 'Full name', prompt: '', placeholder: 'Your full name', required: true },
      { id: 'contactDetails', label: 'Contact details', prompt: '', placeholder: 'Email, phone, city, and relevant links', required: true, multiline: true },
      { id: 'targetTitle', label: 'Target title', prompt: '', placeholder: defaultRoleTitle || 'The role you are applying for', required: true },
      ...getResumeGenerationQuestions(analysis, jobDescription).filter(
        (question) => !['fullName', 'contactDetails', 'targetTitle'].includes(question.id),
      ),
    ];
  }, [analysis, jobDescription, defaultRoleTitle]);

  async function runAnalyze() {
    if (!source?.text || source.text.trim().length < 25) {
      setError('Upload a PDF or TXT resume first (or build a starter resume during onboarding).');
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
      if (!prefilled.targetTitle && defaultRoleTitle) prefilled.targetTitle = defaultRoleTitle;
      setAnswers(prefilled);
      setGeneratedResume(null);
      toast.success(`Analyzed fit: ${nextAnalysis.score}% match`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function runGenerate() {
    if (!analysis) return;
    setBusy('generate');
    setError('');
    try {
      const res = await fetch('/api/resumes/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          analysis,
          jobDescription: jobDescription.trim(),
          answers,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.generatedResume) throw new Error(payload.error || 'Tailored resume generation failed.');
      setGeneratedResume(payload.generatedResume as GeneratedResume);
      setGenerateMode(payload.mode === 'ai' ? 'ai' : 'deterministic');
      toast.success('Tailored resume ready to preview & export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally {
      setBusy('');
    }
  }

  const canGenerate =
    Boolean(analysis) &&
    hasRequiredResumeGenerationAnswers(analysis!, answers, jobDescription.trim());

  return (
    <div id="session-resume-studio" className="vc-resume-workspace space-y-6">
      <section className="clay-panel p-5 sm:p-6" aria-labelledby="session-studio-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="clay-kicker text-xs font-bold uppercase">
              {mode === 'application' ? 'Session resume studio' : 'Interactive resume studio'}
            </p>
            <h2 id="session-studio-title" className="mt-2 text-2xl font-bold text-slate-900">
              {mode === 'application' ? 'Analyze fit & tailor for this role.' : 'Bring your resume, analyze fit, and export LaTeX.'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Run real DeepSeek scoring, role-requirement evidence, and tailored LaTeX generation right in your browser session.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="clay-secondary-button flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
              disabled={Boolean(busy)}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} />
              {busy === 'extract' ? 'Reading file…' : source ? 'Replace resume (PDF/TXT)' : 'Upload PDF or TXT'}
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

        {source ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/70 bg-white/80 px-4 py-3 text-sm">
            <div className="flex items-center gap-2.5">
              <FileText size={17} className="text-teal-800" />
              <div>
                <p className="font-semibold text-slate-900">{source.filename}</p>
                <p className="text-xs text-slate-500">
                  {source.origin === 'builder' ? 'Built from onboarding answers · ' : 'Uploaded in session · '}
                  {source.text.length ? `${source.text.length.toLocaleString()} characters ready` : 'Extracting text…'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-sm text-slate-600">
            No resume loaded in this session yet — upload a text-based PDF or TXT above to begin.
          </p>
        )}

        <label className="mt-5 block text-sm font-semibold text-slate-800">
          Target job description
          <textarea
            rows={5}
            className="clay-input mt-2 w-full p-3 text-sm font-normal"
            placeholder="Paste the job posting responsibilities and requirements (at least 25 characters)…"
            value={jobDescription}
            disabled={Boolean(busy)}
            onChange={(event) => setJobDescription(event.target.value)}
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="clay-button flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white"
            disabled={Boolean(busy) || !source?.text || jobDescription.trim().length < 25}
            onClick={() => void runAnalyze()}
          >
            <Sparkles size={15} />
            {busy === 'analyze' ? 'Analyzing role fit…' : 'Analyze fit'}
          </button>
          {analysis && (
            <span className="rounded-xl bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900">
              {analysis.score}% match {analysisMode === 'ai' ? '· DeepSeek AI' : '· Instant scorecard'}
            </span>
          )}
        </div>
      </section>

      {mode === 'library' && !generatedResume && source?.generatedResume && (
        <section className="clay-panel p-5 sm:p-6" aria-labelledby="session-starter-heading">
          <h3 id="session-starter-heading" className="text-xl font-bold text-slate-900">
            Your starting resume ({source.filename})
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Built during your setup. Print to PDF, copy LaTeX, or analyze it against a job above to tailor a new version.
          </p>
          <div className="mt-5">
            <ResumePreview generatedResume={source.generatedResume} />
          </div>
        </section>
      )}

      {analysis && (
        <section className="clay-panel p-5 sm:p-6" aria-labelledby="session-analysis-heading">
          <h3 id="session-analysis-heading" className="text-xl font-bold text-slate-900">
            Fit report &amp; tailored follow-up
          </h3>
          <div className="mt-4">
            <AnalysisResult
              embedded
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
          </div>

          <form
            className="mt-8 border-t border-slate-200/80 pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void runGenerate();
            }}
          >
            <h4 className="text-lg font-bold text-slate-900">Make the details yours</h4>
            <p className="mt-1 text-sm text-slate-600">
              Review pre-filled contact fields and add truthful metrics or gap evidence before generating.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {questions.map((question) => (
                <label
                  key={question.id}
                  className={`block text-sm font-semibold ${question.multiline ? 'md:col-span-2' : ''}`}
                >
                  {question.label}
                  {question.required && (
                    <span className="ml-2 text-xs font-normal text-teal-800">Required</span>
                  )}
                  {question.prompt && (
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                      {question.prompt}
                    </span>
                  )}
                  {question.multiline ? (
                    <textarea
                      rows={3}
                      className="clay-input mt-2 w-full p-3 font-normal"
                      value={answers[question.id] || ''}
                      placeholder={question.placeholder}
                      required={question.required}
                      disabled={Boolean(busy)}
                      onChange={(event) =>
                        setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                      }
                    />
                  ) : (
                    <input
                      className="clay-input mt-2 w-full p-3 font-normal"
                      value={answers[question.id] || ''}
                      placeholder={question.placeholder}
                      required={question.required}
                      disabled={Boolean(busy)}
                      onChange={(event) =>
                        setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="clay-button px-5 py-3 text-sm font-semibold text-white"
                disabled={Boolean(busy) || !canGenerate}
              >
                {busy === 'generate' ? 'Generating tailored resume…' : 'Generate tailored resume'}
              </button>
              {generateMode && (
                <span className="text-xs text-slate-500">
                  Generated with {generateMode === 'ai' ? 'DeepSeek AI' : 'deterministic formatter'}
                </span>
              )}
            </div>
          </form>
        </section>
      )}

      {generatedResume && (
        <section className="clay-panel p-5 sm:p-6" aria-labelledby="session-generated-heading">
          <h3 id="session-generated-heading" className="mb-4 text-xl font-bold text-slate-900">
            Tailored resume &amp; LaTeX export
          </h3>
          <ResumePreview generatedResume={generatedResume} />
        </section>
      )}
    </div>
  );
}
