'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, LockKeyhole, LogOut } from 'lucide-react';
import { useTracker } from './TrackerProvider';
import { PageHeading, Panel } from './ui';
import Link from './TrackerLink';
import { clearOnboardingSession } from '@/lib/onboarding/session';

export default function Settings() {
  const { snapshot } = useTracker();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!snapshot) return null;

  const services = [
    { name: 'PostgreSQL database', ready: snapshot.capabilities.database },
    { name: 'Account sign-in', ready: snapshot.capabilities.auth },
    { name: 'Resume storage', ready: snapshot.capabilities.storage || snapshot.capabilities.database },
    { name: 'Resume intelligence · DeepSeek', ready: snapshot.capabilities.deepseek },
  ];

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
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your workspace, your way."
        description="Manage your profile, account, and workspace services."
      />
      <div className="vc-settings-grid">
        <div className="vc-settings-stack">
          <Panel title="Your search preferences">
            <p className="vc-setting-intro">Your name, resume, and preferred roles shape your job portal.</p>
            <div className="vc-settings-actions">
              <Link href="/onboarding?edit=preferences" className="vc-button vc-secondary">
                Edit profile &amp; preferences
                <ArrowUpRight size={13} />
              </Link>
              <Link href="/onboarding?edit=resume" className="vc-text-link">
                Change starting resume
              </Link>
            </div>
          </Panel>

          <Panel title="Your account" action={<LockKeyhole size={18} className="vc-muted" />}>
            <dl className="vc-details-list">
              <div>
                <dt>Workspace</dt>
                <dd>Private · Individual</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{snapshot.user.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{snapshot.user.email}</dd>
              </div>
            </dl>
            <div className="vc-settings-actions" style={{ marginTop: 18 }}>
              <button type="button" onClick={() => void signOut()} disabled={signingOut} className="vc-button vc-secondary">
                <LogOut size={14} />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </Panel>
        </div>

        <aside className="vc-settings-stack">
          <Panel title="Everything in its place" subtitle="The services behind your workspace.">
            {services.map((service) => (
              <div className="vc-status-row" key={service.name}>
                <span>{service.name}</span>
                <span className={service.ready ? 'is-ready' : ''}>{service.ready ? 'Ready' : 'Needs setup'}</span>
              </div>
            ))}
            {services.some((service) => !service.ready) && (
              <p className="vc-help-text">
                Missing connections need to be configured in deployment environment variables. Application tracking works independently.
              </p>
            )}
          </Panel>

          <section className="vc-assistant-card">
            <span className="vc-assistant-orb">
              <Check size={27} />
            </span>
            <h2>
              A space that’s
              <br />
              <em>just for you.</em>
            </h2>
            <p>
              Your saved applications, fit analyses, and tailored resumes belong strictly to your account in PostgreSQL.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
