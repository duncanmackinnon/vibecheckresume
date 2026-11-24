'use client';

import Link from '@/components/tracker/TrackerLink';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, Clock3, Compass, LoaderCircle, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useTracker } from '@/components/tracker/TrackerProvider';
import type { DiscoveryOverview, JobMatch } from '@/lib/discovery/types';

export default function DiscoveryPage() {
  const { snapshot, loading: workspaceLoading, refresh: refreshTracker } = useTracker();
  const [data, setData] = useState<DiscoveryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [includeSaved, setIncludeSaved] = useState(false);
  const [filter, setFilter] = useState('');
  const requestKeys = useRef(new Map<string, string>());
  const active = useRef(true);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!snapshot || snapshot.demo) { setLoading(false); return; }
    try {
      const response = await fetch('/api/discovery', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Your job matches could not be loaded.');
      if (active.current && sequence === loadSequence.current) { setData(result); setError(''); }
    } catch (cause) { if (active.current && sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : 'Your job matches could not be loaded.'); }
    finally { if (active.current && sequence === loadSequence.current) setLoading(false); }
  }, [snapshot]);
  useEffect(() => { active.current = true; if (!workspaceLoading) void load(); return () => { active.current = false; loadSequence.current += 1; }; }, [load, workspaceLoading]);
  const searching = data?.runs.some(run => run.data.status === 'queued' || run.data.status === 'running') || false;
  useEffect(() => {
    if (!searching) return;
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000);
    return () => window.clearInterval(interval);
  }, [searching, load]);

  async function act(action: 'find_jobs' | 'save_discovered_job' | 'restart_schedule', match?: JobMatch) {
    const key = match?.id || action;
    if (busy) return;
    setBusy(key); setError('');
    const requestId = requestKeys.current.get(key) || crypto.randomUUID(); requestKeys.current.set(key, requestId);
    try {
      const response = await fetch('/api/discovery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ action, input: action === 'restart_schedule' ? {} : { idempotencyKey: requestId, ...(match ? { matchId: match.id } : {}) } }),
      });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'This action could not be completed.');
      requestKeys.current.delete(key);
      if (action === 'save_discovered_job') { toast.success('Saved to your applications'); await refreshTracker(); }
      if (action === 'find_jobs' && result.result?.run?.data?.status === 'failed') throw new Error(result.result.run.data.error || 'The search could not start.');
      if (action === 'restart_schedule' && result.result?.schedule?.data?.status === 'failed') throw new Error(result.result.schedule.data.error || 'The schedule could not restart.');
      await load();
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'This action could not be completed.'; await load(); setError(message); }
    finally { setBusy(''); }
  }

  const preview = snapshot?.demo;
  const ready = !preview && data?.configured && data.profileComplete && !!data.preferences?.roles.length;
  const matches = (data?.matches || []).filter(match => (includeSaved || !match.data.savedApplicationId) && `${match.data.company} ${match.data.role} ${match.data.location}`.toLowerCase().includes(filter.toLowerCase()));
  const latest = data?.runs[0];
  const schedule = data?.schedule?.data;
  const delayedSchedule = schedule?.status === 'active' && schedule.nextRunAt && Date.parse(schedule.nextRunAt) < Date.now() - 15 * 60000;

  return <div className="mx-auto max-w-6xl space-y-7 pb-10">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Make room for possibility</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">Find your next role</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Discover openings around your goals. Keep the ones that fit, with a source for every job.</p></div><Link href="/onboarding?edit=preferences" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"><SlidersHorizontal size={16} /> Search preferences</Link></header>
    {workspaceLoading || loading ? <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />Loading your discovery space…</div> : <>
      <section className="clay-panel rounded-2xl border border-teal-100 bg-teal-50/60 p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div className="max-w-2xl"><h2 className="flex items-center gap-2 font-semibold text-teal-950"><Compass size={19} /> A search shaped around you</h2><p className="mt-2 text-sm leading-6 text-teal-900">{data?.preferences?.roles.length ? data.preferences.roles.join(' · ') : 'Choose the roles you want to explore.'}{data?.preferences?.locations.length ? ` in ${data.preferences.locations.join(' · ')}` : data?.preferences?.roles.length ? ' · Any location' : ''}</p>{data?.preferences?.workStyles.length ? <p className="mt-1 text-xs capitalize text-teal-800">{[...data.preferences.workStyles, ...data.preferences.employmentTypes].join(' · ')}</p> : null}<p className="mt-3 text-xs leading-5 text-teal-800">Searches send your saved role, location, work arrangement, employment preferences and additional notes to OpenAI to find public job postings.</p></div><button disabled={!ready || !!busy || searching} onClick={() => void act('find_jobs')} className="clay-button inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{searching || busy === 'find_jobs' ? <LoaderCircle size={17} className="animate-spin" /> : <Search size={17} />}{searching ? 'Searching the web…' : 'Find jobs'}</button></div>
        {preview ? <div className="mt-4 border-t border-teal-100 pt-4 text-sm text-teal-900">Job discovery needs your private workspace. <Link href={snapshot?.capabilities.auth ? '/auth/login?returnTo=%2Fonboarding' : '/onboarding?edit=preferences'} className="font-semibold underline underline-offset-4">{snapshot?.capabilities.auth ? 'Sign in and set your preferences' : 'Edit setup'}</Link>. Discovered jobs will appear here after a real search. You can <Link href="/applications" className="font-semibold underline underline-offset-4">Add a job manually</Link>.</div> : !data?.profileComplete ? <p className="mt-4 text-sm text-teal-900"><Link href="/onboarding" className="font-semibold underline underline-offset-4">Finish your profile</Link> to start discovering jobs.</p> : !data?.configured ? <p className="mt-4 text-sm text-amber-900">Website searches need a configured search service. You can <Link href="/applications" className="font-semibold underline underline-offset-4">Add a job manually</Link>.</p> : null}
      </section>
      {!preview && <section className="clay-panel-muted flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 p-5 sm:flex-row sm:items-center"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock3 size={17} className="text-teal-700" />{schedule && schedule.cadence !== 'manual' && data?.consent ? `${schedule.cadence === 'daily' ? 'Daily' : 'Weekly'} discovery` : 'Search when you’re ready'}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{!data?.scheduleConfigured ? 'Scheduled discovery is unavailable until the platform search service is configured. Your saved schedule preferences are kept.' : schedule?.status === 'failed' ? schedule.error : delayedSchedule ? 'The next scheduled search is delayed. Restart it to resume your saved schedule.' : schedule?.status === 'active' && schedule.nextRunAt ? `Next search: ${new Date(schedule.nextRunAt).toLocaleString()}. Results will be saved here.` : schedule?.status === 'starting' ? 'Your scheduled search is starting.' : 'Find jobs whenever you choose, or opt in to daily or weekly searches in your preferences.'}</p></div>{schedule && (schedule.status === 'failed' || delayedSchedule) && data?.consent && schedule.cadence !== 'manual' && <button disabled={!!busy || !data?.scheduleConfigured} onClick={() => void act('restart_schedule')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-40"><RefreshCw size={15} className={busy === 'restart_schedule' ? 'animate-spin' : ''} />Restart scheduled searches</button>}</section>}
      {searching && <p className="rounded-xl bg-white p-4 text-sm text-slate-600" role="status">Searching current public job postings. You can leave this page; results are saved to your workspace.</p>}
      {latest?.data.status === 'failed' && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{latest.data.error} Use Find jobs to start a new search.</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><button onClick={() => void load()} className="shrink-0 font-semibold underline">Refresh</button></div>}
      <section><div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold text-slate-900">Your discoveries</h2><p className="mt-1 text-xs text-slate-500">Open the original posting for current details before applying.</p></div><div className="flex flex-wrap items-center gap-3"><input aria-label="Filter discovered jobs" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter jobs…" className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeSaved} onChange={event => setIncludeSaved(event.target.checked)} className="accent-teal-700" />Include saved</label><button aria-label="Refresh discovered jobs" onClick={() => void load()} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500"><RefreshCw size={15} /></button></div></div>
        {!matches.length ? <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><div className="mb-4 rounded-2xl bg-slate-50 p-4 text-teal-700"><Search size={28} /></div><h3 className="font-semibold text-slate-900">{filter || data?.matches.length ? 'No matches for this view' : latest?.data.status === 'succeeded' ? 'No sourced matches found this time' : 'Your next opportunity could be here'}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{latest?.data.status === 'succeeded' && !data?.matches.length ? 'Try broader role or location preferences, then search again.' : 'Run a search to collect real openings, then save the ones you want to pursue.'}</p></div> : <div className="grid gap-4 lg:grid-cols-2">{matches.map(match => <article key={match.id} className="clay-panel flex flex-col rounded-2xl border border-slate-200 p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-teal-700">{match.data.company}</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{match.data.role}</h3><p className="mt-2 text-xs text-slate-500">{[match.data.location || 'Location not listed', match.data.workStyle !== 'unknown' ? match.data.workStyle : null].filter(Boolean).join(' · ')}</p></div>{match.data.savedApplicationId && <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800"><Check size={12} />Saved</span>}</div>{match.data.compensation && <p className="mt-3 text-sm font-medium text-slate-700">{match.data.compensation}</p>}<p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{match.data.summary}</p><div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">{match.data.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-teal-700 underline decoration-teal-200 underline-offset-4"><span className="truncate">[{index + 1}] {source.title}</span><ArrowUpRight size={11} className="shrink-0" /></a>)}</div><div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-400"><span className="mt-4">Found {new Date(match.data.lastSeenAt).toLocaleDateString()}</span>{match.data.savedApplicationId ? <Link href={`/applications/${match.data.savedApplicationId}`} className="mt-4 font-semibold text-teal-800">Open application →</Link> : <button disabled={!!busy} onClick={() => void act('save_discovered_job', match)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-40">{busy === match.id ? <LoaderCircle size={14} className="animate-spin" /> : <BookmarkPlus size={14} />}Save to tracker</button>}</div></article>)}</div>}
      </section>
    </>}
  </div>;
}
