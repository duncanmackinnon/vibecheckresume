'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { ResumeGenerationAnswers, ResumeGenerationQuestion } from '@/app/types';
import { createInitialResumeGenerationAnswers, getResumeGenerationQuestions, hasRequiredResumeGenerationAnswers } from '@/app/lib/resumeGeneratorQuestions';
import type { StoredRecord, TrackerSnapshot } from '@/lib/tracker/types';
import type { ResumeDraft, ResumeJob, ResumeWorkspaceData } from '@/lib/resume-workspace/types';
import ResumePreview from '@/components/ResumePreview';
import AnalysisResult from '@/components/AnalysisResult';
import SessionResumeStudio from './SessionResumeStudio';
import { fetchResumeWorkspace, readableDate, resumeRequest } from './client';

export default function ApplicationResumes({ applicationId, snapshot, onRefresh }: { applicationId: string; snapshot: TrackerSnapshot; onRefresh: () => void }) {
  const [data, setData] = useState<ResumeWorkspaceData | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [answers, setAnswers] = useState<ResumeGenerationAnswers>({});
  const [draftVersion, setDraftVersion] = useState<number | undefined>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const initializedAnalysis = useRef('');
  const seenJobs = useRef(new Map<string, string>());
  const retryKeys = useRef(new Map<string, { key: string; jobId?: string }>());
  const application = snapshot.applications.find(item => item.id === applicationId);
  const refresh = useCallback(async () => {
    if (snapshot.demo) return;
    try { const result = await fetchResumeWorkspace(applicationId); setData(result); }
    catch (error) { setError(error instanceof Error ? error.message : 'Saved resumes could not be loaded.'); }
  }, [applicationId, snapshot.demo]);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 7000); window.addEventListener('focus', refresh); return () => { clearInterval(timer); window.removeEventListener('focus', refresh); }; }, [refresh]);
  useEffect(() => {
    if (!data) return;
    if (!sourceId && data.sources.length) setSourceId(data.sources[0].id);
    if (!analysisId && data.analyses.length) setAnalysisId(data.analyses[0].id);
    if (!versionId && data.versions.length) {
      const requested = new URLSearchParams(window.location.search).get('resumeVersion');
      setVersionId(data.versions.find(item => item.id === requested)?.id || application?.submittedResumeVersionId || data.versions[0].id);
    }
    for (const job of data.jobs) {
      if (job.data.status === 'succeeded') for (const [fingerprint, attempt] of retryKeys.current) {
        if (attempt.jobId === job.id) retryKeys.current.delete(fingerprint);
      }
      const previous = seenJobs.current.get(job.id);
      if (previous && previous !== 'succeeded' && job.data.status === 'succeeded') {
        toast.success(job.data.operation === 'analyze' ? 'Analysis saved' : 'New resume version saved');
        if (job.data.resultId) {
          if (job.data.operation === 'analyze') setAnalysisId(job.data.resultId);
          else setVersionId(job.data.resultId);
        }
        onRefresh();
      }
      seenJobs.current.set(job.id, job.data.status);
    }
  }, [data, sourceId, analysisId, versionId, application?.submittedResumeVersionId, onRefresh]);
  const analysis = data?.analyses.find(item => item.id === analysisId);
  const selectedVersion = data?.versions.find(item => item.id === versionId);
  const activeJobs = data?.jobs.filter(job => ['queued', 'running'].includes(job.data.status)) || [];
  useEffect(() => {
    if (!analysis || initializedAnalysis.current === analysis.id) return;
    const draft = data?.drafts.find(item => item.data.analysisId === analysis.id);
    setAnswers({ ...createInitialResumeGenerationAnswers(analysis.data.analysis, analysis.data.jobDescription), ...draft?.data.answers });
    setDraftVersion(draft?.version); setDirty(false); initializedAnalysis.current = analysis.id;
  }, [analysis, data?.drafts]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function action(name: string, input: Record<string, unknown>, success?: string) {
    setBusy(name); setError('');
    const keyed = name === 'analyze_resume' || name === 'generate_resume';
    const fingerprint = JSON.stringify([name, input, name === 'analyze_resume' ? application?.jobDescription : null], (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
    const attempt = keyed ? retryKeys.current.get(fingerprint) || { key: crypto.randomUUID() } : undefined;
    if (attempt) retryKeys.current.set(fingerprint, attempt);
    try {
      const result = await resumeRequest<StoredRecord<ResumeJob> & { status?: 'needs_answers'; questions?: Array<{ label: string }> }>(name, attempt ? { ...input, idempotencyKey: attempt.key } : input);
      if (result.kind === 'ai_job' && attempt) attempt.jobId = result.id;
      await refresh(); onRefresh();
      if (result.kind === 'ai_job' && result.data.status === 'failed') {
        const message = result.data.error || 'The background job could not start. Use Retry in resume activity.';
        setError(message); toast.error(message); return result;
      }
      if (result.status === 'needs_answers') { setError(`Complete the required details: ${result.questions?.map(question => question.label).join(', ') || 'your resume answers'}.`); return result; }
      if (attempt && (result.kind !== 'ai_job' || result.data.status === 'succeeded')) retryKeys.current.delete(fingerprint);
      if (result.kind === 'ai_job' && result.data.status === 'succeeded') {
        if (result.data.resultId) { if (result.data.operation === 'analyze') setAnalysisId(result.data.resultId); else setVersionId(result.data.resultId); }
        toast.success(result.data.operation === 'analyze' ? 'Analysis saved' : 'Resume version saved');
      } else if (success) toast.success(success);
      return result;
    }
    catch (error) { setError(error instanceof Error ? error.message : 'This change could not be saved.'); return null; }
    finally { setBusy(''); }
  }
  async function saveDraft() {
    if (!analysis) return false;
    setBusy('save_resume_draft'); setError('');
    try {
      const draft = await resumeRequest<StoredRecord<ResumeDraft>>('save_resume_draft', { applicationId, analysisId, answers, expectedVersion: draftVersion });
      setDraftVersion(draft.version); setDirty(false); await refresh(); toast.success('Answers saved'); return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Draft could not be saved.'); return false; }
    finally { setBusy(''); }
  }
  async function generate() {
    if (dirty && !await saveDraft()) return;
    await action('generate_resume', { applicationId, analysisId, answers }, 'Resume generation started. You can leave this page.');
  }
  const questions: ResumeGenerationQuestion[] = analysis ? [
    { id: 'fullName', label: 'Full name', prompt: '', placeholder: 'Your full name', required: true },
    { id: 'contactDetails', label: 'Contact details', prompt: '', placeholder: 'Email, phone, city, and relevant links', required: true, multiline: true },
    { id: 'targetTitle', label: 'Target title', prompt: '', placeholder: 'The role you are applying for', required: true },
    ...getResumeGenerationQuestions(analysis.data.analysis, analysis.data.jobDescription).filter(question => !['fullName', 'contactDetails', 'targetTitle'].includes(question.id)),
  ] : [];

  if (snapshot.demo) return (
    <div id="resume-workspace" className="space-y-6">
      <SessionResumeStudio
        applicationId={applicationId}
        defaultRoleTitle={application?.role || ''}
        defaultJobDescription={application?.jobDescription || ''}
        mode="application"
      />
    </div>
  );
  return <section id="resume-workspace" className="vc-resume-workspace space-y-5" aria-labelledby="application-resumes-title">
    <div className="clay-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="clay-kicker text-xs font-bold uppercase">Resume studio</p><h2 id="application-resumes-title" className="mt-2 text-2xl font-bold">Put your best version forward.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Analyze a resume against this role, fill in missing evidence, and keep the exact version you submit.</p></div><Link href="/resumes" className="clay-secondary-button px-4 py-2 text-sm font-semibold">Resume library</Link></div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p role="status" className="mt-5 text-sm text-slate-500">Loading saved resume work…</p>}
      {!!data && <div className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm font-semibold">Source resume<select value={sourceId} onChange={event => setSourceId(event.target.value)} className="clay-input mt-2 w-full p-3" disabled={!!busy}><option value="">Choose a saved resume…</option>{data.sources.map(source => <option key={source.id} value={source.id}>{source.data.filename}</option>)}</select></label><button className="clay-button px-4 py-3 text-sm font-semibold text-white" disabled={!sourceId || !!busy || activeJobs.some(job => job.data.operation === 'analyze')} onClick={() => void action('analyze_resume', { applicationId, sourceResumeId: sourceId }, 'Analysis started. Your work will be saved automatically.')}>{busy === 'analyze_resume' ? 'Starting…' : 'Analyze fit'}</button></div>}
      {data?.sources.length === 0 && <p className="mt-3 text-sm text-slate-500">Add your first resume in the <Link href="/resumes" className="font-semibold text-teal-800 underline">resume library</Link>.</p>}
      {application && application.jobDescription.trim().length < 25 && <p className="mt-3 text-sm text-amber-800">Add a full job description in the application details to analyze fit.</p>}
    </div>

    {!!data?.jobs.some(job => job.data.status !== 'succeeded') && <div className="clay-panel p-5" aria-live="polite"><h3 className="font-semibold">Resume activity</h3><ul className="mt-3 space-y-3">{data.jobs.filter(job => job.data.status !== 'succeeded').slice(0, 5).map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/50 p-3"><div><p className="text-sm font-semibold">{job.data.operation === 'analyze' ? 'Resume analysis' : 'Resume generation'} · {job.data.status}</p><p className="mt-1 text-xs text-slate-500">{job.data.error || 'Running in the background. It is safe to close this page.'}</p></div>{job.data.status === 'failed' && <button className="clay-secondary-button px-3 py-2 text-sm font-semibold" disabled={!!busy} onClick={() => void action('retry_ai_job', { id: job.id, expectedVersion: job.version }, 'Retry started')}>Retry</button>}</li>)}</ul></div>}

    {!!data?.analyses.length && <div className="clay-panel p-5 sm:p-6">
      <label className="block text-sm font-semibold">Saved analysis<select className="clay-input mt-2 w-full p-3" value={analysisId} disabled={!!busy || dirty} onChange={event => setAnalysisId(event.target.value)}>{data.analyses.map((item, index) => <option key={item.id} value={item.id}>Analysis {data.analyses.length - index} · {item.data.analysis.score}% fit · {readableDate(item.createdAt)}</option>)}</select></label>
      {analysis && <><div className="mt-5 flex flex-wrap items-center gap-4"><span className="rounded-2xl bg-teal-50 px-5 py-3 text-2xl font-bold text-teal-900">{analysis.data.analysis.score}%<span className="ml-2 text-sm font-medium">fit</span></span><p className="max-w-lg text-sm text-slate-600">This analysis and its job description are saved together. Future job-description edits do not change this version.</p></div><details className="mt-4 rounded-xl bg-white/60 p-4 text-sm"><summary className="cursor-pointer font-semibold">Full fit report and recommendations</summary><div className="mt-4"><AnalysisResult embedded matchScore={analysis.data.analysis.score} strengths={analysis.data.analysis.recommendations.strengths} weaknesses={analysis.data.analysis.recommendations.improvements} missingSkills={analysis.data.analysis.missingSkills} recommendations={[...analysis.data.analysis.recommendations.skillGaps, ...analysis.data.analysis.recommendations.format]} detailedAnalysis={analysis.data.analysis.detailedAnalysis} evaluation={analysis.data.analysis.evaluation} roleRequirements={analysis.data.analysis.roleRequirements} priorityActions={analysis.data.analysis.priorityActions} /></div></details>
      <form className="mt-6" onSubmit={event => { event.preventDefault(); void generate(); }}>
        <h3 className="text-lg font-bold">Make the details yours</h3><p className="mt-1 text-sm text-slate-600">Add real examples and correct the extracted details. Save answers to continue later.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{questions.map(question => <label key={question.id} className={`block text-sm font-semibold ${question.multiline ? 'md:col-span-2' : ''}`}>{question.label}{question.required && <span className="ml-2 text-xs font-normal text-teal-800">Required</span>}{question.prompt && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{question.prompt}</span>}{question.multiline ? <textarea rows={3} className="clay-input mt-2 w-full p-3 font-normal" value={answers[question.id] || ''} placeholder={question.placeholder} required={question.required} disabled={!!busy} onChange={event => { setAnswers(current => ({ ...current, [question.id]: event.target.value })); setDirty(true); }} /> : <input className="clay-input mt-2 w-full p-3 font-normal" value={answers[question.id] || ''} placeholder={question.placeholder} required={question.required} disabled={!!busy} onChange={event => { setAnswers(current => ({ ...current, [question.id]: event.target.value })); setDirty(true); }} />}</label>)}</div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className="clay-secondary-button px-4 py-3 text-sm font-semibold" disabled={!!busy || !dirty} onClick={() => void saveDraft()}>{busy === 'save_resume_draft' ? 'Saving…' : 'Save answers'}</button><button type="submit" className="clay-button px-4 py-3 text-sm font-semibold text-white" disabled={!!busy || activeJobs.some(job => job.data.operation === 'generate') || !hasRequiredResumeGenerationAnswers(analysis.data.analysis, answers, analysis.data.jobDescription)}>{busy === 'generate_resume' ? 'Starting…' : 'Generate new version'}</button><p className="text-xs text-slate-500">{dirty ? 'Unsaved answers' : draftVersion ? 'Answers saved' : 'Prefilled from your resume'}</p></div>
      </form></>}
    </div>}

    {!!data?.versions.length && <div className="clay-panel p-5 sm:p-6"><div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm font-semibold">Saved versions<select className="clay-input mt-2 w-full p-3" value={versionId} onChange={event => { setVersionId(event.target.value); const url = new URL(window.location.href); url.searchParams.set('resumeVersion', event.target.value); window.history.replaceState(null, '', url); }}>{data.versions.map((item, index) => <option key={item.id} value={item.id}>Version {data.versions.length - index} · {readableDate(item.createdAt)}{application?.submittedResumeVersionId === item.id ? ' · Submitted' : ''}</option>)}</select></label><button className="clay-secondary-button px-4 py-3 text-sm font-semibold" disabled={!versionId || !!busy || application?.submittedResumeVersionId === versionId} onClick={() => void action('select_submitted_resume', { applicationId, versionId, expectedVersion: application?.version }, 'Submitted resume selected')}>{application?.submittedResumeVersionId === versionId ? 'Submitted resume' : 'Mark as submitted resume'}</button></div><p className="mt-3 text-xs text-slate-500">Saved versions never change. Generate another version to make revisions.</p>{selectedVersion && <div className="vc-selected-resume mt-6"><ResumePreview generatedResume={selectedVersion.data.generatedResume} /></div>}</div>}
  </section>;
}
