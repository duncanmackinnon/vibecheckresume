'use client';

import Link from './TrackerLink';
import { usePathname, useRouter } from 'next/navigation';
import { BriefcaseBusiness, CheckCheck, Compass, FileSearch, FileText, LayoutDashboard, LogOut, RefreshCw, Settings } from 'lucide-react';
import { Toaster } from 'sonner';
import { useEffect, useState, type ReactNode } from 'react';
import { TrackerProvider, useTracker } from './TrackerProvider';
import { initials } from './ui';
import { clearOnboardingSession } from '@/lib/onboarding/session';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/applications', label: 'Applications', icon: BriefcaseBusiness },
  { href: '/tasks', label: 'Tasks', icon: CheckCheck },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/analyze', label: 'Analyze JD', icon: FileSearch },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const keyboard = () => {
      document.documentElement.dataset.vcInput = 'keyboard';
    };
    const pointer = () => {
      document.documentElement.dataset.vcInput = 'pointer';
    };
    window.addEventListener('keydown', keyboard);
    window.addEventListener('pointerdown', pointer);
    return () => {
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('pointerdown', pointer);
    };
  }, []);

  const { snapshot, loading, error, refreshing, refresh } = useTracker();
  const active = snapshot?.applications.filter((app) => !app.archived).length ?? 0;
  const name = snapshot?.user.name.trim() || 'Your';
  const portalTitle = name === 'Your' ? 'Your job portal' : `${name}’s job portal`;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    clearOnboardingSession();
    try {
      if (snapshot?.capabilities.auth0) {
        router.push('/auth/logout');
        return;
      }
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/signin');
      router.refresh();
    }
  }

  return (
    <div className="vc-workspace vc-portal">
      <a className="vc-skip-link" href="#workspace-content">
        Skip to content
      </a>
      <header className="vc-portal-header">
        <div className="vc-portal-heading">
          <Link href="/dashboard" className="vc-portal-brand">
            vibecheck<span>.</span>
          </Link>
          <div className="vc-portal-divider" />
          <Link href="/dashboard" className="vc-portal-title">
            {portalTitle}
          </Link>
        </div>
        <div className="vc-portal-account">
          <span className="vc-portal-status">
            <span className={`vc-connection-dot ${snapshot ? 'is-live' : ''}`} />
            {loading ? 'Opening workspace' : 'Private workspace'}
          </span>
          <button
            type="button"
            className="vc-icon-button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh workspace"
          >
            <RefreshCw size={15} />
          </button>
          <Link href="/onboarding" className="vc-portal-avatar" aria-label="Your profile and search preferences">
            {initials(name)}
          </Link>
          {snapshot && (
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="vc-icon-button"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>
      <nav className="vc-portal-tabs" aria-label="Workspace navigation">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname.startsWith(href) ? 'page' : undefined}
            className={`vc-portal-tab ${pathname.startsWith(href) ? 'is-active' : ''}`}
          >
            <Icon size={16} strokeWidth={1.7} />
            {label}
            {href === '/applications' && active > 0 && <span className="vc-portal-count">{active}</span>}
          </Link>
        ))}
      </nav>
      <div className="vc-main">
        {error && (
          <div className="vc-error-banner" role="alert">
            {error}
            <button type="button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        <main id="workspace-content" className="vc-content">
          {loading ? (
            <div className="vc-loading" role="status">
              <LayoutDashboard size={26} />
              <h2>Opening your job portal.</h2>
              <p>Everything for your next step, together.</p>
            </div>
          ) : !snapshot ? (
            <div className="vc-loading">
              <h2>Open your private workspace</h2>
              <p>{error || 'Sign in to see your saved applications.'}</p>
              <Link href="/signin" className="vc-button vc-primary">
                Sign in
              </Link>
              <button type="button" className="vc-button vc-secondary" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="vc-workspace-footer">
          <span>Your next chapter, at your pace.</span>
          <Link href="/onboarding">Search preferences</Link>
        </footer>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <TrackerProvider>
      <Shell>{children}</Shell>
    </TrackerProvider>
  );
}
