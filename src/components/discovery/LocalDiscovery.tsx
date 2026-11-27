'use client';

import Link from '@/components/tracker/TrackerLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, Compass, EyeOff, FileText, LoaderCircle, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useTracker } from '@/components/tracker/TrackerProvider';
import { readOnboardingSession, readSessionSourceResume } from '@/lib/onboarding/session';
import { resumeFit, type FoundJob } from '@/lib/discovery/local-match';

type RankedJob = FoundJob & { relevance: number };
interface SourceStatus { name: string; url: string; ok: boolean; count: number; error?: string }
interface Criteria { roles: string; locations: string; remoteOnly: boolean; types: string[] }
interface Stored { criteria: Criteria; jobs: RankedJob[]; sources: SourceStatus[]; fetchedAt: string; saved: Record<string, string>; dismissed: string[] }

const KEY = 'vibecheck:discovery:v1';
function readStored(): Stored | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as Stored : null; } catch { return null; }
}
function writeStored(value: Stored) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* results are a convenience cache */ } }
function ageLabel(iso: string) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'Posted today' : days === 1 ? 'Posted yesterday' : days < 31 ? `Posted ${days} days ago` : `Posted ${new Date(iso).toLocaleDateString()}`;
}
const TYPE_OPTIONS = [['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract'], ['internship', 'Internship']] as const;

export default function LocalDiscovery() {
  const { snapshot, mutate } = useTracker();
  const [criteria, setCriteria] = useState<Criteria>({ roles: '', locations: '', remoteOnly: false, types: [] });
  const [jobs, setJobs] = useState<RankedJob[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [resumeText, setResumeText] = useState('');
  const [busy, setBusy] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const criteriaEdited = useRef(false);
  const loadedResumeId = useRef('');

  useEffect(() => {
    const dbPrefs = snapshot?.onboarding?.data.preferences;
    const sessionPrefs = readOnboardingSession()?.profile.preferences;
    const stored = readStored();
    const prefs = dbPrefs || sessionPrefs;
    const base: Criteria = {
      roles: prefs?.roles || '',
      locations: prefs?.locations || '',
      remoteOnly: Boolean(prefs && prefs.workModes.length === 1 && prefs.workModes[0] === 'remote'),
      types: prefs?.employmentTypes || [],
    };
    if (!criteriaEdited.current) {
      setCriteria(base.roles ? base : stored?.criteria.roles ? stored.criteria : base);
    }
    if (stored && !hydrated) {
      setJobs(stored.jobs || []);
      setSources(stored.sources || []);
      setFetchedAt(stored.fetchedAt || '');
      setSaved(stored.saved || {});
      setDismissed(stored.dismissed || []);
    }
    setHydrated(true);
  }, [snapshot?.onboarding, hydrated]);

  useEffect(() => {
    const primaryResumeId = snapshot?.resumes[0]?.id || '';
    if (!primaryResumeId) {
      const localText = readSessionSourceResume()?.text || '';
      if (localText && !resumeText) setResumeText(localText);
      return;
    }
    if (loadedResumeId.current === primaryResumeId) return;
    loadedResumeId.current = primaryResumeId;
    let active = true;
    void fetch(`/api/resumes/${encodeURIComponent(primaryResumeId)}?kind=source_resume`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((record) => {
        if (active && record?.data?.text) setResumeText(String(record.data.text));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [snapshot?.resumes, resumeText]);

  useEffect(() => {
    if (hydrated) writeStored({ criteria, jobs, sources, fetchedAt, saved, dismissed });
  }, [hydrated, criteria, jobs, sources, fetchedAt, saved, dismissed]);

  const search = useCallback(async () => {
    if (criteria.roles.trim().length < 2) { setError('Describe the roles you want, for example “product designer, ux researcher”.'); return; }
    setSearching(true); setError('');
    try {
      const query = new URLSearchParams({ roles: criteria.roles.trim(), locations: criteria.locations.trim(), modes: criteria.remoteOnly ? 'remote' : '', types: criteria.types.join(',') });
      const response = await fetch(`/api/jobs/search?${query}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) { if (Array.isArray(result.sources)) setSources(result.sources); throw new Error(result.error || 'The search could not be completed.'); }
      setJobs(result.jobs); setSources(result.sources); setFetchedAt(result.fetchedAt);
      if (!result.jobs.length) toast.info('No matches. Try broader roles or a wider location.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The search could not be completed.'); }
    finally { setSearching(false); }
  }, [criteria]);

  async function save(job: RankedJob) {
    if (busy || !snapshot) return;
    setBusy(job.id);
    try {
      const tags = [job.source, job.remote ? 'Remote' : '', job.jobType, ...job.tags].map(tag => tag.trim().slice(0, 40)).filter(Boolean).filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 8);
      const created = await mutate('create_application', {
        company: job.company.slice(0, 200), role: job.role.slice(0, 200), stage: 'Saved', jobUrl: job.url, jobDescription: job.description,
        location: job.location.slice(0, 200), compensation: job.compensation.slice(0, 200), tags,
      }, `Saved ${job.role} to your tracker`) as { id: string };
      setSaved(previous => ({ ...previous, [job.id]: created.id }));
    } catch { /* mutate already reported the problem */ }
    finally { setBusy(''); }
  }

  const fits = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resumeFit>>();
    if (resumeText.trim().length >= 25) for (const job of jobs) map.set(job.id, resumeFit(resumeText, job));
    return map;
  }, [jobs, resumeText]);

  const existing = useMemo(() => new Set(snapshot?.applications.map(app => app.id) || []), [snapshot]);
  const visible = jobs.filter(job => !dismissed.includes(job.id)
    && `${job.company} ${job.role} ${job.location}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => (fits.get(b.id)?.score ?? 0) * 0.4 + b.relevance * 0.6 - ((fits.get(a.id)?.score ?? 0) * 0.4 + a.relevance * 0.6));

  return <div className="mx-auto max-w-6xl space-y-7 pb-10">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Make room for possibility</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Find your next role</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Live openings from free public job boards, ranked against what you want{resumeText ? ' and your resume' : ''}. Save the good ones to your tracker.</p>
      </div>
      <Link href="/onboarding?edit=preferences" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"><SlidersHorizontal size={16} /> Search preferences</Link>
    </header>

    <section className="clay-panel rounded-2xl border border-teal-100 bg-teal-50/60 p-6">
      <h2 className="flex items-center gap-2 font-semibold text-teal-950"><Compass size={19} /> A search shaped around you</h2>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); void search(); }}>
        <label className="block text-sm font-semibold text-teal-950 md:col-span-2">Roles
          <input className="clay-input mt-2 w-full p-3 font-normal" value={criteria.roles} maxLength={500} placeholder="e.g. product designer, ux researcher" onChange={event => { criteriaEdited.current = true; setCriteria({ ...criteria, roles: event.target.value }); }} />
        </label>
        <label className="block text-sm font-semibold text-teal-950">Location
          <input className="clay-input mt-2 w-full p-3 font-normal" value={criteria.locations} maxLength={300} placeholder="e.g. Toronto, Canada, or leave blank" onChange={event => { criteriaEdited.current = true; setCriteria({ ...criteria, locations: event.target.value }); }} />
        </label>
        <fieldset className="text-sm text-teal-950">
          <legend className="font-semibold">Work arrangement and type</legend>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-teal-700" checked={criteria.remoteOnly} onChange={event => { criteriaEdited.current = true; setCriteria({ ...criteria, remoteOnly: event.target.checked }); }} />Remote only</label>
            {TYPE_OPTIONS.map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="checkbox" className="accent-teal-700" checked={criteria.types.includes(value)} onChange={event => { criteriaEdited.current = true; setCriteria({ ...criteria, types: event.target.checked ? [...criteria.types, value] : criteria.types.filter(type => type !== value) }); }} />{label}</label>)}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" disabled={searching} className="clay-button inline-flex items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
            {searching ? <LoaderCircle size={17} className="animate-spin" /> : <Search size={17} />}{searching ? 'Searching job boards…' : 'Find jobs'}
          </button>
          {fetchedAt && <span className="text-xs text-teal-800">Last searched {new Date(fetchedAt).toLocaleString()}</span>}
          {!resumeText && <Link href="/resumes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 underline underline-offset-4"><FileText size={13} />Add a resume to see how well you fit each job</Link>}
        </div>
      </form>
      <p className="mt-3 text-xs leading-5 text-teal-800">Searches run against free public job boards; fit scores compare against your saved resume locally.</p>
    </section>

    {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><Link href="/applications" className="shrink-0 font-semibold underline">Add a job manually</Link></div>}

    <section>
      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h2 className="text-lg font-semibold text-slate-900">Your discoveries{visible.length ? ` (${visible.length})` : ''}</h2><p className="mt-1 text-xs text-slate-500">Open the original posting for current details before applying.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {dismissed.length > 0 && <button type="button" onClick={() => setDismissed([])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Restore hidden ({dismissed.length})</button>}
          <input aria-label="Filter discovered jobs" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter jobs…" className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </div>
      </div>
      {!visible.length ? <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-teal-700"><Search size={28} /></div>
        <h3 className="font-semibold text-slate-900">{jobs.length ? 'No matches for this view' : 'Your next opportunity could be here'}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{jobs.length ? 'Clear the filter or restore dismissed jobs by searching again.' : 'Run a search to pull in current openings, then save the ones you want to pursue.'}</p>
      </div> : <div className="grid gap-4 lg:grid-cols-2">{visible.map(job => {
        const fit = fits.get(job.id);
        const savedId = saved[job.id] && existing.has(saved[job.id]) ? saved[job.id] : '';
        return <article key={job.id} className="clay-panel flex flex-col rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-teal-700">{job.company}</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{job.role}</h3>
              <p className="mt-2 text-xs text-slate-500">{[job.location || 'Location not listed', job.remote ? 'remote' : null, job.jobType || null].filter(Boolean).join(' · ')}</p></div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {savedId && <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800"><Check size={12} />Saved</span>}
              {fit && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700" title={`Matches: ${fit.matched.join(', ') || 'none'}\nNot in your resume: ${fit.missing.join(', ') || 'none'}`}>Resume fit {fit.score}%</span>}
            </div>
          </div>
          {job.compensation && <p className="mt-3 text-sm font-medium text-slate-700">{job.compensation}</p>}
          <p className="mt-4 line-clamp-5 whitespace-pre-line text-sm leading-6 text-slate-600">{job.description.slice(0, 520)}{job.description.length > 520 ? '…' : ''}</p>
          {fit && fit.missing.length > 0 && <p className="mt-3 text-xs text-slate-500">Worth covering in your resume: {fit.missing.slice(0, 5).join(', ')}</p>}
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1"><a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-teal-700 underline decoration-teal-200 underline-offset-4">View on {job.source}<ArrowUpRight size={11} /></a></div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <span className="mt-4">{ageLabel(job.postedAt)}</span>
            <div className="mt-4 flex items-center gap-2">
              {!savedId && <button aria-label={`Hide ${job.role} at ${job.company}`} onClick={() => setDismissed(previous => [...previous, job.id])} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-500 hover:text-slate-800"><EyeOff size={14} />Hide</button>}
              {savedId ? <div className="flex flex-wrap items-center gap-3"><Link href={`/applications/${savedId}#resume-workspace`} className="font-semibold text-teal-800 underline underline-offset-4">Tailor resume</Link><Link href={`/applications/${savedId}`} className="font-semibold text-teal-800">Open application →</Link></div>
                : <button disabled={!!busy} onClick={() => void save(job)} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-40">{busy === job.id ? <LoaderCircle size={14} className="animate-spin" /> : <BookmarkPlus size={14} />}Save to tracker</button>}
            </div>
          </div>
        </article>;
      })}</div>}
      {sources.length > 0 && <p className="mt-6 text-xs leading-5 text-slate-500">Job data from {sources.map((source, index) => <span key={source.name}>{index > 0 && ', '}<a className="underline underline-offset-2" href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>{!source.ok && ' (unavailable right now)'}</span>)}. These boards are mostly remote and tech-leaning roles, so for local or trades work add postings manually from Applications.</p>}
    </section>
  </div>;
}
