'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export const PENDING_BUNDLE_KEY = 'vibecheck:pending-bundle:v1';

interface WorkspaceAccessProps {
  kind?: 'signin' | 'setup' | 'unavailable' | 'callback';
  returnTo?: string;
  initialMode?: 'signin' | 'signup';
  adoptPendingBundle?: boolean;
  auth0Enabled?: boolean;
}

export default function WorkspaceAccess({
  kind = 'signin',
  returnTo = '/dashboard',
  initialMode = 'signin',
  adoptPendingBundle = false,
  auth0Enabled = false,
}: WorkspaceAccessProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unavailable = kind === 'setup' || kind === 'unavailable';
  const heading =
    kind === 'setup'
      ? 'Database or auth secret missing.'
      : kind === 'unavailable'
        ? 'Your workspace is temporarily unavailable.'
        : mode === 'signup'
          ? 'Create your private workspace account.'
          : 'Sign in to your job portal.';
  const description =
    kind === 'setup'
      ? 'Configure DATABASE_URL and AUTH_SECRET before opening account workspaces. You can still analyze a JD against your resume right away.'
      : kind === 'unavailable'
        ? 'We could not connect to your workspace right now. Your saved records are safe. Try again shortly.'
        : kind === 'callback'
          ? 'Sign-in could not be completed. Try again below to open your workspace.'
          : adoptPendingBundle
            ? 'Create an account or sign in to save your analyzed resume and target job straight to your tracker.'
            : 'Save applications, tailored LaTeX resumes, and live discovery matches in PostgreSQL.';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body = mode === 'signup' ? { email, password, name: name.trim() || undefined } : { email, password };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Authentication failed.');
      }

      const rawPending = typeof window !== 'undefined' ? window.localStorage.getItem(PENDING_BUNDLE_KEY) : null;
      if (rawPending) {
        try {
          const parsedBundle = JSON.parse(rawPending);
          const saveResponse = await fetch('/api/resumes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_session_bundle', input: parsedBundle }),
          });
          const saveData = await saveResponse.json().catch(() => ({}));
          if (!saveResponse.ok || !saveData.application?.id) {
            throw new Error(typeof saveData.error === 'string' ? saveData.error : 'Could not save your session analysis to your account.');
          }
          window.localStorage.removeItem(PENDING_BUNDLE_KEY);
          router.push(`/applications/${saveData.application.id}#resume-workspace`);
          router.refresh();
          return;
        } catch (adoptError) {
          throw adoptError instanceof Error ? adoptError : new Error('Signed in, but could not save your pending analysis bundle.');
        }
      }

      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
      setBusy(false);
    }
  }

  return (
    <main className="clay-shell">
      <section className="clay-panel mx-auto max-w-xl p-8 sm:p-10">
        <p className="clay-kicker flex items-center gap-2 text-xs font-bold uppercase">
          <LockKeyhole size={14} aria-hidden="true" />
          YOUR PRIVATE JOB PORTAL
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#1d322c]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{heading}</h1>
        <p className="mt-3 text-sm leading-6 text-[#4e5f56]">{description}</p>

        {unavailable ? (
          <div className="mt-7 flex flex-wrap gap-3">
            {kind === 'unavailable' && (
              <a className="clay-button inline-flex items-center px-5 py-3 text-sm font-semibold text-white" href={returnTo}>
                Try again
              </a>
            )}
            <Link className="clay-secondary-button inline-flex items-center px-5 py-3 text-sm font-semibold" href="/analyze">
              Analyze JD + resume
            </Link>
            <Link className="inline-flex min-h-[44px] items-center px-3 py-2 text-sm font-medium text-[#235347] underline underline-offset-4" href="/">
              Guided wizard
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-5 inline-flex rounded-xl border border-[#7d8c7d] bg-[#f4f4eb] p-1" role="tablist" aria-label="Account mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'signin' ? 'bg-[#26594c] text-white' : 'text-[#1d322c] hover:bg-[#e6eddf]'
                }`}
                onClick={() => {
                  setMode('signin');
                  setError('');
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'signup' ? 'bg-[#26594c] text-white' : 'text-[#1d322c] hover:bg-[#e6eddf]'
                }`}
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
              >
                Create account
              </button>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {mode === 'signup' && (
                <label className="block text-sm font-semibold text-[#1d322c]">
                  Full name
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    maxLength={120}
                    placeholder="e.g. Alex Morgan"
                    className="clay-input mt-1.5 w-full p-3 font-normal"
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm font-semibold text-[#1d322c]">
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  className="clay-input mt-1.5 w-full p-3 font-normal"
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold text-[#1d322c]">
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  maxLength={128}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  className="clay-input mt-1.5 w-full p-3 font-normal"
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-[#c47972] bg-[#faecea] px-3.5 py-2.5 text-sm text-[#8c2d25]">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="clay-button inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white"
                >
                  {busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                {auth0Enabled && (
                  <a
                    className="clay-secondary-button inline-flex items-center px-4 py-3 text-sm font-semibold"
                    href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
                  >
                    Continue with SSO
                  </a>
                )}
              </div>
            </form>

            <div className="mt-6 flex flex-wrap gap-4 border-t border-[#d4dccb] pt-5 text-sm text-[#4e5f56]">
              <Link className="inline-flex min-h-[44px] items-center font-semibold text-[#235347] hover:underline" href="/analyze">
                Analyze JD + resume first
              </Link>
              <Link className="inline-flex min-h-[44px] items-center font-medium text-[#1d322c] hover:underline" href="/">
                Start guided wizard
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
