'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import { resumeRequest } from './client';

type Legacy = { analysis: Analysis; jobDescription: string; answers: ResumeGenerationAnswers; generatedResume?: GeneratedResume };
export default function LegacyResumeImport({ applications, onImported, demo = false }: { applications: Array<{ id: string; company: string; role: string }>; onImported?: () => void; demo?: boolean }) {
  const [legacy, setLegacy] = useState<Legacy | null>(null);
  const [applicationId, setApplicationId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [attachGenerated, setAttachGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      if (sessionStorage.getItem('vibecheckLegacyImported')) return;
      const raw = sessionStorage.getItem('latestAnalysis');
      if (!raw) return;
      const generated = sessionStorage.getItem('latestGeneratedResume');
      setLegacy({ analysis: JSON.parse(raw), jobDescription: sessionStorage.getItem('latestJobDescription') || '', answers: JSON.parse(sessionStorage.getItem('latestResumeGenerationAnswers') || '{}'), generatedResume: generated ? JSON.parse(generated) : undefined });
    } catch { setError('The old browser-session resume could not be read. Your saved application records are unaffected.'); }
  }, []);
  if (!legacy && !error) return null;
  const application = applications.find(item => item.id === applicationId);
  async function importResume() {
    if (!application || !confirmed || !legacy) return;
    setBusy(true); setError('');
    try {
      await resumeRequest('import_legacy', { ...legacy, applicationId, company: application.company, role: application.role, confirmed: true, attachGenerated });
      sessionStorage.setItem('vibecheckLegacyImported', '1'); setLegacy(null); onImported?.(); toast.success('Previous analysis imported');
    } catch (error) { setError(error instanceof Error ? error.message : 'Import failed.'); }
    finally { setBusy(false); }
  }
  return <section className="clay-panel p-5 sm:p-6" aria-labelledby="import-title">
    <h2 id="import-title" className="text-xl font-bold">Bring your previous work along</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">A resume analysis is still saved in this browser session. Choose its company and role before saving it to your account. This is a one-time import.</p>
    {legacy && <div className="mt-4 space-y-4">
      <label className="block text-sm font-semibold">Application<select className="clay-input mt-2 w-full p-3" value={applicationId} onChange={event => { setApplicationId(event.target.value); setConfirmed(false); }} disabled={busy || demo}><option value="">Choose company and role…</option>{applications.map(item => <option key={item.id} value={item.id}>{item.company} · {item.role}</option>)}</select></label>
      {!applications.length && <p className="text-sm text-slate-500">Create the matching application first, then return here to import.</p>}
      {legacy.jobDescription && <details className="rounded-xl bg-white/60 p-3 text-sm"><summary className="cursor-pointer font-semibold">Review the saved job description</summary><p className="mt-3 whitespace-pre-wrap text-slate-600">{legacy.jobDescription}</p></details>}
      {legacy.generatedResume && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={attachGenerated} onChange={event => setAttachGenerated(event.target.checked)} disabled={busy || demo} /><span>Also attach the generated resume for {legacy.generatedResume.preview?.fullName || 'this session'}. I have checked that it belongs to this company and role.</span></label>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!application || busy || demo} /><span>I confirm this analysis belongs to {application ? `${application.company}: ${application.role}` : 'the selected application'}.</span></label>
      <button className="clay-button px-4 py-3 text-sm font-semibold text-white" disabled={!confirmed || !application || busy || demo} onClick={() => void importResume()}>{busy ? 'Importing…' : 'Import previous analysis'}</button>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
