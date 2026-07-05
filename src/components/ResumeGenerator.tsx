'use client';

import { useMemo, useState } from 'react';
import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import {
  createInitialResumeGenerationAnswers,
  getResumeGenerationQuestions,
  hasRequiredResumeGenerationAnswers,
} from '@/app/lib/resumeGeneratorQuestions';

interface ResumeGeneratorProps {
  analysis: Analysis;
  jobDescription?: string;
}

function sanitizeFilename(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'tailored-resume';
}

export default function ResumeGenerator({ analysis, jobDescription = '' }: ResumeGeneratorProps) {
  const [answers, setAnswers] = useState<ResumeGenerationAnswers>(() =>
    createInitialResumeGenerationAnswers(analysis, jobDescription)
  );
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const targetedQuestions = useMemo(
    () => getResumeGenerationQuestions(analysis, jobDescription)
      .filter((question) => !['fullName', 'contactDetails', 'targetTitle'].includes(question.id)),
    [analysis, jobDescription]
  );

  const requiredAnswered = useMemo(() => {
    return hasRequiredResumeGenerationAnswers(analysis, answers, jobDescription);
  }, [analysis, answers, jobDescription]);

  const visibleRoleRequirements = analysis.roleRequirements?.slice(0, 4) ?? [];
  const visiblePriorityActions = analysis.priorityActions?.slice(0, 3) ?? [];
  const profile = analysis.resumeBuilderProfile;

  const updateAnswer = (id: string, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setError('');
    setCopied(false);
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requiredAnswered || isGenerating) return;

    setIsGenerating(true);
    setError('');
    setCopied(false);

    try {
      const response = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          analysis,
          jobDescription,
          answers,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorValue = data?.error;
        throw new Error(typeof errorValue === 'string' ? errorValue : 'Failed to generate resume');
      }

      if (!data || typeof data.latex !== 'string') {
        throw new Error('Invalid resume generation response');
      }

      setGeneratedResume(data);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate resume');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedResume?.latex) return;

    await navigator.clipboard.writeText(generatedResume.latex);
    setCopied(true);
  };

  const handleDownload = () => {
    if (!generatedResume?.latex || typeof document === 'undefined') return;

    const blob = new Blob([generatedResume.latex], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilename(answers.fullName)}-resume.tex`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="clay-panel p-5 sm:p-6" aria-labelledby="resume-generator-heading">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="clay-kicker text-xs font-bold uppercase">Resume Builder</p>
          <h2 id="resume-generator-heading" className="mt-2 text-2xl font-black text-slate-950">
            Generate Tailored LaTeX Resume
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Starts from the extracted resume profile and asks only for role-relevant missing evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-teal-800">
            Score {analysis.score}%
          </span>
          <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-700">
            {jobDescription.trim() ? 'Role context loaded' : 'Role context limited'}
          </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="clay-panel-muted p-4">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Extracted Profile</h3>
                <p className="text-xs leading-5 text-slate-500">
                  Pulled from the uploaded resume; edit anything that needs correction.
                </p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                {profile ? 'Prefilled' : 'Needs details'}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                  <span>Full name</span>
                  <span className="text-xs uppercase text-teal-800">Required</span>
                </span>
                <input
                  className="clay-input mt-2 w-full p-3 text-sm text-slate-800 placeholder:text-slate-400"
                  value={answers.fullName ?? ''}
                  placeholder="Jane Doe"
                  onChange={(event) => updateAnswer('fullName', event.target.value)}
                  disabled={isGenerating}
                />
              </label>

              <label className="block">
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                  <span>Target title</span>
                  <span className="text-xs uppercase text-teal-800">Required</span>
                </span>
                <input
                  className="clay-input mt-2 w-full p-3 text-sm text-slate-800 placeholder:text-slate-400"
                  value={answers.targetTitle ?? ''}
                  placeholder="Frontend Engineer"
                  onChange={(event) => updateAnswer('targetTitle', event.target.value)}
                  disabled={isGenerating}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                  <span>Contact details</span>
                  <span className="text-xs uppercase text-teal-800">Required</span>
                </span>
                <textarea
                  className="clay-input mt-2 min-h-[76px] w-full resize-y p-3 text-sm leading-6 text-slate-800 placeholder:text-slate-400"
                  value={answers.contactDetails ?? ''}
                  placeholder="jane@example.com | 555-123-4567 | linkedin.com/in/jane | github.com/jane"
                  onChange={(event) => updateAnswer('contactDetails', event.target.value)}
                  disabled={isGenerating}
                />
              </label>
            </div>
          </div>

          <div className="clay-panel-muted p-4">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Targeted Follow-up Questions</h3>
                <p className="text-xs leading-5 text-slate-500">
                  Based on missing skills, partial requirements, and the scorecard evidence.
                </p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                {targetedQuestions.length ? `${targetedQuestions.length} relevant` : 'None needed'}
              </span>
            </div>

            {targetedQuestions.length > 0 ? (
              <div className="grid gap-4">
                {targetedQuestions.map((question) => (
              <label
                key={question.id}
                className="block"
              >
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                  <span>{question.label}</span>
                  {question.required && <span className="text-xs uppercase text-teal-800">Required</span>}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{question.prompt}</span>
                {question.multiline ? (
                  <textarea
                    className="clay-input mt-2 min-h-[92px] w-full resize-y p-3 text-sm leading-6 text-slate-800 placeholder:text-slate-400"
                    value={answers[question.id] ?? ''}
                    placeholder={question.placeholder}
                    onChange={(event) => updateAnswer(question.id, event.target.value)}
                    disabled={isGenerating}
                  />
                ) : (
                  <input
                    className="clay-input mt-2 w-full p-3 text-sm text-slate-800 placeholder:text-slate-400"
                    value={answers[question.id] ?? ''}
                    placeholder={question.placeholder}
                    onChange={(event) => updateAnswer(question.id, event.target.value)}
                    disabled={isGenerating}
                  />
                )}
              </label>
                ))}
              </div>
            ) : (
              <div className="clay-inset p-4 text-sm leading-6 text-slate-600">
                The uploaded resume already contains the core information needed for this role. You can generate now or edit the extracted profile first.
              </div>
            )}
          </div>

          {error && (
            <div className="clay-panel-muted border-rose-200 bg-rose-50/70 p-3 text-sm font-medium text-rose-700" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!requiredAnswered || isGenerating}
            className="clay-button inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold text-white"
          >
            {isGenerating ? 'Generating...' : 'Generate LaTeX Resume'}
          </button>
        </form>

        <aside className="space-y-4">
          {visiblePriorityActions.length > 0 && (
            <div className="clay-panel-muted p-4">
              <h3 className="text-sm font-semibold text-slate-900">Priority Inputs</h3>
              <div className="mt-3 space-y-3">
                {visiblePriorityActions.map((action, index) => (
                  <div key={`${action.title}-${index}`} className="border-t border-white/70 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{action.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleRoleRequirements.length > 0 && (
            <div className="clay-panel-muted p-4">
              <h3 className="text-sm font-semibold text-slate-900">Role Signals</h3>
              <div className="mt-3 space-y-3">
                {visibleRoleRequirements.map((requirement, index) => (
                  <div key={`${requirement.text}-${index}`} className="border-t border-white/70 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{requirement.text}</p>
                      <span className="rounded-full border border-white/80 bg-white/60 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                        {requirement.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{requirement.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {generatedResume && (
            <div className="clay-panel-muted p-4" aria-live="polite">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Generated Output</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="clay-secondary-button px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    {copied ? 'Copied' : 'Copy LaTeX'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="clay-secondary-button px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    Download .tex
                  </button>
                </div>
              </div>

              {generatedResume.tailoringNotes.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                  {generatedResume.tailoringNotes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              )}

              <textarea
                className="clay-inset mt-3 h-72 w-full resize-y p-3 font-mono text-xs leading-5 text-slate-800"
                value={generatedResume.latex}
                readOnly
                aria-label="Generated LaTeX resume"
              />

              {generatedResume.followUpQuestions.length > 0 && (
                <div className="mt-3 border-t border-white/70 pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Follow-up questions
                  </h4>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                    {generatedResume.followUpQuestions.map((question, index) => (
                      <li key={`${question}-${index}`}>{question}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
