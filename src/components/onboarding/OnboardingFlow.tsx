'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ClipboardPaste,
  Compass,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageCircle,
  Upload,
  X,
} from 'lucide-react';
import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import { createInitialResumeGenerationAnswers } from '@/app/lib/resumeGeneratorQuestions';
import { extractResumeBuilderProfileFromText } from '@/app/lib/resumeBuilderProfile';
import {
  formatOriginalBadge,
  inferResumeMimeType,
  isBinaryResumeMimeType,
  parseClientResumeTextByFormat,
  parseTextResume,
  RESUME_FILE_ACCEPT,
  RESUME_FORMAT_SUMMARY,
  toResumeBuilderProfile,
  validateUpload,
  type ParsedResumeDocument,
} from '@/lib/resume-parser';
import { normalizeRoleTitle } from '@/lib/resume-parser/roleInference';
import type { Capabilities, ConnectionData } from '@/lib/tracker/types';
import type { OnboardingDraftData, OnboardingProfileData, SavedOnboardingDraft, SavedOnboardingProfile } from '@/lib/onboarding/types';
import {
  clearOnboardingSession,
  clearSessionSourceResume,
  clearWizardResult,
  createOnboardingSession,
  profileScreen,
  readOnboardingSession,
  readSessionSourceResume,
  readWizardResult,
  sessionForOwner,
  writeOnboardingSession,
  writeSessionSourceResume,
  writeWizardResult,
  type OnboardingScreen,
  type OnboardingSession,
  type SessionSourceResume,
  type WizardResumeResult,
} from '@/lib/onboarding/session';
import { createStarterResumeAnswers, starterResumeAnswersSchema } from '@/lib/onboarding/starter-resume';
import AnalysisResult from '@/components/AnalysisResult';
import ResumeGenerator from '@/components/ResumeGenerator';
import ResumePreview from '@/components/ResumePreview';
import StarterResumeBuilder from './StarterResumeBuilder';

interface OnboardingState {
  authenticated: boolean;
  userId: string | null;
  draft: SavedOnboardingDraft | null;
  profile: SavedOnboardingProfile | null;
  capabilities: Capabilities;
  connection: ConnectionData | null;
}

const unavailable: Capabilities = {
  auth: false,
  auth0: false,
  database: false,
  storage: false,
  deepseek: false,
  openai: false,
};

function serverStep(screen: OnboardingScreen): OnboardingProfileData['step'] {
  if (screen === 'choose' || screen === 'upload' || screen === 'target' || screen === 'report' || screen === 'builder') return 'resume';
  if (screen === 'result' || screen === 'cadence' || screen === 'finish') return 'connect';
  return screen;
}

function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}

function generatedResumeToPlainText(resume: GeneratedResume): string {
  const { preview } = resume;
  return [
    preview.fullName,
    preview.headline || '',
    preview.contact.join(' | '),
    preview.summary ? `\nSUMMARY\n${preview.summary}` : '',
    ...preview.sections.flatMap((section) => [
      `\n${section.title.toUpperCase()}`,
      ...section.items.flatMap((item) => [
        [item.heading, item.subheading, item.date].filter(Boolean).join(' | '),
        ...(item.meta ? [item.meta] : []),
        ...item.details.map((detail) => `- ${detail}`),
      ]),
    ]),
    ...preview.skillGroups.map((group) => `\n${group.label}: ${group.skills.join(', ')}`),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export default function OnboardingFlow() {
  const router = useRouter();
  const [draft, setDraft] = useState<OnboardingSession>(createOnboardingSession);
  const [account, setAccount] = useState<OnboardingState>({
    authenticated: false,
    userId: null,
    draft: null,
    profile: null,
    capabilities: unavailable,
    connection: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(true);
  const [accountLoadFailed, setAccountLoadFailed] = useState(false);
  const [accountCheckAttempt, setAccountCheckAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [sessionSource, setSessionSource] = useState<SessionSourceResume | null>(null);
  const [wizardResult, setWizardResult] = useState<WizardResumeResult | null>(null);
  const [savedWithWarning, setSavedWithWarning] = useState(false);
  const [editMode, setEditMode] = useState<'preferences' | 'name' | 'resume' | null>(null);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [portalRoles, setPortalRoles] = useState('');
  const [portalLocation, setPortalLocation] = useState('');
  const [portalCompany, setPortalCompany] = useState('');
  const [portalRoleTitle, setPortalRoleTitle] = useState('');

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
  const routerRef = useRef(router);
  routerRef.current = router;
  current.current = draft;

  useEffect(() => {
    const session = readOnboardingSession();
    const storedSource = readSessionSourceResume();
    const storedResult = readWizardResult();
    if (storedSource) setSessionSource(storedSource);
    if (storedResult) {
      setWizardResult(storedResult);
      const safeHeadlineRole = storedResult.analysis?.resumeBuilderProfile?.headline
        ? normalizeRoleTitle(storedResult.analysis.resumeBuilderProfile.headline)
        : '';
      const safeTargetRole = storedResult.targetRole ? normalizeRoleTitle(storedResult.targetRole) || storedResult.targetRole : '';
      setPortalRoles((prev) => prev || safeTargetRole || safeHeadlineRole);
      setPortalCompany((prev) => prev || storedResult.company);
      setPortalRoleTitle((prev) => prev || safeTargetRole);
    }
    if (session && !session.ownerId) {
      setDraft(session);
      if (session.answers.email) setAuthEmail((prev) => prev || session.answers.email);
      if (session.profile.preferences.roles) setPortalRoles((prev) => prev || session.profile.preferences.roles);
      if (session.profile.preferences.locations) setPortalLocation((prev) => prev || session.profile.preferences.locations);
      if (session.wizardTarget.role) {
        setPortalRoles((prev) => prev || session.wizardTarget.role);
        setPortalRoleTitle((prev) => prev || session.wizardTarget.role);
      }
      if (session.wizardTarget.company) setPortalCompany((prev) => prev || session.wizardTarget.company);
    }

    const query = new URLSearchParams(window.location.search);
    const edit = query.get('edit');
    const editResume = query.get('editResume');
    const requestedEdit = edit === 'preferences' ? 'preferences' : edit === 'name' ? 'name' : edit === 'resume' ? 'resume' : null;
    if (requestedEdit) setEditMode(requestedEdit);
    const requestedScreen = requestedEdit === 'resume' ? 'choose' : requestedEdit;
    if (requestedScreen && session?.profile.displayName) {
      setDraft((previous) => ({ ...previous, screen: requestedScreen }));
    }
    setLoaded(true);

    const keyboard = () => {
      document.documentElement.dataset.vcInput = 'keyboard';
    };
    const pointer = () => {
      document.documentElement.dataset.vcInput = 'pointer';
    };
    window.addEventListener('keydown', keyboard);
    window.addEventListener('pointerdown', pointer);

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);

    void fetch('/api/onboarding', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Your saved setup could not be reached. Your draft is still available in this browser.');
        const state = (await response.json()) as OnboardingState;
        setAccount(state);
        profileRecord.current = state.profile;
        draftRecord.current = state.draft;
        accountOwner.current = state.userId;

        const ownedSession = sessionForOwner(session, state.userId);
        if (session?.ownerId && !ownedSession) clearOnboardingSession();

        if (state.authenticated && state.userId && !edited.current) {
          const savedDraft = state.draft?.data;
          const restore =
            session?.pendingSignIn && ownedSession
              ? ownedSession
              : savedDraft
                ? { ...createOnboardingSession(), ...savedDraft, ownerId: state.userId }
                : ownedSession;
          if (restore) {
            const nextScreen =
              state.profile?.data.step === 'complete' && !requestedScreen && !editResume && !storedResult
                ? 'name'
                : restore.screen === 'connect'
                  ? 'cadence'
                  : restore.screen;
            setDraft({ ...restore, screen: nextScreen, ownerId: state.userId, pendingSignIn: false, preview: false });
          } else {
            setDraft((previous) => ({
              ...createOnboardingSession(),
              ownerId: state.userId,
              profile: state.profile?.data || previous.profile,
            }));
          }
          if (savedDraft) lastSavedDraft.current = JSON.stringify(savedDraft);
        }

        if (state.authenticated && state.profile && !edited.current && ((!state.draft && !session?.pendingSignIn) || requestedScreen || editResume)) {
          setDraft((previous) => ({
            ...previous,
            profile: state.profile!.data,
            screen: requestedScreen || (state.profile!.data.step === 'complete' ? 'name' : profileScreen(state.profile!.data)),
            preview: false,
          }));
          if (state.profile.data.preferences.roles) setPortalRoles((prev) => prev || state.profile!.data.preferences.roles);
          if (state.profile.data.preferences.locations) setPortalLocation((prev) => prev || state.profile!.data.preferences.locations);
        }

        if (state.authenticated && state.userId && edited.current) {
          setDraft((previous) => ({ ...previous, ownerId: state.userId, pendingSignIn: false }));
        }

        if (editResume) {
          if (!state.authenticated) throw new Error('Sign in to open the saved resume you want to edit.');
          if (!/^[a-f0-9-]{36}$/i.test(editResume)) throw new Error('This saved resume link is not valid.');
          const resumeResponse = await fetch(`/api/resumes/${encodeURIComponent(editResume)}?kind=source_resume`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          const record = await resumeResponse.json();
          if (!resumeResponse.ok) throw new Error(record.error || 'This resume could not be opened.');
          const answers = starterResumeAnswersSchema.safeParse(record.data?.starterAnswers);
          if (!answers.success) throw new Error('This resume has no saved builder answers. Choose Answer a few questions to create a new one.');
          setDraft((previous) => ({
            ...previous,
            answers: answers.data,
            builtResume: false,
            screen: 'build',
            profile: { ...previous.profile, resumePath: 'build', sourceResumeId: null },
          }));
        }
      })
      .catch((cause) => {
        if (timedOut || !controller.signal.aborted) {
          setAccountLoadFailed(true);
          setError(timedOut
            ? 'Your saved setup is taking too long to load. Retry the account connection to continue; your resume is still here.'
            : cause instanceof Error ? cause.message : 'Could not load your saved setup.');
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setChecking(false);
      });

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('pointerdown', pointer);
    };
  }, [accountCheckAttempt]);

  function retryAccountConnection() {
    setChecking(true);
    setAccountLoadFailed(false);
    setError('');
    setAccountCheckAttempt((attempt) => attempt + 1);
  }

  useEffect(() => {
    if (loaded && persistSession.current) setStorageWarning(!writeOnboardingSession(draft));
  }, [draft, loaded]);

  useEffect(() => {
    if (loaded && draft.screen !== 'name' && draft.screen !== 'build') heading.current?.focus({ preventScroll: true });
  }, [draft.screen, loaded]);

  useEffect(() => {
    if (!loaded || checking || !account.authenticated || !account.userId || !persistSession.current || draftConflict.current || busy) return;
    const input: OnboardingDraftData = {
      profile: draft.profile,
      screen: draft.screen,
      answers: draft.answers,
      builtResume: draft.builtResume,
      builderStep: draft.builderStep,
    };
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
          draftRecord.current = result.draft;
          lastSavedDraft.current = fingerprint;
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Your draft could not be saved.');
        } finally {
          setSavingDraft(false);
        }
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [draft, loaded, checking, account.authenticated, account.userId, busy]);

  function updateProfile(patch: Partial<OnboardingProfileData>) {
    edited.current = true;
    setDraft((previous) => ({ ...previous, profile: { ...previous.profile, ...patch } }));
  }

  function updatePreferences(patch: Partial<OnboardingProfileData['preferences']>) {
    updateProfile({ preferences: { ...draft.profile.preferences, ...patch } });
  }

  function updateWizardTarget(patch: Partial<OnboardingSession['wizardTarget']>) {
    edited.current = true;
    setDraft((previous) => ({ ...previous, wizardTarget: { ...previous.wizardTarget, ...patch } }));
  }

  async function api(action: 'save_profile' | 'save_starter_resume' | 'save_draft', input: unknown, expectedVersion?: number) {
    const fingerprint = JSON.stringify({ action, input, expectedVersion });
    const idempotencyKey = attempts.current.get(fingerprint) || crypto.randomUUID();
    attempts.current.set(fingerprint, idempotencyKey);
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, input, ...(expectedVersion ? { expectedVersion } : {}), idempotencyKey }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409 && action === 'save_draft') {
        draftConflict.current = true;
        throw new Error('Your draft changed in another window. Your edits remain here; reload to restore the latest saved draft.');
      }
      if (response.status === 409) {
        const latestResponse = await fetch('/api/onboarding', { cache: 'no-store' });
        if (latestResponse.ok) {
          const latest = (await latestResponse.json()) as OnboardingState;
          setAccount(latest);
          profileRecord.current = latest.profile;
          if (latest.profile) setDraft((previous) => ({ ...previous, profile: latest.profile!.data }));
        }
        throw new Error('Your profile changed in another window. The latest preferences are loaded; review them and try again.');
      }
      throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Your setup could not be saved. Please try again.');
    }
    attempts.current.delete(fingerprint);
    return result;
  }

  async function saveProfile(profile: OnboardingProfileData) {
    const { completedAt: _completedAt, ...input } = profile;
    const result = await api('save_profile', input, profileRecord.current?.version);
    scheduleIssue.current = result.scheduleError
      ? String(result.scheduleError)
      : result.schedule?.data?.status === 'failed'
        ? String(result.schedule.data.error || 'Scheduled searches are delayed.')
        : '';
    profileRecord.current = result.profile;
    setAccount((previous) => ({ ...previous, profile: result.profile }));
    return result.profile as SavedOnboardingProfile;
  }

  async function move(screen: OnboardingScreen, patch: Partial<OnboardingSession> = {}) {
    if (busy || draftConflict.current) return;
    setError('');
    edited.current = true;
    const next: OnboardingSession = {
      ...draft,
      ...patch,
      screen,
      profile: { ...draft.profile, ...patch.profile, step: serverStep(screen) },
    };
    if (account.authenticated) {
      setBusy(true);
      setBusyLabel('Saving...');
      try {
        await draftQueue.current;
        const saved = await saveProfile(next.profile);
        next.profile = saved.data;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save your progress.');
        return;
      } finally {
        setBusy(false);
        setBusyLabel('');
      }
    }
    setDraft(next);
    if ((screen === 'result' || screen === 'finish') && !authEmail && next.answers.email) {
      setAuthEmail(next.answers.email);
    }
  }

  function back(screen: OnboardingScreen) {
    setError('');
    setDraft((previous) => ({ ...previous, screen }));
  }

  function signIn() {
    writeOnboardingSession({ ...current.current, pendingSignIn: true });
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

  async function uploadFile(selectedFile?: File | null, useSignedStorage = account.capabilities.storage) {
    const targetFile = selectedFile ?? file;
    if (!targetFile) throw new Error('Select your resume again. Files stay in memory and are not kept after a reload.');
    const bytes = await targetFile.arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const fingerprint = `upload:${targetFile.name}:${sha256}`;
    const idempotencyKey = attempts.current.get(fingerprint) || crypto.randomUUID();
    attempts.current.set(fingerprint, idempotencyKey);

    if (!useSignedStorage) {
      const form = new FormData();
      form.append('resume', targetFile);
      form.append('idempotencyKey', idempotencyKey);
      const response = await fetch('/api/resumes', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok || !result.id) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Your resume could not be saved.');
      }
      attempts.current.delete(fingerprint);
      return String(result.id);
    }

    const input = {
      filename: targetFile.name,
      mimeType: inferResumeMimeType(targetFile.name, targetFile.type),
      size: targetFile.size,
      sha256,
      idempotencyKey,
    };
    const uploadRequest = async (action: 'prepare' | 'complete') => {
      const response = await fetch('/api/resumes/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, input }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your resume could not be saved.');
      return result;
    };
    const prepared = await uploadRequest('prepare');
    let result = prepared;
    if (!prepared.complete) {
      const transfer = await fetch(prepared.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': input.mimeType, 'x-upsert': 'false', 'Cache-Control': 'max-age=0' },
        body: bytes,
      });
      if (!transfer.ok) {
        const failure = await transfer.json().catch(() => ({}));
        if (!/already exists|duplicate/i.test(failure.message || failure.error || '')) {
          throw new Error('The file transfer failed. Please try again with the same file.');
        }
      }
      result = await uploadRequest('complete');
    }
    const sourceId = result.resume?.id || result.record?.id || result.id;
    if (!sourceId) throw new Error('The upload finished without a saved resume ID. Please retry.');
    attempts.current.delete(fingerprint);
    return sourceId as string;
  }

  async function resolveReadableSourceText(): Promise<SessionSourceResume | null> {
    if (sessionSource?.text && sessionSource.text.trim().length >= 25) return sessionSource;
    const stored = readSessionSourceResume();
    if (stored?.text && stored.text.trim().length >= 25) {
      setSessionSource(stored);
      return stored;
    }
    if (stored?.pendingPdfBase64) {
      const pdfFile = base64ToFile(stored.pendingPdfBase64, stored.filename, stored.mimeType || 'application/pdf');
      const form = new FormData();
      form.append('file', pdfFile);
      const res = await fetch('/api/resumes/session', { method: 'POST', body: form });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && String(payload.text || '').trim().length >= 25) {
        const next: SessionSourceResume = {
          ...stored,
          mimeType: inferResumeMimeType(stored.filename, payload.mimeType || stored.mimeType),
          text: String(payload.text).replace(/\0/g, '').trim(),
          ...(payload.parsedResume ? { parsedResume: payload.parsedResume as ParsedResumeDocument } : {}),
          ...(payload.suggestedRoles ? { suggestedRoles: payload.suggestedRoles } : {}),
          updatedAt: new Date().toISOString(),
        };
        writeSessionSourceResume(next);
        setSessionSource(next);
        return next;
      }
    }
    if (account.authenticated && draft.profile.sourceResumeId) {
      const res = await fetch(`/api/resumes/${encodeURIComponent(draft.profile.sourceResumeId)}?kind=source_resume`, { cache: 'no-store' });
      const record = await res.json().catch(() => ({}));
      if (res.ok && record.data?.text) {
        const filename = String(record.data.filename || 'saved-resume.txt');
        const next: SessionSourceResume = {
          schemaVersion: 1,
          filename,
          mimeType: inferResumeMimeType(filename, String(record.data.mimeType || '')),
          origin: record.data.origin === 'builder' ? 'builder' : 'upload',
          text: String(record.data.text),
          ...(record.data.parsedResume ? { parsedResume: record.data.parsedResume as ParsedResumeDocument } : {}),
          updatedAt: String(record.updatedAt || new Date().toISOString()),
        };
        writeSessionSourceResume(next);
        setSessionSource(next);
        return next;
      }
    }
    if (wizardResult?.generatedResume) {
      const fallbackText = generatedResumeToPlainText(wizardResult.generatedResume);
      if (fallbackText.length >= 25) {
        const next: SessionSourceResume = {
          schemaVersion: 1,
          filename: 'resume.txt',
          mimeType: 'text/plain',
          origin: draft.profile.resumePath === 'build' ? 'builder' : 'upload',
          text: fallbackText,
          generatedResume: wizardResult.generatedResume,
          updatedAt: new Date().toISOString(),
        };
        writeSessionSourceResume(next);
        setSessionSource(next);
        return next;
      }
    }
    return null;
  }

  function applyExtractedProfileHints(sourceText: string, parsedDoc?: ParsedResumeDocument) {
    if (!parsedDoc && (!sourceText || sourceText.trim().length < 25)) return undefined;
    const doc = parsedDoc ?? parseTextResume(sourceText);
    const extracted = toResumeBuilderProfile(doc) ?? extractResumeBuilderProfileFromText(sourceText);
    if (extracted?.email) setAuthEmail((prev) => prev || extracted.email!);
    if (extracted?.location) setPortalLocation((prev) => prev || extracted.location!);
    const suggested = doc.suggestedRoles.confidence >= 0.65 ? doc.suggestedRoles.formatted : '';
    if (suggested) setPortalRoles((prev) => prev || suggested);
    return { extracted, suggestedRoles: doc.suggestedRoles };
  }

  async function continueUpload(destination: 'keep' | 'tailor') {
    const trimmedPaste = pastedText.replace(/\0/g, '').trim();
    const hasPaste = showPaste && trimmedPaste.length >= 25;
    if (!file && !hasPaste && !sessionSource?.text && !draft.profile.sourceResumeId) {
      setError(
        showPaste
          ? 'Paste at least 25 characters of resume text, or choose a supported resume file.'
          : `Upload a ${RESUME_FORMAT_SUMMARY} resume, or paste your resume text to continue.`,
      );
      return;
    }

    setBusy(true);
    setBusyLabel('Reading your resume...');
    setError('');
    try {
      let currentSource = sessionSource;
      let nextSelectedFile = draft.selectedFile;
      let clearedSourceResumeId = false;

      if (file) {
        const resolvedMime = inferResumeMimeType(file.name, file.type);
        if (isBinaryResumeMimeType(resolvedMime)) {
          const form = new FormData();
          form.append('file', file);
          const res = await fetch('/api/resumes/session', { method: 'POST', body: form });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not extract text from that resume file.');
          }
          const extracted = String(payload.text || '').replace(/\0/g, '').trim();
          if (extracted.length < 25) {
            throw new Error('The resume has too little readable text. Use a text-based PDF, DOCX, or text resume.');
          }
          const pendingPdfBase64 = file.size <= 2_500_000 ? await fileToBase64(file).catch(() => '') : '';
          currentSource = {
            schemaVersion: 1,
            filename: String(payload.filename || file.name),
            mimeType: inferResumeMimeType(String(payload.filename || file.name), payload.mimeType || resolvedMime),
            origin: 'upload',
            text: extracted,
            ...(pendingPdfBase64 ? { pendingPdfBase64 } : {}),
            ...(payload.parsedResume ? { parsedResume: payload.parsedResume as ParsedResumeDocument } : {}),
            ...(payload.suggestedRoles ? { suggestedRoles: payload.suggestedRoles } : {}),
            updatedAt: new Date().toISOString(),
          };
        } else {
          const rawText = (await file.text().catch(() => '')).replace(/\0/g, '').trim();
          const parsedDoc = parseClientResumeTextByFormat(rawText, resolvedMime);
          const canonical = parsedDoc.canonicalText.trim();
          if (canonical.length < 25) {
            throw new Error('The resume has too little readable text. Use at least 25 characters.');
          }
          currentSource = {
            schemaVersion: 1,
            filename: file.name,
            mimeType: resolvedMime,
            origin: 'upload',
            text: canonical,
            ...(rawText !== canonical && rawText.length <= 500_000 ? { rawText } : {}),
            parsedResume: parsedDoc,
            suggestedRoles: parsedDoc.suggestedRoles,
            updatedAt: new Date().toISOString(),
          };
        }
        writeSessionSourceResume(currentSource);
        setSessionSource(currentSource);
        nextSelectedFile = { name: currentSource.filename, size: file.size };
      } else if (hasPaste) {
        const parsedDoc = parseTextResume(trimmedPaste);
        currentSource = {
          schemaVersion: 1,
          filename: 'pasted-resume.txt',
          mimeType: 'text/plain',
          origin: 'upload',
          text: trimmedPaste,
          parsedResume: parsedDoc,
          suggestedRoles: parsedDoc.suggestedRoles,
          updatedAt: new Date().toISOString(),
        };
        writeSessionSourceResume(currentSource);
        setSessionSource(currentSource);
        nextSelectedFile = { name: 'pasted-resume.txt', size: trimmedPaste.length };
        clearedSourceResumeId = true;
        setDraft((previous) => ({
          ...previous,
          selectedFile: nextSelectedFile,
          profile: { ...previous.profile, sourceResumeId: null },
        }));
      }

      const hints = currentSource?.text
        ? applyExtractedProfileHints(currentSource.text, currentSource.parsedResume)
        : undefined;
      const confidentRole =
        hints?.suggestedRoles && hints.suggestedRoles.confidence >= 0.65
          ? hints.suggestedRoles.primaryRole || hints.suggestedRoles.roles[0] || ''
          : '';
      const confidentRolesLine =
        hints?.suggestedRoles && hints.suggestedRoles.confidence >= 0.65
          ? hints.suggestedRoles.formatted
          : '';
      const targetScreen: OnboardingScreen = destination === 'keep' ? 'result' : 'target';

      if (destination === 'keep') {
        const keptResult: WizardResumeResult = {
          schemaVersion: 1,
          mode: 'kept',
          generatedResume: null,
          analysis: null,
          answers: {},
          company: '',
          targetRole: confidentRole,
          jobUrl: '',
          jobDescription: '',
          updatedAt: new Date().toISOString(),
        };
        writeWizardResult(keptResult);
        setWizardResult(keptResult);
      }

      if (account.authenticated && file && !draft.profile.sourceResumeId) {
        const sourceResumeId = await uploadFile(file, account.capabilities.storage);
        const nextProfile: OnboardingProfileData = {
          ...draft.profile,
          sourceResumeId,
          resumePath: 'upload',
          step: serverStep(targetScreen),
        };
        const saved = await saveProfile(nextProfile);
        setDraft((previous) => ({
          ...previous,
          selectedFile: nextSelectedFile,
          profile: saved.data,
          screen: targetScreen,
        }));
      } else {
        setBusy(false);
        setBusyLabel('');
        await move(targetScreen, {
          selectedFile: nextSelectedFile,
          profile: {
            ...draft.profile,
            resumePath: 'upload',
            ...(clearedSourceResumeId ? { sourceResumeId: null } : {}),
            ...(confidentRolesLine && !draft.profile.preferences.roles
              ? {
                  preferences: {
                    ...draft.profile.preferences,
                    roles: confidentRolesLine,
                  },
                }
              : {}),
          },
        });
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read your resume.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function keepCurrentResume() {
    if (busy) return;
    setError('');
    const sourceText = sessionSource?.text || '';
    const hints = applyExtractedProfileHints(sourceText, sessionSource?.parsedResume);
    const confidentFormatted =
      hints?.suggestedRoles && hints.suggestedRoles.confidence >= 0.65
        ? hints.suggestedRoles.formatted
        : '';
    const confidentPrimary =
      hints?.suggestedRoles && hints.suggestedRoles.confidence >= 0.65
        ? hints.suggestedRoles.primaryRole || hints.suggestedRoles.roles[0] || ''
        : '';
    const fallbackRole =
      wizardResult?.targetRole ||
      draft.wizardTarget.role.trim() ||
      confidentFormatted;
    if (fallbackRole) setPortalRoles((prev) => prev || fallbackRole);

    const nextResult: WizardResumeResult = {
      schemaVersion: 1,
      mode: 'kept',
      generatedResume: null,
      analysis: wizardResult?.analysis ?? null,
      analysisMode: wizardResult?.analysisMode,
      answers: wizardResult?.answers ?? {},
      company: wizardResult?.company ?? draft.wizardTarget.company.trim(),
      targetRole: wizardResult?.targetRole || draft.wizardTarget.role.trim() || confidentPrimary,
      jobUrl: wizardResult?.jobUrl ?? draft.wizardTarget.jobUrl.trim(),
      jobDescription: wizardResult?.jobDescription ?? draft.wizardTarget.jobDescription.trim(),
      updatedAt: new Date().toISOString(),
    };
    writeWizardResult(nextResult);
    setWizardResult(nextResult);
    await move('result');
  }

  async function runWizardAnalyze(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const jd = draft.wizardTarget.jobDescription.trim();
    if (jd.length < 25) {
      setError('Paste at least 25 characters of the job description to analyze resume fit.');
      return;
    }

    setBusy(true);
    setBusyLabel('Analyzing resume fit...');
    setError('');
    try {
      const source = await resolveReadableSourceText();
      if (!source?.text || source.text.trim().length < 25) {
        setDraft((previous) => ({ ...previous, screen: 'upload' }));
        throw new Error('Add or upload your resume first before running an analysis.');
      }

      const analyzeRes = await fetch('/api/resumes/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          resumeText: source.text,
          jobDescription: jd,
        }),
      });
      const analyzePayload = await analyzeRes.json().catch(() => ({}));
      if (!analyzeRes.ok || !analyzePayload.analysis) {
        throw new Error(
          typeof analyzePayload.error === 'string'
            ? analyzePayload.error
            : 'Could not score your resume against that job description.',
        );
      }

      const nextAnalysis = analyzePayload.analysis as Analysis;
      const prefilled = createInitialResumeGenerationAnswers(nextAnalysis, jd);
      if (!prefilled.fullName?.trim() && draft.profile.displayName.trim()) {
        prefilled.fullName = draft.profile.displayName.trim();
      }
      if (!prefilled.targetTitle?.trim() && draft.wizardTarget.role.trim()) {
        prefilled.targetTitle = draft.wizardTarget.role.trim();
      }

      const extractedProfile = nextAnalysis.resumeBuilderProfile;
      if (extractedProfile?.email) setAuthEmail((prev) => prev || extractedProfile.email!);
      if (extractedProfile?.location) setPortalLocation((prev) => prev || extractedProfile.location!);
      const resolvedRole = prefilled.targetTitle?.trim() || draft.wizardTarget.role.trim() || extractedProfile?.headline || '';
      if (resolvedRole) {
        setPortalRoles((prev) => prev || resolvedRole);
        setPortalRoleTitle(resolvedRole);
      }
      if (draft.wizardTarget.company.trim()) {
        setPortalCompany(draft.wizardTarget.company.trim());
      }

      const nextResult: WizardResumeResult = {
        schemaVersion: 1,
        mode: 'tailored',
        generatedResume: null,
        analysis: nextAnalysis,
        analysisMode: analyzePayload.mode === 'ai' ? 'ai' : 'deterministic',
        answers: prefilled,
        company: draft.wizardTarget.company.trim(),
        targetRole: resolvedRole,
        jobUrl: draft.wizardTarget.jobUrl.trim(),
        jobDescription: jd,
        updatedAt: new Date().toISOString(),
      };

      writeWizardResult(nextResult);
      setWizardResult(nextResult);
      setBusy(false);
      setBusyLabel('');
      await move('report', {
        profile: {
          ...draft.profile,
          preferences: {
            ...draft.profile.preferences,
            roles: draft.profile.preferences.roles || resolvedRole,
            locations: draft.profile.preferences.locations || portalLocation || extractedProfile?.location || '',
          },
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not analyze your resume.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function runWizardGenerate(submittedAnswers: ResumeGenerationAnswers) {
    if (busy || !wizardResult?.analysis) return;
    setBusy(true);
    setBusyLabel('Generating tailored resume...');
    setError('');
    try {
      const source = await resolveReadableSourceText();
      const genRes = await fetch('/api/resumes/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          resumeText: source?.text,
          analysis: wizardResult.analysis,
          jobDescription: wizardResult.jobDescription,
          answers: submittedAnswers,
        }),
      });
      const genPayload = await genRes.json().catch(() => ({}));
      if (!genRes.ok || !genPayload.generatedResume) {
        throw new Error(
          typeof genPayload.error === 'string' ? genPayload.error : 'Could not build your tailored resume.',
        );
      }

      const resolvedRole = submittedAnswers.targetTitle?.trim() || wizardResult.targetRole;
      if (resolvedRole) {
        setPortalRoleTitle(resolvedRole);
        setPortalRoles((prev) => prev || resolvedRole);
      }

      const nextResult: WizardResumeResult = {
        ...wizardResult,
        mode: 'tailored',
        generatedResume: genPayload.generatedResume as GeneratedResume,
        generateMode: genPayload.mode === 'ai' ? 'ai' : 'deterministic',
        answers: submittedAnswers,
        targetRole: resolvedRole,
        updatedAt: new Date().toISOString(),
      };
      writeWizardResult(nextResult);
      setWizardResult(nextResult);
      setBusy(false);
      setBusyLabel('');
      await move('result');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate your tailored resume.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function completeAuthenticatedSetup(options?: {
    useSignedStorage?: boolean;
    roles?: string;
    locations?: string;
    company?: string;
    roleTitle?: string;
  }) {
    const useSignedStorage = options?.useSignedStorage ?? account.capabilities.storage;
    const resolvedRoles = (options?.roles ?? portalRoles ?? draft.profile.preferences.roles).trim();
    if (!resolvedRoles) {
      throw new Error('Describe the roles you want in your portal before finishing.');
    }
    const resolvedLocations = (options?.locations ?? portalLocation ?? draft.profile.preferences.locations).trim();
    await draftQueue.current;

    let profile: OnboardingProfileData = {
      ...draft.profile,
      resumePath: draft.profile.resumePath || (draft.builtResume ? 'build' : 'upload'),
      preferences: {
        ...draft.profile.preferences,
        roles: resolvedRoles,
        locations: resolvedLocations,
      },
    };

    if (profile.resumePath === 'build' && !profile.sourceResumeId) {
      const result = await api('save_starter_resume', { answers: draft.answers });
      profile = { ...profile, sourceResumeId: result.resume.id };
      setDraft((previous) => ({ ...previous, profile: { ...previous.profile, sourceResumeId: result.resume.id } }));
    } else if (!profile.sourceResumeId) {
      let uploadTarget = file;
      const stored = readSessionSourceResume();
      if (!uploadTarget && stored) {
        if (stored.pendingPdfBase64) {
          uploadTarget = base64ToFile(stored.pendingPdfBase64, stored.filename, stored.mimeType || 'application/pdf');
        } else {
          const fallbackContent = (stored.rawText ?? stored.text).trim();
          if (fallbackContent.length >= 25) {
            const binaryFallback = isBinaryResumeMimeType(stored.mimeType);
            uploadTarget = new File(
              [fallbackContent],
              binaryFallback ? stored.filename.replace(/\.(?:pdf|docx)$/i, '.txt') || 'resume.txt' : stored.filename,
              { type: binaryFallback ? 'text/plain' : stored.mimeType || 'text/plain' },
            );
          }
        }
      }
      if (!uploadTarget) {
        setDraft((previous) => ({ ...previous, screen: 'upload' }));
        throw new Error('Select your resume file again to save it privately, then open your portal.');
      }
      const sourceResumeId = await uploadFile(uploadTarget, useSignedStorage);
      profile = { ...profile, sourceResumeId };
      setDraft((previous) => ({ ...previous, profile: { ...previous.profile, sourceResumeId } }));
    }

    if (wizardResult?.analysis && wizardResult.jobDescription.trim().length >= 25) {
      const storedSource = sessionSource || readSessionSourceResume();
      const generatedForBundle = wizardResult.mode === 'kept' ? null : wizardResult.generatedResume;
      const sourceText = storedSource?.text?.trim() || (generatedForBundle ? generatedResumeToPlainText(generatedForBundle) : '');
      const resolvedCompany = (options?.company ?? portalCompany ?? wizardResult.company).trim() || 'Target company';
      const resolvedRoleTitle = (options?.roleTitle ?? portalRoleTitle ?? wizardResult.targetRole).trim() || resolvedRoles;
      if (sourceText.length >= 20) {
        const bundleRes = await fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_session_bundle',
            input: {
              company: resolvedCompany,
              role: resolvedRoleTitle,
              jobUrl: wizardResult.jobUrl || undefined,
              jobDescription: wizardResult.jobDescription.trim(),
              sourceResumeId: profile.sourceResumeId,
              sourceFilename: storedSource?.filename || draft.selectedFile?.name || 'resume.txt',
              sourceMimeType: storedSource?.mimeType || 'text/plain',
              sourceText,
              analysis: wizardResult.analysis,
              answers: wizardResult.answers,
              generatedResume: generatedForBundle,
              useCurrentResume: wizardResult.mode === 'kept',
              label: `${resolvedCompany}: ${resolvedRoleTitle}`,
            },
          }),
        });
        const bundlePayload = await bundleRes.json().catch(() => ({}));
        if (!bundleRes.ok) {
          throw new Error(typeof bundlePayload.error === 'string' ? bundlePayload.error : 'Could not save your tailored application bundle.');
        }
      }
    }

    const saved = await saveProfile({ ...profile, step: 'complete' });
    persistSession.current = false;
    setDraft((previous) => ({ ...previous, profile: saved.data }));
    clearOnboardingSession();
    clearSessionSourceResume();
    clearWizardResult();
    if (scheduleIssue.current) {
      setSavedWithWarning(true);
      setError(`Your profile is saved, but scheduled searches could not start yet. ${scheduleIssue.current} You can check their status in Discover.`);
      return;
    }
    routerRef.current.push('/dashboard');
    routerRef.current.refresh();
  }

  async function finishAuthenticated(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    setBusyLabel('Opening your portal...');
    try {
      await completeAuthenticatedSetup({
        useSignedStorage: account.capabilities.storage,
        roles: portalRoles || draft.profile.preferences.roles,
        locations: portalLocation || draft.profile.preferences.locations,
        company: portalCompany,
        roleTitle: portalRoleTitle,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish your setup.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function finishWithAccount(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!portalRoles.trim()) {
      setError('Enter the roles you are looking for before creating your portal.');
      return;
    }
    setError('');
    setBusy(true);
    setBusyLabel(authMode === 'signup' ? 'Creating account & saving portal...' : 'Signing in & saving portal...');
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body =
        authMode === 'signup'
          ? { email: authEmail, password: authPassword, name: draft.profile.displayName.trim() || undefined }
          : { email: authEmail, password: authPassword };
      const authRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const authData = await authRes.json().catch(() => ({}));
      if (!authRes.ok) {
        throw new Error(typeof authData.error === 'string' ? authData.error : 'Could not sign in.');
      }

      const onboardingRes = await fetch('/api/onboarding', { cache: 'no-store' });
      const latestState = (await onboardingRes.json().catch(() => null)) as OnboardingState | null;
      if (!onboardingRes.ok || !latestState?.authenticated || !latestState.userId) {
        setAuthMode('signin');
        throw new Error('Your account is ready, but we could not load your workspace. Sign in again to save this resume.');
      }
      setAccount(latestState);
      profileRecord.current = latestState.profile;
      draftRecord.current = latestState.draft;
      accountOwner.current = latestState.userId;
      setDraft((previous) => ({ ...previous, ownerId: latestState.userId, pendingSignIn: false }));

      await completeAuthenticatedSetup({
        useSignedStorage: latestState?.capabilities.storage ?? account.capabilities.storage,
        roles: portalRoles,
        locations: portalLocation,
        company: portalCompany,
        roleTitle: portalRoleTitle,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create your account and save setup.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  const name = draft.profile.displayName.trim();
  const includeCadence = Boolean(account.capabilities.openai);
  const stepIndex =
    draft.screen === 'name'
      ? 0
      : draft.screen === 'choose' || draft.screen === 'upload' || draft.screen === 'build'
        ? 1
        : draft.screen === 'target' ||
            draft.screen === 'report' ||
            draft.screen === 'builder' ||
            draft.screen === 'preferences' ||
            draft.screen === 'cadence'
          ? 2
          : 3;

  const hasUploadSource = Boolean(
    file || (showPaste && pastedText.trim().length >= 25) || sessionSource?.text || draft.profile.sourceResumeId,
  );
  const isKeptResult = Boolean(wizardResult && (wizardResult.mode === 'kept' || !wizardResult.generatedResume));
  const keptFilename = sessionSource?.filename || draft.selectedFile?.name || 'Your uploaded resume';
  const keptBadge = formatOriginalBadge(sessionSource?.mimeType || '', keptFilename);

  const backButton = (screen: OnboardingScreen) => (
    <button type="button" className="ob-back" disabled={busy} onClick={() => back(screen)}>
      <ArrowLeft size={14} aria-hidden="true" />
      Back
    </button>
  );

  const title = (kicker: string, text: string, description: string) => (
    <>
      <p className="ob-kicker">{kicker}</p>
      <h1 ref={heading} tabIndex={-1} className="ob-heading">
        {text}
      </h1>
      <p className="ob-description">{description}</p>
    </>
  );

  return (
    <div className="ob-root">
      <header className="ob-header">
        <Link href="/" className="ob-brand">
          vibecheck<span>.</span>
        </Link>
        <div className="ob-header-actions">
          <Link href="/analyze">Analyze JD + resume</Link>
          {account.authenticated ? (
            <Link href="/dashboard" className="ob-header-cta">
              My portal
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          ) : account.capabilities.auth ? (
            <Link href="/signin?returnTo=%2Fdashboard" onClick={signIn}>
              Sign in
            </Link>
          ) : (
            <span>{checking ? 'Checking workspace...' : accountLoadFailed ? 'Account connection unavailable' : 'Account database not configured'}</span>
          )}
        </div>
      </header>

      <main
        className={`ob-main ${
          draft.screen === 'build' || draft.screen === 'report' || draft.screen === 'builder' || draft.screen === 'result'
            ? 'ob-wide'
            : ''
        }`}
      >
        <section key={draft.screen} className="ob-step" aria-label="Resume wizard and job portal setup">
          {draft.screen === 'name' && (
            <>
              {account.authenticated && account.profile?.data.step === 'complete' && !editMode && (
                <div className="ob-notice ob-notice-inline">
                  <span>Your portal is already set up.</span>
                  <Link href="/dashboard" className="ob-inline-link">
                    Open my job portal
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              )}
              {title(
                'RESUME WIZARD',
                'What’s your name?',
                'Upload your resume or answer a few questions. You will get a formatted, printable resume right away, then you can create an account to save it and open the full portal.',
              )}
              <form
                className="ob-name-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!name) {
                    setError('Enter your name to continue.');
                    return;
                  }
                  void move('choose', {
                    profile: { ...draft.profile, displayName: name },
                    answers: draft.answers.fullName ? draft.answers : createStarterResumeAnswers(name),
                  });
                }}
              >
                <label htmlFor="onboarding-name" className="ob-name-label">
                  Your name
                </label>
                <input
                  id="onboarding-name"
                  name="name"
                  autoComplete="given-name"
                  autoFocus
                  required
                  maxLength={120}
                  className="ob-name-input"
                  placeholder="e.g. Alex"
                  value={draft.profile.displayName}
                  onChange={(event) => updateProfile({ displayName: event.target.value })}
                />
                <div className="ob-actions">
                  <span className="ob-key-hint">
                    You can press <kbd>Enter</kbd>
                  </span>
                  <button type="submit" className="ob-primary" disabled={busy || !name}>
                    {busy ? busyLabel || 'Saving...' : 'Continue'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </form>
              <p className="ob-hint">
                Already have a job description ready? Jump straight to scoring a{' '}
                <Link href="/analyze" className="ob-inline-link">
                  job description + resume
                </Link>
                .
              </p>
            </>
          )}

          {draft.screen === 'choose' && (
            <>
              {title(
                'STEP 2 OF 4',
                `Let’s get started, ${name}.`,
                'Bring an existing resume to format or tailor to a job description, or build one step by step from your experience.',
              )}
              <div className="ob-choices">
                <button
                  type="button"
                  className="ob-choice"
                  disabled={busy}
                  onClick={() =>
                    void move('upload', {
                      profile: {
                        ...draft.profile,
                        resumePath: 'upload',
                        sourceResumeId: draft.profile.resumePath === 'upload' ? draft.profile.sourceResumeId : null,
                      },
                    })
                  }
                >
                  <span className="ob-choice-icon" aria-hidden="true">
                    <Upload size={21} strokeWidth={1.6} />
                  </span>
                  <strong>Upload my resume</strong>
                  <p>Bring a PDF, DOCX, RTF, MD, TEX, or pasted text. Keep your current resume as-is, or score fit and tailor a copy to a job description.</p>
                  <span className="ob-choice-link">
                    Upload or paste text
                    <ArrowRight size={13} aria-hidden="true" />
                  </span>
                </button>
                <button
                  type="button"
                  className="ob-choice"
                  disabled={busy}
                  onClick={() =>
                    void move('build', {
                      profile: {
                        ...draft.profile,
                        resumePath: 'build',
                        sourceResumeId: draft.profile.resumePath === 'build' ? draft.profile.sourceResumeId : null,
                      },
                    })
                  }
                >
                  <span className="ob-choice-icon" aria-hidden="true">
                    <MessageCircle size={21} strokeWidth={1.6} />
                  </span>
                  <strong>Answer a few questions</strong>
                  <p>Build a starter resume from your skills, experience, education, and projects.</p>
                  <span className="ob-choice-link">
                    Build step by step
                    <ArrowRight size={13} aria-hidden="true" />
                  </span>
                </button>
              </div>
              <div className="ob-actions">
                {backButton('name')}
                <span className="ob-hint">You get your printable &amp; LaTeX resume before any sign-up prompt.</span>
              </div>
            </>
          )}

          {draft.screen === 'upload' && (
            <>
              {title(
                'YOUR RESUME',
                'Upload your resume.',
                `Upload a ${RESUME_FORMAT_SUMMARY} resume, or paste your resume text below. You can optionally tailor it to a job description next.`,
              )}
              <label className="ob-upload">
                <Upload size={28} strokeWidth={1.4} aria-hidden="true" />
                <strong>{file ? 'Choose a different resume file' : 'Drop your resume here, or browse'}</strong>
                <span>{RESUME_FORMAT_SUMMARY}, up to 8 MB</span>
                <input
                  aria-label="Resume file"
                  type="file"
                  accept={RESUME_FILE_ACCEPT}
                  disabled={busy}
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;
                    try {
                      validateUpload(selected);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : `Choose a ${RESUME_FORMAT_SUMMARY} resume.`);
                      return;
                    }
                    setError('');
                    setFile(selected);
                    setShowPaste(false);
                    setDraft((previous) => ({
                      ...previous,
                      selectedFile: { name: selected.name, size: selected.size },
                      profile: { ...previous.profile, sourceResumeId: null },
                    }));
                  }}
                />
              </label>

              <div className="ob-upload-alt">
                <button
                  type="button"
                  className="ob-secondary"
                  disabled={busy}
                  onClick={() => {
                    setShowPaste((prev) => !prev);
                    setError('');
                    if (!pastedText && sessionSource?.text) setPastedText(sessionSource.text);
                  }}
                >
                  <ClipboardPaste size={15} aria-hidden="true" />
                  {showPaste ? 'Hide paste box' : 'Paste resume text instead'}
                </button>
              </div>

              {showPaste && (
                <div className="ob-paste-panel">
                  <label className="ob-field" htmlFor="wizard-paste-resume">
                    Paste resume text
                    <textarea
                      id="wizard-paste-resume"
                      rows={6}
                      placeholder="Paste your plain-text resume here (at least 25 characters)..."
                      value={pastedText}
                      disabled={busy}
                      onChange={(event) => {
                        setPastedText(event.target.value);
                        setError('');
                      }}
                    />
                  </label>
                </div>
              )}

              {(draft.selectedFile || sessionSource || draft.profile.sourceResumeId) && (
                <div className="ob-file" style={{ marginTop: 15 }}>
                  <FileText size={20} aria-hidden="true" />
                  <div>
                    <strong>{draft.selectedFile?.name || sessionSource?.filename || 'Your saved resume'}</strong>
                    <small>
                      {draft.profile.sourceResumeId
                        ? 'Saved in your private library'
                        : file
                          ? 'Selected for formatting'
                          : sessionSource?.text
                            ? `${sessionSource.text.length.toLocaleString()} characters ready`
                            : 'Ready'}
                    </small>
                  </div>
                  {(file || sessionSource) && (
                    <button
                      type="button"
                      aria-label="Remove selected file"
                      onClick={() => {
                        setFile(null);
                        setSessionSource(null);
                        clearSessionSourceResume();
                        setDraft((previous) => ({ ...previous, selectedFile: null }));
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              <div className="ob-actions ob-actions-wrap">
                {backButton('choose')}
                <div className="ob-actions-group">
                  <button
                    type="button"
                    className="ob-secondary"
                    disabled={busy || !hasUploadSource}
                    onClick={() => void continueUpload('keep')}
                  >
                    Keep my current resume
                  </button>
                  <button
                    type="button"
                    className="ob-primary"
                    disabled={busy || !hasUploadSource}
                    onClick={() => void continueUpload('tailor')}
                  >
                    {busy ? busyLabel || 'Reading resume...' : 'Tailor to a job description'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}

          {draft.screen === 'build' && (
            <StarterResumeBuilder
              currentStep={draft.builderStep}
              onStepChange={(builderStep) => setDraft((previous) => ({ ...previous, builderStep }))}
              value={draft.answers}
              onChange={(answers) => {
                edited.current = true;
                setDraft((previous) => ({
                  ...previous,
                  answers,
                  builtResume: false,
                  profile: { ...previous.profile, sourceResumeId: null },
                }));
              }}
              onComplete={async (built) => {
                const nextSource: SessionSourceResume = {
                  schemaVersion: 1,
                  filename: built.filename,
                  mimeType: 'text/plain',
                  origin: 'builder',
                  text: built.sourceText,
                  generatedResume: built.generatedResume,
                  updatedAt: new Date().toISOString(),
                };
                writeSessionSourceResume(nextSource);
                setSessionSource(nextSource);

                const nextResult: WizardResumeResult = {
                  schemaVersion: 1,
                  mode: 'builder',
                  generatedResume: built.generatedResume,
                  analysis: null,
                  generateMode: 'deterministic',
                  answers: {},
                  company: '',
                  targetRole: built.answers.headline || '',
                  jobUrl: '',
                  jobDescription: '',
                  updatedAt: new Date().toISOString(),
                };
                writeWizardResult(nextResult);
                setWizardResult(nextResult);

                const suggestedRoles =
                  built.answers.headline.trim() ||
                  built.answers.skills
                    .split(/[,;\n]/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ');

                if (built.answers.email) setAuthEmail((prev) => prev || built.answers.email);
                if (suggestedRoles) setPortalRoles((prev) => prev || suggestedRoles);
                if (built.answers.location) setPortalLocation((prev) => prev || built.answers.location);

                await move('result', {
                  answers: built.answers,
                  builtResume: true,
                  profile: {
                    ...draft.profile,
                    resumePath: 'build',
                    preferences: {
                      ...draft.profile.preferences,
                      roles: draft.profile.preferences.roles || suggestedRoles,
                      locations: draft.profile.preferences.locations || built.answers.location,
                    },
                  },
                });
              }}
              onBack={() => back('choose')}
              completionBusy={busy}
            />
          )}

          {draft.screen === 'target' && (
            <>
              {title(
                'STEP 3 OF 4',
                'Compare your resume against a job description.',
                'Paste the target job description to get your detailed fit report, then answer targeted follow-up questions in the Resume Builder or keep your current resume.',
              )}
              <div className="ob-target-source">
                <div className="ob-target-source-info">
                  <FileText size={18} aria-hidden="true" />
                  <div>
                    <strong>{keptFilename}</strong>
                    <span>
                      {sessionSource?.text
                        ? `${sessionSource.text.length.toLocaleString()} characters loaded`
                        : 'Saved resume ready'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ob-secondary"
                  disabled={busy}
                  onClick={() => void keepCurrentResume()}
                >
                  Keep current resume instead
                </button>
              </div>
              <form className="ob-form" onSubmit={(event) => void runWizardAnalyze(event)}>
                <label className="ob-field" htmlFor="wizard-target-jd">
                  Target job description
                  <textarea
                    id="wizard-target-jd"
                    rows={7}
                    required
                    maxLength={40000}
                    placeholder="Paste the job description here (at least 25 characters)..."
                    value={draft.wizardTarget.jobDescription}
                    disabled={busy}
                    onChange={(event) => {
                      updateWizardTarget({ jobDescription: event.target.value });
                      setError('');
                    }}
                  />
                </label>

                <div className="ob-fields-row">
                  <label className="ob-field" htmlFor="wizard-target-company">
                    Company name (optional)
                    <input
                      id="wizard-target-company"
                      maxLength={160}
                      placeholder="e.g. Stripe"
                      value={draft.wizardTarget.company}
                      disabled={busy}
                      onChange={(event) => updateWizardTarget({ company: event.target.value })}
                    />
                  </label>
                  <label className="ob-field" htmlFor="wizard-target-url">
                    Job posting URL (optional)
                    <input
                      id="wizard-target-url"
                      type="url"
                      maxLength={500}
                      placeholder="https://..."
                      value={draft.wizardTarget.jobUrl}
                      disabled={busy}
                      onChange={(event) => updateWizardTarget({ jobUrl: event.target.value })}
                    />
                  </label>
                </div>

                <div className="ob-actions ob-actions-wrap">
                  {backButton(draft.profile.resumePath === 'build' ? 'result' : 'upload')}
                  <div className="ob-actions-group">
                    <button
                      type="button"
                      className="ob-secondary"
                      disabled={busy}
                      onClick={() => void keepCurrentResume()}
                    >
                      Keep current resume instead
                    </button>
                    <button
                      type="submit"
                      className="ob-primary"
                      disabled={busy || draft.wizardTarget.jobDescription.trim().length < 25}
                    >
                      {busy ? busyLabel || 'Analyzing...' : 'Analyze Resume'}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}

          {draft.screen === 'report' && (
            <>
              {!wizardResult?.analysis ? (
                <div className="ob-empty-result">
                  {title(
                    'STEP 3 OF 4',
                    'No resume analysis found yet.',
                    'Paste a job description to score your resume before opening the fit report.',
                  )}
                  <div className="ob-actions">
                    <button type="button" className="ob-primary" onClick={() => back('target')}>
                      Add job description
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ob-result-layout">
                  <div className="ob-result-top">
                    <div>
                      <p className="ob-kicker">STEP 3 OF 4</p>
                      <h1 ref={heading} tabIndex={-1} className="ob-heading">
                        Detailed Fit Report
                      </h1>
                      <p className="ob-description">
                        Review the evidence scorecard and gaps below, then open the Resume Builder or keep your current resume.
                      </p>
                    </div>
                    <div className="ob-result-toolbar">
                      <button
                        type="button"
                        className="ob-secondary"
                        disabled={busy}
                        onClick={() => back('target')}
                      >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Change job description
                      </button>
                      <button
                        type="button"
                        className="ob-secondary"
                        disabled={busy}
                        onClick={() => void keepCurrentResume()}
                      >
                        Keep my current resume
                      </button>
                      <button
                        type="button"
                        className="ob-primary"
                        disabled={busy}
                        onClick={() => void move('builder')}
                      >
                        Open Resume Builder
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <AnalysisResult
                    embedded
                    mode={wizardResult.analysisMode}
                    matchScore={wizardResult.analysis.score}
                    strengths={wizardResult.analysis.recommendations.strengths}
                    weaknesses={wizardResult.analysis.recommendations.improvements}
                    missingSkills={wizardResult.analysis.missingSkills}
                    recommendations={[
                      ...wizardResult.analysis.recommendations.skillGaps,
                      ...wizardResult.analysis.recommendations.format,
                    ]}
                    detailedAnalysis={wizardResult.analysis.detailedAnalysis}
                    evaluation={wizardResult.analysis.evaluation}
                    roleRequirements={wizardResult.analysis.roleRequirements}
                    priorityActions={wizardResult.analysis.priorityActions}
                  />

                  <section className="clay-panel p-6" aria-labelledby="wizard-report-cta-heading">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="clay-kicker text-xs font-bold uppercase">Next Step</p>
                        <h2 id="wizard-report-cta-heading" className="mt-2 text-2xl font-black text-slate-950">
                          Build a Role-Tailored Resume
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                          Review the extracted profile, answer targeted follow-up questions for this role, and generate a formatted preview with LaTeX export, or keep your current resume as-is.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="ob-secondary"
                          disabled={busy}
                          onClick={() => void keepCurrentResume()}
                        >
                          Keep my current resume
                        </button>
                        <button
                          type="button"
                          className="ob-primary"
                          disabled={busy}
                          onClick={() => void move('builder')}
                        >
                          Open Resume Builder
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}

          {draft.screen === 'builder' && (
            <>
              {!wizardResult?.analysis ? (
                <div className="ob-empty-result">
                  {title(
                    'RESUME BUILDER',
                    'Run a fit analysis first.',
                    'Analyze your resume against a job description to unlock targeted Resume Builder questions.',
                  )}
                  <div className="ob-actions">
                    <button type="button" className="ob-primary" onClick={() => back('target')}>
                      Go to Job Description
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ob-result-layout">
                  <div className="ob-result-top">
                    <div>
                      <p className="ob-kicker">RESUME BUILDER</p>
                      <h1 ref={heading} tabIndex={-1} className="ob-heading">
                        Resume Builder
                      </h1>
                      <p className="ob-description">
                        Generate a role-tailored resume preview from the report evidence.
                      </p>
                    </div>
                    <div className="ob-result-toolbar">
                      <button
                        type="button"
                        className="ob-secondary"
                        disabled={busy}
                        onClick={() => back('report')}
                      >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Back to Fit Report
                      </button>
                      <button
                        type="button"
                        className="ob-secondary"
                        disabled={busy}
                        onClick={() => void keepCurrentResume()}
                      >
                        Keep current resume instead
                      </button>
                    </div>
                  </div>

                  <ResumeGenerator
                    analysis={wizardResult.analysis}
                    jobDescription={wizardResult.jobDescription}
                    answers={wizardResult.answers}
                    onAnswersChange={(nextAnswers) => {
                      const updated: WizardResumeResult = {
                        ...wizardResult,
                        answers: nextAnswers,
                        updatedAt: new Date().toISOString(),
                      };
                      setWizardResult(updated);
                      writeWizardResult(updated);
                      setError('');
                    }}
                    onGenerate={runWizardGenerate}
                    isGenerating={busy}
                    error={error}
                    generateLabel="Generate Resume Preview"
                    generatingLabel="Generating..."
                    secondaryAction={
                      <button
                        type="button"
                        className="clay-secondary-button px-4 py-3 text-sm font-bold text-slate-800"
                        disabled={busy}
                        onClick={() => void keepCurrentResume()}
                      >
                        Keep current resume instead
                      </button>
                    }
                    nextStepText="After generation, the resume opens in preview with Print / Save PDF, Copy LaTeX, and .tex download, plus an option to save to your job portal."
                  />
                </div>
              )}
            </>
          )}

          {draft.screen === 'result' && (
            <>
              {!wizardResult ? (
                <div className="ob-empty-result">
                  {title(
                    'STEP 4 OF 4',
                    'Your resume draft is not loaded yet.',
                    'Upload an existing resume or answer a few questions to generate a formatted resume here.',
                  )}
                  <div className="ob-actions">
                    <button type="button" className="ob-primary" onClick={() => back('choose')}>
                      Create or upload resume
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ob-result-layout">
                  <div className="ob-result-top">
                    <div>
                      <p className="ob-kicker">STEP 4 OF 4</p>
                      <h1 ref={heading} tabIndex={-1} className="ob-heading">
                        {isKeptResult
                          ? name
                            ? `${name}, your current resume is ready.`
                            : 'Your current resume is ready.'
                          : name
                            ? `${name}, your resume is ready.`
                            : 'Your resume is ready.'}
                      </h1>
                      <p className="ob-description">
                        {isKeptResult
                          ? 'Your original resume is kept untouched. Save it to your job portal as-is, or tailor a copy to a job description anytime.'
                          : wizardResult.analysis
                            ? 'Print or save as PDF, copy or download the LaTeX source, refine in the Resume Builder, or keep your current resume instead.'
                            : 'Print or save as PDF, copy or download the LaTeX source, edit your builder inputs, or tailor it to a job description.'}
                      </p>
                    </div>
                    <div className="ob-result-toolbar">
                      {isKeptResult ? (
                        <>
                          {wizardResult.analysis && (
                            <button
                              type="button"
                              className="ob-secondary"
                              disabled={busy}
                              onClick={() => back('report')}
                            >
                              View Fit Report
                            </button>
                          )}
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (wizardResult.analysis) {
                                back('builder');
                              } else {
                                void move('target');
                              }
                            }}
                          >
                            Tailor to a job description
                          </button>
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => back('upload')}
                          >
                            Replace resume
                          </button>
                        </>
                      ) : wizardResult.analysis ? (
                        <>
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => back('builder')}
                          >
                            <ArrowLeft size={14} aria-hidden="true" />
                            Back to Builder
                          </button>
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => back('report')}
                          >
                            Back to Fit Report
                          </button>
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => void keepCurrentResume()}
                          >
                            Keep current resume instead
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => back('build')}
                          >
                            <ArrowLeft size={14} aria-hidden="true" />
                            Edit resume inputs
                          </button>
                          <button
                            type="button"
                            className="ob-secondary"
                            disabled={busy}
                            onClick={() => void move('target')}
                          >
                            Tailor to a job description
                          </button>
                        </>
                      )}
                      <a href="#portal-account-prompt" className="ob-primary">
                        {account.authenticated ? 'Save to my portal' : 'Save & get full portal'}
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    </div>
                  </div>

                  {wizardResult.analysis && !isKeptResult && (
                    <section className="ob-fit-strip" aria-label="Role fit summary">
                      <div className="ob-fit-strip-head">
                        <div className="ob-fit-score">
                          <strong>{wizardResult.analysis.score}% fit</strong>
                          <span>
                            {wizardResult.analysisMode === 'ai' ? 'DeepSeek fit report' : 'Keyword & requirement scorecard'}
                            {wizardResult.targetRole ? ` for ${wizardResult.targetRole}` : ''}
                          </span>
                        </div>
                      </div>
                      <details className="ob-details">
                        <summary>View full fit report</summary>
                        <div className="ob-details-body">
                          <AnalysisResult
                            embedded
                            mode={wizardResult.analysisMode}
                            matchScore={wizardResult.analysis.score}
                            strengths={wizardResult.analysis.recommendations.strengths}
                            weaknesses={wizardResult.analysis.recommendations.improvements}
                            missingSkills={wizardResult.analysis.missingSkills}
                            recommendations={[
                              ...wizardResult.analysis.recommendations.skillGaps,
                              ...wizardResult.analysis.recommendations.format,
                            ]}
                            detailedAnalysis={wizardResult.analysis.detailedAnalysis}
                            evaluation={wizardResult.analysis.evaluation}
                            roleRequirements={wizardResult.analysis.roleRequirements}
                            priorityActions={wizardResult.analysis.priorityActions}
                          />
                        </div>
                      </details>
                    </section>
                  )}

                  {isKeptResult ? (
                    <section className="ob-kept-card" aria-label="Kept current resume">
                      <div className="ob-kept-copy">
                        <span className="ob-kept-icon" aria-hidden="true">
                          <FileText size={22} strokeWidth={1.6} />
                        </span>
                        <div>
                          <h2>{keptFilename}</h2>
                          <p>
                            Original file kept untouched. When you save to your portal, this exact resume is stored in your private library as your current resume without rewriting or reformatting.
                          </p>
                          <div className="ob-kept-meta">
                            <span className="ob-kept-badge">{keptBadge}</span>
                            {sessionSource?.text && (
                              <span className="ob-kept-badge">
                                {sessionSource.text.length.toLocaleString()} characters ready
                              </span>
                            )}
                            {wizardResult.analysis && (
                              <span className="ob-kept-badge">
                                {wizardResult.analysis.score}% fit recorded
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : (
                    wizardResult.generatedResume && (
                      <div className="ob-resume-result">
                        <ResumePreview generatedResume={wizardResult.generatedResume} />
                      </div>
                    )
                  )}

                  <section id="portal-account-prompt" className="ob-portal-cta" aria-labelledby="portal-account-heading">
                    <div className="ob-portal-cta-copy">
                      <p className="ob-kicker">FULL JOB PORTAL</p>
                      <h2 id="portal-account-heading">
                        {account.authenticated ? 'Save your resume to your portal.' : 'Make an account to get the full portal.'}
                      </h2>
                      <p>
                        {isKeptResult
                          ? account.authenticated
                            ? 'Your original resume is kept untouched. Save it to your workspace to keep it alongside your applications.'
                            : 'Your current resume is kept untouched. Create a private account to save it in your library and manage every application in one workspace.'
                          : account.authenticated
                            ? 'Your resume is ready to print or export. Save it to your workspace to keep it alongside your applications.'
                            : 'Your resume above is ready to print or export right now. Create a private account to save your resumes and manage every application in one workspace.'}
                      </p>
                      <ul className="ob-portal-features">
                        <li>
                          <FileText size={16} aria-hidden="true" />
                          <span>Keep your original resume and tailored versions in your private library</span>
                        </li>
                        <li>
                          <BriefcaseBusiness size={16} aria-hidden="true" />
                          <span>Track applications by stage on the board or list with tasks and interviews</span>
                        </li>
                        <li>
                          <Compass size={16} aria-hidden="true" />
                          <span>Search live public job boards ranked against your resume</span>
                        </li>
                        <li>
                          <FileCheck2 size={16} aria-hidden="true" />
                          <span>Run role-fit reports and export per-application LaTeX versions</span>
                        </li>
                      </ul>
                    </div>

                    <div className="ob-portal-cta-form">
                      {account.authenticated ? (
                        <form className="ob-form" onSubmit={(event) => void finishAuthenticated(event)}>
                          <h3>Save to your workspace</h3>
                          <label className="ob-field" htmlFor="portal-auth-roles">
                            Roles you are looking for
                            <input
                              id="portal-auth-roles"
                              required
                              maxLength={2000}
                              placeholder="e.g. Product designer, design engineer"
                              value={portalRoles}
                              disabled={busy}
                              onChange={(event) => setPortalRoles(event.target.value)}
                            />
                          </label>
                          <label className="ob-field" htmlFor="portal-auth-location">
                            Preferred location (optional)
                            <input
                              id="portal-auth-location"
                              maxLength={1000}
                              placeholder="e.g. Toronto, or remote"
                              value={portalLocation}
                              disabled={busy}
                              onChange={(event) => setPortalLocation(event.target.value)}
                            />
                          </label>
                          {wizardResult.analysis && (
                            <div className="ob-fields-row">
                              <label className="ob-field" htmlFor="portal-auth-company">
                                Company for tracked application
                                <input
                                  id="portal-auth-company"
                                  required
                                  maxLength={160}
                                  placeholder="e.g. Stripe"
                                  value={portalCompany}
                                  disabled={busy}
                                  onChange={(event) => setPortalCompany(event.target.value)}
                                />
                              </label>
                              <label className="ob-field" htmlFor="portal-auth-roletitle">
                                Role title
                                <input
                                  id="portal-auth-roletitle"
                                  required
                                  maxLength={160}
                                  placeholder="e.g. Full-Stack Engineer"
                                  value={portalRoleTitle}
                                  disabled={busy}
                                  onChange={(event) => setPortalRoleTitle(event.target.value)}
                                />
                              </label>
                            </div>
                          )}
                          <button type="submit" className="ob-primary ob-full-width" disabled={busy}>
                            {busy ? busyLabel || 'Opening portal...' : 'Save & open my job portal'}
                            <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        </form>
                      ) : checking ? (
                        <p role="status">Connecting to your account service… Your resume is ready to print or export.</p>
                      ) : accountLoadFailed ? (
                        <div className="ob-notice">
                          <p>We could not connect to your account service. Your resume is still ready to print or export.</p>
                          <button type="button" className="ob-primary" onClick={retryAccountConnection}>
                            Retry account connection
                          </button>
                        </div>
                      ) : account.capabilities.auth ? (
                        <div className="ob-form">
                          <div className="ob-tabs" role="tablist" aria-label="Account action">
                            <button
                              type="button"
                              role="tab"
                              aria-selected={authMode === 'signup'}
                              className={authMode === 'signup' ? 'is-active' : ''}
                              onClick={() => {
                                setAuthMode('signup');
                                setError('');
                              }}
                            >
                              Create account
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={authMode === 'signin'}
                              className={authMode === 'signin' ? 'is-active' : ''}
                              onClick={() => {
                                setAuthMode('signin');
                                setError('');
                              }}
                            >
                              Sign in
                            </button>
                          </div>

                          <form className="ob-form" onSubmit={(event) => void finishWithAccount(event)}>
                            <label className="ob-field" htmlFor="portal-roles">
                              Roles you are looking for
                              <input
                                id="portal-roles"
                                required
                                maxLength={2000}
                                placeholder="e.g. Product designer, software engineer"
                                value={portalRoles}
                                disabled={busy}
                                onChange={(event) => setPortalRoles(event.target.value)}
                              />
                            </label>
                            <label className="ob-field" htmlFor="portal-location">
                              Preferred location (optional)
                              <input
                                id="portal-location"
                                maxLength={1000}
                                placeholder="e.g. Toronto, or remote"
                                value={portalLocation}
                                disabled={busy}
                                onChange={(event) => setPortalLocation(event.target.value)}
                              />
                            </label>
                            {wizardResult.analysis && (
                              <div className="ob-fields-row">
                                <label className="ob-field" htmlFor="portal-company">
                                  Company (saves this role to tracker)
                                  <input
                                    id="portal-company"
                                    required
                                    maxLength={160}
                                    placeholder="e.g. Stripe"
                                    value={portalCompany}
                                    disabled={busy}
                                    onChange={(event) => setPortalCompany(event.target.value)}
                                  />
                                </label>
                                <label className="ob-field" htmlFor="portal-roletitle">
                                  Role title
                                  <input
                                    id="portal-roletitle"
                                    required
                                    maxLength={160}
                                    placeholder="e.g. Full-Stack Engineer"
                                    value={portalRoleTitle}
                                    disabled={busy}
                                    onChange={(event) => setPortalRoleTitle(event.target.value)}
                                  />
                                </label>
                              </div>
                            )}
                            <label className="ob-field" htmlFor="portal-email">
                              Email
                              <input
                                id="portal-email"
                                type="email"
                                name="email"
                                autoComplete="email"
                                required
                                maxLength={254}
                                placeholder="you@example.com"
                                value={authEmail}
                                disabled={busy}
                                onChange={(event) => setAuthEmail(event.target.value)}
                              />
                            </label>
                            <label className="ob-field" htmlFor="portal-password">
                              Password
                              <input
                                id="portal-password"
                                type="password"
                                name="password"
                                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                                required
                                minLength={authMode === 'signup' ? 8 : 1}
                                maxLength={128}
                                placeholder={authMode === 'signup' ? 'At least 8 characters' : 'Your password'}
                                value={authPassword}
                                disabled={busy}
                                onChange={(event) => setAuthPassword(event.target.value)}
                              />
                            </label>
                            <button type="submit" className="ob-primary ob-full-width" disabled={busy}>
                              {busy
                                ? busyLabel || 'Creating portal...'
                                : authMode === 'signup'
                                  ? 'Create account & open portal'
                                  : 'Sign in & open portal'}
                              <ArrowRight size={16} aria-hidden="true" />
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="ob-notice">
                          <p>
                            <strong>Account database not configured.</strong> Set <code>DATABASE_URL</code> and <code>AUTH_SECRET</code> to save your account in PostgreSQL.
                          </p>
                          <p style={{ marginTop: 8 }}>
                            Your resume above is still completely functional: use Print / Save PDF or Download .tex right away.
                          </p>
                          <div className="ob-actions" style={{ marginTop: 16 }}>
                            <Link href="/analyze" className="ob-secondary">
                              Analyze another JD
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}

          {draft.screen === 'preferences' && (
            <>
              {title(
                'SEARCH PREFERENCES',
                'What are you looking for?',
                'These preferences guide live job discovery and matching inside your portal.',
              )}
              <form
                className="ob-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!draft.profile.preferences.roles.trim()) {
                    setError('Describe the roles you would like to find.');
                    return;
                  }
                  if (editMode === 'preferences' && account.authenticated && draft.profile.sourceResumeId) {
                    setBusy(true);
                    setBusyLabel('Saving preferences...');
                    setError('');
                    try {
                      await saveProfile(draft.profile);
                      routerRef.current.push('/discover');
                      routerRef.current.refresh();
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'Could not save preferences.');
                    } finally {
                      setBusy(false);
                      setBusyLabel('');
                    }
                    return;
                  }
                  await move(includeCadence ? 'cadence' : wizardResult ? 'result' : 'choose');
                }}
              >
                <label className="ob-field">
                  Roles you’re interested in
                  <textarea
                    name="roles"
                    required
                    maxLength={2000}
                    rows={3}
                    placeholder="e.g. Product design roles on a small team"
                    value={draft.profile.preferences.roles}
                    onChange={(event) => updatePreferences({ roles: event.target.value })}
                  />
                  <span className="ob-field-hint">A few titles, a short description, or both.</span>
                </label>
                <label className="ob-field">
                  Where would you like to work?
                  <input
                    name="locations"
                    maxLength={1000}
                    placeholder="e.g. Toronto, Canada, or anywhere remote"
                    value={draft.profile.preferences.locations}
                    onChange={(event) => updatePreferences({ locations: event.target.value })}
                  />
                </label>
                <fieldset>
                  <legend className="ob-name-label">How do you like to work?</legend>
                  <div className="ob-workmodes">
                    {(['remote', 'hybrid', 'onsite'] as const).map((mode) => (
                      <label key={mode}>
                        <input
                          type="checkbox"
                          checked={draft.profile.preferences.workModes.includes(mode)}
                          onChange={(event) =>
                            updatePreferences({
                              workModes: event.target.checked
                                ? [...draft.profile.preferences.workModes, mode]
                                : draft.profile.preferences.workModes.filter((value) => value !== mode),
                            })
                          }
                        />
                        {mode === 'onsite' ? 'On-site' : mode[0].toUpperCase() + mode.slice(1)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="ob-name-label">Employment type</legend>
                  <div className="ob-workmodes">
                    {(['full-time', 'part-time', 'contract', 'internship'] as const).map((type) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={draft.profile.preferences.employmentTypes.includes(type)}
                          onChange={(event) =>
                            updatePreferences({
                              employmentTypes: event.target.checked
                                ? [...draft.profile.preferences.employmentTypes, type]
                                : draft.profile.preferences.employmentTypes.filter((value) => value !== type),
                            })
                          }
                        />
                        {type[0].toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="ob-field">
                  Anything else that matters? <span className="ob-field-hint">Optional</span>
                  <textarea
                    rows={2}
                    maxLength={3000}
                    placeholder="Industries, values, compensation, or things you want to avoid."
                    value={draft.profile.preferences.additionalContext}
                    onChange={(event) => updatePreferences({ additionalContext: event.target.value })}
                  />
                </label>
                <div className="ob-actions">
                  {editMode === 'preferences' && account.authenticated ? (
                    <Link href="/discover" className="ob-back">
                      <ArrowLeft size={14} aria-hidden="true" />
                      Back to Discover
                    </Link>
                  ) : (
                    backButton(wizardResult ? 'result' : 'choose')
                  )}
                  <button type="submit" className="ob-primary" disabled={busy}>
                    {busy ? busyLabel || 'Saving...' : editMode === 'preferences' ? 'Save & return to Discover' : 'Continue'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </form>
            </>
          )}

          {draft.screen === 'cadence' && includeCadence && (
            <>
              {title(
                'AT YOUR PACE',
                'How often should we look?',
                'Choose a rhythm for finding new roles that match your preferences. New opportunities will appear in Discover.',
              )}
              <form
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (draft.profile.cadence !== 'manual' && !draft.profile.discoveryConsent) {
                    setError('Opt in to scheduled searches, or choose "When I ask."');
                    return;
                  }
                  void move(wizardResult ? 'result' : 'finish');
                }}
              >
                <div className="ob-radio-list">
                  {(
                    [
                      { value: 'daily', label: 'Every day', text: 'A regular look at new openings that fit your role preferences.' },
                      { value: 'weekly', label: 'Once a week', text: 'A weekly check for fresh opportunities.' },
                      { value: 'manual', label: 'When I ask', text: 'Run searches manually when you want to look.' },
                    ] as const
                  ).map((option) => (
                    <label className="ob-radio" key={option.value}>
                      <input
                        type="radio"
                        name="cadence"
                        value={option.value}
                        checked={draft.profile.cadence === option.value}
                        onChange={() =>
                          updateProfile({
                            cadence: option.value,
                            discoveryConsent: option.value === 'manual' ? false : draft.profile.discoveryConsent,
                          })
                        }
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <p>{option.text}</p>
                      </span>
                    </label>
                  ))}
                </div>
                {draft.profile.cadence !== 'manual' && (
                  <label className="ob-check">
                    <input
                      type="checkbox"
                      checked={draft.profile.discoveryConsent}
                      onChange={(event) => updateProfile({ discoveryConsent: event.target.checked })}
                    />
                    I want VibeCheck to use my role preferences for scheduled job searches. I can turn this off from Discover at any time.
                  </label>
                )}
                <div className="ob-actions">
                  {backButton('preferences')}
                  <button type="submit" className="ob-primary" disabled={busy}>
                    {busy ? 'Saving...' : 'Continue'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </form>
            </>
          )}

          {draft.screen === 'finish' && (
            <>
              <span className="ob-success-mark" aria-hidden="true">
                <Check size={24} strokeWidth={1.6} />
              </span>
              {title('YOUR PORTAL', `${name ? `${name}’s` : 'Your'} job portal.`, 'Save your setup to open the full workspace.')}
              <div className="ob-actions">
                {backButton(wizardResult ? 'result' : 'choose')}
                {account.authenticated ? (
                  <button
                    type="button"
                    className="ob-primary"
                    disabled={busy}
                    onClick={() =>
                      void finishAuthenticated({
                        preventDefault() {},
                      } as FormEvent)
                    }
                  >
                    {busy ? busyLabel || 'Opening portal...' : 'Open my job portal'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <button type="button" className="ob-primary" onClick={() => back(wizardResult ? 'result' : 'choose')}>
                    {wizardResult ? 'Review resume & create account' : 'Continue wizard'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {error && draft.screen !== 'builder' && (
          <p className="ob-error" role="alert" style={{ marginTop: 20 }}>
            {error}
          </p>
        )}
        {savedWithWarning && (
          <Link href="/dashboard" className="ob-primary" style={{ marginTop: 16 }}>
            Continue to my saved portal
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
        {storageWarning && (
          <p className="ob-hint" role="status">
            Your browser could not keep this draft. Leave this page open until you finish.
          </p>
        )}
      </main>

      <footer className="ob-footer">
        <div className="ob-progress" aria-label={`Setup step ${stepIndex + 1} of 4`}>
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''} />
          ))}
        </div>
        <span className="ob-session-label">
          <LockKeyhole size={12} aria-hidden="true" />
          {account.authenticated
            ? savingDraft
              ? 'Saving draft...'
              : error
                ? 'Your draft needs attention'
                : 'Your private workspace: autosave enabled'
            : checking
              ? 'Connecting to your account service…'
              : accountLoadFailed
                ? 'Your resume is ready; retry the connection to save it to an account'
                : account.capabilities.auth
              ? 'Get your resume first, then create an account for the full portal'
              : 'Database configuration required for accounts'}
        </span>
        <span>VibeCheck Resume</span>
      </footer>
    </div>
  );
}
