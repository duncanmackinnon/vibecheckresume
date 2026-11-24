import Link from 'next/link';

export default function WorkspaceAccess({kind='signin', returnTo='/onboarding'}: {kind?:'signin'|'setup'|'unavailable'|'callback';returnTo?:string}) {
  const unavailable = kind === 'setup' || kind === 'unavailable';
  return <main className="clay-shell"><section className="clay-panel mx-auto max-w-xl p-8 sm:p-12">
    <p className="clay-kicker">YOUR PRIVATE JOB PORTAL</p>
    <h1 className="mt-4 text-3xl font-semibold tracking-tight">{unavailable ? 'Your workspace is temporarily unavailable.' : 'Welcome to your next chapter.'}</h1>
    <p className="mt-4 text-sm leading-7 text-slate-600">{kind === 'setup' ? 'Account sign-in is awaiting service setup. You can explore the sample workspace while it is being connected.' : kind === 'unavailable' ? 'We could not open your account. Your saved records have not been replaced. Try again shortly.' : kind === 'callback' ? 'Sign-in could not be completed. Try again to open your private workspace.' : 'Sign in with Google or email to save applications, resumes, and your progress.'}</p>
    <div className="mt-7 flex flex-wrap gap-3">{!unavailable && <a className="clay-button px-5 py-3 font-semibold text-white" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</a>}{kind === 'unavailable' && <a className="clay-secondary-button px-5 py-3" href={returnTo}>Try again</a>}<Link className="clay-secondary-button px-5 py-3" href="/dashboard?preview=1">Explore a sample</Link><Link className="px-3 py-3 text-sm text-slate-600" href="/onboarding">Start my setup</Link></div>
  </section></main>;
}
