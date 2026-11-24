'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, FileText, LockKeyhole, MessageCircle, Upload, X } from 'lucide-react';
import type { Capabilities, ConnectionData } from '@/lib/tracker/types';
import type { OnboardingDraftData, SavedOnboardingDraft, OnboardingProfileData, SavedOnboardingProfile } from '@/lib/onboarding/types';
import { clearOnboardingSession, createOnboardingSession, profileScreen, readOnboardingSession, writeOnboardingSession, writeSessionSourceResume, sessionForOwner, type OnboardingScreen, type OnboardingSession } from '@/lib/onboarding/session';
import { createStarterResumeAnswers, starterResumeAnswersSchema } from '@/lib/onboarding/starter-resume';
import StarterResumeBuilder from './StarterResumeBuilder';

interface OnboardingState { authenticated: boolean; userId: string | null; draft: SavedOnboardingDraft | null; profile: SavedOnboardingProfile | null; capabilities: Capabilities; connection: ConnectionData | null }
const unavailable: Capabilities = { auth: false, database: false, storage: false, deepseek: false, openai: false };
const progressScreens = ['name', 'choose', 'preferences', 'cadence', 'finish'];
function serverStep(screen: OnboardingScreen): OnboardingProfileData['step'] { return screen === 'choose' || screen === 'upload' ? 'resume' : screen === 'cadence' || screen === 'finish' ? 'connect' : screen; }

export default function OnboardingFlow() {
  const router = useRouter();
  const [draft, setDraft] = useState<OnboardingSession>(createOnboardingSession);
  const [account, setAccount] = useState<OnboardingState>({ authenticated: false, userId: null, draft: null, profile: null, capabilities: unavailable, connection: null });
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [savedWithWarning, setSavedWithWarning] = useState(false);
  const edited = useRef(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const draftRecord = useRef<SavedOnboardingDraft | null>(null);
  const draftQueue = useRef(Promise.resolve());
  const draftConflict = useRef(false);
  const accountOwner = useRef<string | null>(null);
  const lastSavedDraft = useRef('');
  const current = useRef(draft);
  const attempts = useRef(new Map<string, string>());
  const profileRecord = useRef<SavedOnboardingProfile | null>(null);
  const persistSession = useRef(true);
  const scheduleIssue = useRef('');
  const heading = useRef<HTMLHeadingElement>(null);
  current.current = draft;

  useEffect(() => {
    const session = readOnboardingSession();
    if (session && !session.ownerId) setDraft(session);
    const query = new URLSearchParams(window.location.search);
    const edit = query.get('edit');
    const editResume = query.get('editResume');
    const requestedScreen = edit === 'preferences' ? 'preferences' : edit === 'name' ? 'name' : edit === 'resume' ? 'choose' : null;
    if (requestedScreen && session?.profile.displayName) setDraft(previous => ({ ...previous, screen: requestedScreen }));
    setLoaded(true);
    const keyboard = () => { document.documentElement.dataset.vcInput = 'keyboard'; };
    const pointer = () => { document.documentElement.dataset.vcInput = 'pointer'; };
    window.addEventListener('keydown', keyboard); window.addEventListener('pointerdown', pointer);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    void fetch('/api/onboarding', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Your saved setup could not be reached. Your draft is still available in this browser.');
      const state = await response.json() as OnboardingState;
      setAccount(state); profileRecord.current = state.profile;
      draftRecord.current = state.draft; accountOwner.current = state.userId;
      const ownedSession = sessionForOwner(session, state.userId);
      if (session?.ownerId && !ownedSession) clearOnboardingSession();
      if (state.authenticated && state.userId && !edited.current) {
        const savedDraft = state.draft?.data;
        const restore = session?.pendingSignIn && ownedSession ? ownedSession : savedDraft ? {...createOnboardingSession(), ...savedDraft, ownerId:state.userId} : ownedSession;
        setDraft(restore ? {...restore, screen:restore.screen === 'connect' ? 'cadence' : restore.screen, ownerId:state.userId, pendingSignIn:false, preview:false} : {...createOnboardingSession(), ownerId:state.userId});
        if (savedDraft) lastSavedDraft.current = JSON.stringify(savedDraft);
      }
      if (state.authenticated && state.profile && !edited.current && ((!state.draft && !session?.pendingSignIn) || requestedScreen || editResume || state.profile.data.step === 'complete')) {
        setDraft(previous => ({ ...previous, profile: state.profile!.data, screen: requestedScreen || profileScreen(state.profile!.data), preview: false }));
      }
      if(state.authenticated && state.userId && edited.current)setDraft(previous=>({...previous,ownerId:state.userId,pendingSignIn:false}));
      if (editResume) {
        if (!state.authenticated) throw new Error('Sign in to open the saved resume you want to edit.');
        if (!/^[a-f0-9-]{36}$/i.test(editResume)) throw new Error('This saved resume link is not valid.');
        const response = await fetch(`/api/resumes/${encodeURIComponent(editResume)}?kind=source_resume`, { cache: 'no-store', signal: controller.signal });
        const record = await response.json();
        if (!response.ok) throw new Error(record.error || 'This resume could not be opened.');
        const answers = starterResumeAnswersSchema.safeParse(record.data?.starterAnswers);
        if (!answers.success) throw new Error('This resume has no saved builder answers. Choose Answer a few questions to create a new one.');
        setDraft(previous => ({ ...previous, answers: answers.data, builtResume: false, screen: 'build', profile: { ...previous.profile, resumePath: 'build', sourceResumeId: null } }));
      }
    }).catch(error => { if (timedOut) setError('Your saved setup is taking too long to load. Your draft is still in this browser; reload to reconnect before saving to your account.'); else if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load your saved setup.'); }).finally(() => { window.clearTimeout(timeout); setChecking(false); });
    return () => { controller.abort(); window.clearTimeout(timeout); window.removeEventListener('keydown', keyboard); window.removeEventListener('pointerdown', pointer); };
  }, []);
  useEffect(() => { if (loaded && persistSession.current) setStorageWarning(!writeOnboardingSession(draft)); }, [draft, loaded]);
  useEffect(() => { if (loaded && draft.screen !== 'name' && draft.screen !== 'build') heading.current?.focus({ preventScroll: true }); }, [draft.screen, loaded]);
  useEffect(() => {
    if (!loaded || checking || !account.authenticated || !account.userId || !persistSession.current || draftConflict.current || busy) return;
    const input: OnboardingDraftData = {profile:draft.profile, screen:draft.screen, answers:draft.answers, builtResume:draft.builtResume,builderStep:draft.builderStep};
    const fingerprint = JSON.stringify(input);
    if (fingerprint === lastSavedDraft.current) return;
    const ownerId = account.userId;
    const timeout = window.setTimeout(() => {
      draftQueue.current = draftQueue.current.then(async () => {
        if (accountOwner.current !== ownerId || draftConflict.current || fingerprint === lastSavedDraft.current) return;
        setSavingDraft(true);
        try {
          const result = await api('save_draft', input, draftRecord.current?.version);
          if (accountOwner.current !== ownerId) return;
          draftRecord.current = result.draft; lastSavedDraft.current = fingerprint;
        } catch (error) { setError(error instanceof Error ? error.message : 'Your draft could not be saved.'); }
        finally { setSavingDraft(false); }
      });
    },500);
    return () => window.clearTimeout(timeout);
  },[draft,loaded,checking,account.authenticated,account.userId,busy]);

  function updateProfile(patch: Partial<OnboardingProfileData>) { edited.current = true; setDraft(previous => ({ ...previous, profile: { ...previous.profile, ...patch } })); }
  function updatePreferences(patch: Partial<OnboardingProfileData['preferences']>) { updateProfile({ preferences: { ...draft.profile.preferences, ...patch } }); }
  async function api(action: 'save_profile' | 'save_starter_resume' | 'save_draft', input: unknown, expectedVersion?: number) {
    const fingerprint = JSON.stringify({ action, input, expectedVersion });
    const idempotencyKey = attempts.current.get(fingerprint) || crypto.randomUUID(); attempts.current.set(fingerprint, idempotencyKey);
    const response = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, input, ...(expectedVersion ? { expectedVersion } : {}), idempotencyKey }), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409 && action === 'save_draft') { draftConflict.current = true; throw new Error('Your draft changed in another window. Your edits remain here; reload to restore the latest saved draft.'); }
      if (response.status === 409) {
        const latestResponse = await fetch('/api/onboarding', { cache: 'no-store' });
        if (latestResponse.ok) { const latest = await latestResponse.json() as OnboardingState; setAccount(latest); profileRecord.current = latest.profile; if (latest.profile) setDraft(previous => ({ ...previous, profile: latest.profile!.data })); }
        throw new Error('Your profile changed in another window. The latest preferences are loaded; review them and try again.');
      }
      throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Your setup could not be saved. Please try again.');
    }
    attempts.current.delete(fingerprint); return result;
  }
  async function saveProfile(profile: OnboardingProfileData) {
    const { completedAt: _completedAt, ...input } = profile;
    const result = await api('save_profile', input, profileRecord.current?.version);
    scheduleIssue.current = result.scheduleError ? String(result.scheduleError) : result.schedule?.data?.status === 'failed' ? String(result.schedule.data.error || 'Scheduled searches are delayed.') : '';
    profileRecord.current = result.profile;
    setAccount(previous => ({ ...previous, profile: result.profile }));
    return result.profile as SavedOnboardingProfile;
  }
  async function move(screen: OnboardingScreen, patch: Partial<OnboardingSession> = {}) {
    if (busy || draftConflict.current) return;
    setError(''); edited.current = true;
    const next = { ...draft, ...patch, screen, profile: { ...draft.profile, ...patch.profile, step: serverStep(screen) } };
    if (account.authenticated) {
      setBusy(true);
      try { await draftQueue.current; const saved = await saveProfile(next.profile); next.profile = saved.data; }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not save your progress.'); return; }
      finally { setBusy(false); }
    }
    setDraft(next);
  }
  function back(screen: OnboardingScreen) { setError(''); setDraft(previous => ({ ...previous, screen })); }
  function signIn() { writeOnboardingSession({ ...current.current, pendingSignIn: true }); }
  async function uploadFile() {
    if (!file) throw new Error('Select your resume again. Files stay in memory and are not kept after a reload.');
    const bytes = await file.arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    const fingerprint = `upload:${file.name}:${sha256}`;
    const idempotencyKey = attempts.current.get(fingerprint) || crypto.randomUUID(); attempts.current.set(fingerprint, idempotencyKey);
    const input = { filename: file.name, mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain'), size: file.size, sha256, idempotencyKey };
    const uploadRequest = async (action: 'prepare' | 'complete') => { const response = await fetch('/api/resumes/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, input }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Your resume could not be saved.'); return result; };
    const prepared = await uploadRequest('prepare');
    let result = prepared;
    if (!prepared.complete) {
      const transfer = await fetch(prepared.signedUrl, { method: 'PUT', headers: { 'Content-Type': input.mimeType, 'x-upsert': 'false', 'Cache-Control': 'max-age=0' }, body: bytes });
      if (!transfer.ok) { const failure = await transfer.json().catch(() => ({})); if (!/already exists|duplicate/i.test(failure.message || failure.error || '')) throw new Error('The file transfer failed. Please try again with the same file.'); }
      result = await uploadRequest('complete');
    }
    const sourceId = result.resume?.id || result.record?.id || result.id;
    if (!sourceId) throw new Error('The upload finished without a saved resume ID. Please retry.');
    attempts.current.delete(fingerprint); return sourceId as string;
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
  async function continueUpload() {
    if (!draft.profile.sourceResumeId && !file) { setError('Choose a resume file to continue.'); return; }
    if (account.authenticated && !draft.profile.sourceResumeId) {
      setBusy(true); setError('');
      try { const sourceResumeId = await uploadFile(); const next = { ...draft.profile, sourceResumeId, resumePath: 'upload' as const, step: 'preferences' as const }; setDraft(previous => ({ ...previous, profile: next })); const saved = await saveProfile(next); setDraft(previous => ({ ...previous, profile: saved.data, screen: 'preferences' })); }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not upload your resume.'); }
      finally { setBusy(false); }
    } else {
      if (file) {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          if (file.size <= 2_500_000) {
            const pendingPdfBase64 = await fileToBase64(file).catch(() => '');
            if (pendingPdfBase64) writeSessionSourceResume({ schemaVersion: 1, filename: file.name, mimeType: 'application/pdf', origin: 'upload', text: '', pendingPdfBase64, updatedAt: new Date().toISOString() });
          }
        } else {
          const text = (await file.text().catch(() => '')).replace(/\0/g, '').trim();
          if (text) writeSessionSourceResume({ schemaVersion: 1, filename: file.name, mimeType: 'text/plain', origin: 'upload', text, updatedAt: new Date().toISOString() });
        }
      }
      await move('preferences');
    }
  }
  async function finish(preview: boolean) {
    setError('');
    if (preview) { const session = { ...draft, preview: true, pendingSignIn: false }; writeOnboardingSession(session); setDraft(session); router.push('/dashboard?preview=1'); return; }
    setBusy(true);
    try {
      await draftQueue.current;
      let profile = { ...draft.profile };
      if (profile.resumePath === 'build' && !profile.sourceResumeId) {
        const result = await api('save_starter_resume', { answers: draft.answers });
        profile = { ...profile, sourceResumeId: result.resume.id };
        setDraft(previous => ({ ...previous, profile: { ...previous.profile, sourceResumeId: result.resume.id } }));
      }
      if (!profile.sourceResumeId) { setDraft(previous => ({ ...previous, screen: 'upload' })); throw new Error('Select your resume again to save it privately, then finish your setup.'); }
      const saved = await saveProfile({ ...profile, step: 'complete' });
      persistSession.current = false; setDraft(previous => ({ ...previous, profile: saved.data })); clearOnboardingSession();
      if (scheduleIssue.current) { setSavedWithWarning(true); setError(`Your profile is saved, but scheduled searches could not start yet. ${scheduleIssue.current} You can check their status in Discover.`); return; }
      router.push('/dashboard'); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not finish your setup.'); }
    finally { setBusy(false); }
  }
  const name = draft.profile.displayName.trim();
  const stepIndex = draft.screen === 'upload' || draft.screen === 'build' ? 1 : progressScreens.indexOf(draft.screen);
  const backButton = (screen: OnboardingScreen) => <button type="button" className="ob-back" disabled={busy} onClick={() => back(screen)}><ArrowLeft size={14} />Back</button>;
  const title = (kicker: string, text: string, description: string) => <><p className="ob-kicker">{kicker}</p><h1 ref={heading} tabIndex={-1} className="ob-heading">{text}</h1><p className="ob-description">{description}</p></>;
  const signInLink = <a href="/auth/login?returnTo=%2Fonboarding" onClick={signIn} className="ob-primary">Sign in to save<ArrowUpRight size={16} /></a>;

  return <div className="ob-root">
    <header className="ob-header"><Link href="/" className="ob-brand">vibecheck<span>.</span></Link><div className="ob-header-actions"><Link href="/dashboard?preview=1">Explore a sample</Link>{account.authenticated ? <Link href="/dashboard">My portal<ArrowUpRight size={12} /></Link> : account.capabilities.auth ? <a href="/auth/login?returnTo=%2Fonboarding" onClick={signIn}>Sign in</a> : <span>{checking ? 'Checking your workspace…' : 'Session preview'}</span>}</div></header>
    <main className={`ob-main ${draft.screen === 'build' ? 'ob-wide' : ''}`}>
      <section key={draft.screen} className="ob-step" aria-label="Set up your job portal">
        {draft.screen === 'name' && <>{title('A NEW BEGINNING', 'What’s your name?', 'Let’s make a little space for your next chapter. We’ll start with you.')}<form className="ob-name-form" onSubmit={event => { event.preventDefault(); if (!name) { setError('Enter your name to continue.'); return; } void move('choose', { profile: { ...draft.profile, displayName: name }, answers: draft.answers.fullName ? draft.answers : createStarterResumeAnswers(name) }); }}><label htmlFor="onboarding-name" className="ob-name-label">Your name</label><input id="onboarding-name" name="name" autoComplete="given-name" autoFocus required maxLength={120} className="ob-name-input" placeholder="e.g. Alex" value={draft.profile.displayName} onChange={event => updateProfile({ displayName: event.target.value })} /><div className="ob-actions"><span className="ob-key-hint">You can press <kbd>Enter ↵</kbd></span><button className="ob-primary" disabled={busy || !name}>{busy ? 'Saving…' : 'Continue'}<ArrowRight size={16} /></button></div></form><p className="ob-hint">Your name will make this space yours. You can change it later.</p></>}
        {draft.screen === 'choose' && <>{title('NICE TO MEET YOU', `Let’s get started, ${name}.`, 'A little about your experience will help us make your job search more personal. Where would you like to begin?')}<div className="ob-choices"><button className="ob-choice" disabled={busy} onClick={() => void move('upload', { profile: { ...draft.profile, resumePath: 'upload', sourceResumeId: draft.profile.resumePath === 'upload' ? draft.profile.sourceResumeId : null } })}><span className="ob-choice-icon"><Upload size={21} strokeWidth={1.5} /></span><strong>Upload my resume</strong><p>You’ve already put your story on paper. Bring it along.</p><span className="ob-choice-link">Choose a file<ArrowRight size={13} /></span></button><button className="ob-choice" disabled={busy} onClick={() => void move('build', { profile: { ...draft.profile, resumePath: 'build', sourceResumeId: draft.profile.resumePath === 'build' ? draft.profile.sourceResumeId : null } })}><span className="ob-choice-icon"><MessageCircle size={21} strokeWidth={1.5} /></span><strong>Answer a few questions</strong><p>We’ll help you turn your experience into your first resume.</p><span className="ob-choice-link">Build it together<ArrowRight size={13} /></span></button></div><div className="ob-actions">{backButton('name')}<span className="ob-hint">Both paths lead to the same place.</span></div></>}
        {draft.screen === 'upload' && <>{title('YOUR EXPERIENCE', 'Bring your story along.', 'Choose your current resume. We’ll keep it in your private library once you’re signed in.')}<label className="ob-upload"><Upload size={28} strokeWidth={1.3} /><strong>{file ? 'Choose a different resume' : 'Drop your resume here, or browse'}</strong><span>Text-based PDF or TXT · Up to 8 MB</span><input aria-label="Resume file" type="file" accept=".pdf,.txt,application/pdf,text/plain" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; if (!selected) return; if (selected.size > 8 * 1024 * 1024) { setError('Choose a resume up to 8 MB.'); return; } if (!/\.(pdf|txt)$/i.test(selected.name)) { setError('Choose a text-based PDF or TXT resume.'); return; } setError(''); setFile(selected); setDraft(previous => ({ ...previous, selectedFile: { name: selected.name, size: selected.size }, profile: { ...previous.profile, sourceResumeId: null } })); }} /></label>{(draft.selectedFile || draft.profile.sourceResumeId) && <div className="ob-file" style={{ marginTop: 15 }}><FileText size={20} /><div><strong>{draft.selectedFile?.name || 'Your saved resume'}</strong><small>{draft.profile.sourceResumeId ? 'Saved to your private library' : file ? 'Selected in this tab · Not uploaded yet' : 'Please select this file again after reloading'}</small></div>{file && <button aria-label="Remove selected file" onClick={() => { setFile(null); setDraft(previous => ({ ...previous, selectedFile: null })); }}><X size={14} /></button>}</div>}{!account.authenticated && <p className="ob-notice"><strong>Your file stays on this device for now.</strong> You can continue through the preview. Sign in to upload it privately; after sign-in, we’ll ask you to select it again.</p>}<div className="ob-actions">{backButton('choose')}<button className="ob-primary" disabled={busy || (!file && !draft.profile.sourceResumeId)} onClick={() => void continueUpload()}>{busy ? 'Saving resume…' : account.authenticated ? 'Save & continue' : 'Continue with this file'}<ArrowRight size={16} /></button></div>{!account.authenticated && account.capabilities.auth && <p className="ob-hint"><a href="/auth/login?returnTo=%2Fonboarding" onClick={signIn}>Sign in now to save your resume ↗</a></p>}</>}
        {draft.screen === 'build' && <StarterResumeBuilder currentStep={draft.builderStep} onStepChange={builderStep=>setDraft(previous=>({...previous,builderStep}))} value={draft.answers} onChange={answers => { edited.current = true; setDraft(previous => ({ ...previous, answers, builtResume: false, profile: { ...previous.profile, sourceResumeId: null } })); }} onComplete={async built => { writeSessionSourceResume({ schemaVersion: 1, filename: built.filename, mimeType: 'text/plain', origin: 'builder', text: built.sourceText, generatedResume: built.generatedResume, updatedAt: new Date().toISOString() }); await move('preferences', { answers: built.answers, builtResume: true }); }} onBack={() => back('choose')} completionBusy={busy} />}
        {draft.screen === 'preferences' && <>{title('WHAT COMES NEXT', 'What are you looking for?', 'Tell us about the kind of work you’d love to do. These preferences will guide the opportunities in your portal.')}<form className="ob-form" onSubmit={event => { event.preventDefault(); if (!draft.profile.preferences.roles.trim()) { setError('Describe the roles you’d like to find.'); return; } void move('cadence'); }}><label className="ob-field">Roles you’re interested in<textarea name="roles" required maxLength={2000} rows={3} placeholder="e.g. Product design roles on a small team, where I can help make complex things feel simple." value={draft.profile.preferences.roles} onChange={event => updatePreferences({ roles: event.target.value })} /><span className="ob-field-hint">A few titles, a short description, or both.</span></label><label className="ob-field">Where would you like to work?<input name="locations" maxLength={1000} placeholder="e.g. Toronto, Canada, or anywhere remote" value={draft.profile.preferences.locations} onChange={event => updatePreferences({ locations: event.target.value })} /></label><fieldset><legend className="ob-name-label">How do you like to work?</legend><div className="ob-workmodes">{(['remote','hybrid','onsite'] as const).map(mode => <label key={mode}><input type="checkbox" checked={draft.profile.preferences.workModes.includes(mode)} onChange={event => updatePreferences({ workModes: event.target.checked ? [...draft.profile.preferences.workModes, mode] : draft.profile.preferences.workModes.filter(value => value !== mode) })} />{mode === 'onsite' ? 'On-site' : mode[0].toUpperCase() + mode.slice(1)}</label>)}</div></fieldset><fieldset><legend className="ob-name-label">Employment type</legend><div className="ob-workmodes">{(['full-time','part-time','contract','internship'] as const).map(type => <label key={type}><input type="checkbox" checked={draft.profile.preferences.employmentTypes.includes(type)} onChange={event => updatePreferences({ employmentTypes: event.target.checked ? [...draft.profile.preferences.employmentTypes, type] : draft.profile.preferences.employmentTypes.filter(value => value !== type) })} />{type[0].toUpperCase() + type.slice(1)}</label>)}</div></fieldset><label className="ob-field">Anything else that matters? <span className="ob-field-hint">Optional</span><textarea rows={2} maxLength={3000} placeholder="Industries, values, compensation, or things you’d like to avoid." value={draft.profile.preferences.additionalContext} onChange={event => updatePreferences({ additionalContext: event.target.value })} /></label><div className="ob-actions">{backButton(draft.profile.resumePath === 'build' ? 'build' : 'upload')}<button className="ob-primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}<ArrowRight size={16} /></button></div></form></>}
        {draft.screen === 'cadence' && <>{title('AT YOUR PACE', 'How often should we look?', 'Choose a rhythm for finding new roles that match your preferences. New opportunities will appear in Discover.')}<form onSubmit={(event: FormEvent) => { event.preventDefault(); if (draft.profile.cadence !== 'manual' && !draft.profile.discoveryConsent) { setError('Opt in to scheduled searches, or choose “When I ask.”'); return; } void move('finish'); }}><div className="ob-radio-list">{([{ value: 'daily', label: 'Every day', text: 'A regular look at what’s new, without missing a possibility.' }, { value: 'weekly', label: 'Once a week', text: 'A little room to focus, with fresh opportunities each week.' }, { value: 'manual', label: 'When I ask', text: 'I’ll choose when to search. No automatic checks.' }] as const).map(option => <label className="ob-radio" key={option.value}><input type="radio" name="cadence" value={option.value} checked={draft.profile.cadence === option.value} onChange={() => updateProfile({ cadence: option.value, discoveryConsent: option.value === 'manual' ? false : draft.profile.discoveryConsent })} /><span><strong>{option.label}</strong><p>{option.text}</p></span></label>)}</div>{draft.profile.cadence !== 'manual' && <label className="ob-check"><input type="checkbox" checked={draft.profile.discoveryConsent} onChange={event => updateProfile({ discoveryConsent: event.target.checked })} />I’d like VibeCheck to use my role preferences for scheduled job searches. I can turn this off from Discover at any time.</label>}<p className="ob-hint">Scheduled searches start only after you save your account setup and discovery is configured. The session preview never runs background searches.</p><div className="ob-actions">{backButton('preferences')}<button className="ob-primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}<ArrowRight size={16} /></button></div></form></>}
        {draft.screen === 'finish' && <><span className="ob-success-mark"><Check size={24} strokeWidth={1.5} /></span>{title('YOUR NEXT CHAPTER', `${name}’s job portal.`, 'Your experience, your possibilities, your next step. There’s a space for all of it here.')}<dl className="ob-review"><div><dt>Your resume</dt><dd>{draft.profile.sourceResumeId ? 'Saved to your private library' : draft.profile.resumePath === 'build' ? 'Built from your answers · Ready to save' : draft.selectedFile?.name || 'Ready to upload'}</dd></div><div><dt>Looking for</dt><dd>{draft.profile.preferences.roles}</dd></div><div><dt>Where</dt><dd>{draft.profile.preferences.locations || 'Open to possibilities'}</dd></div><div><dt>Your rhythm</dt><dd>{draft.profile.cadence === 'manual' ? 'Search when you ask' : draft.profile.cadence === 'daily' ? 'Daily job searches' : 'Weekly job searches'}</dd></div></dl>{!account.authenticated && <p className="ob-notice"><strong>{account.capabilities.auth ? 'Save your space with a private account.' : 'Your session preview is ready.'}</strong> {account.capabilities.auth ? 'Your name and answers will be waiting after sign-in.' : 'Your name and preferences stay in this browser tab. Sample applications are read-only, and scheduled searches are not running.'}</p>}<div className="ob-actions">{backButton('cadence')}{account.authenticated ? <button className="ob-primary" disabled={busy} onClick={() => void finish(false)}>{busy ? 'Preparing your portal…' : 'Open my job portal'}<ArrowRight size={16} /></button> : account.capabilities.auth ? signInLink : <button className="ob-primary" onClick={() => void finish(true)}>Open my session preview<ArrowRight size={16} /></button>}</div>{!account.authenticated && account.capabilities.auth && <button className="ob-skip" onClick={() => void finish(true)}>Explore my session preview first</button>}</>}
      </section>
      {error && <p className="ob-error" role="alert" style={{ marginTop: 20 }}>{error}</p>}
      {savedWithWarning && <Link href="/dashboard" className="ob-primary" style={{ marginTop: 16 }}>Continue to my saved portal<ArrowRight size={16} /></Link>}
      {storageWarning && <p className="ob-hint" role="status">Your browser could not keep this draft. Leave this page open until you finish.</p>}
    </main>
    <footer className="ob-footer"><div className="ob-progress" aria-label={`Setup step ${stepIndex + 1} of ${progressScreens.length}`}>{progressScreens.map((step, index) => <span key={step} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''} />)}</div><span className="ob-session-label"><LockKeyhole size={11} />{account.authenticated ? savingDraft ? 'Saving draft…' : error ? 'Your draft needs attention' : 'Your private workspace · Autosave enabled' : 'Kept in this browser session until you sign in'}</span><span>A thoughtful start.</span></footer>
  </div>;
}
