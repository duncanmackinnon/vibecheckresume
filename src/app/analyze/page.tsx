import Link from 'next/link';
import SessionResumeStudio from '@/components/resume-workspace/SessionResumeStudio';
import { getOptionalUser } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
import { listResumeSummaries } from '@/lib/resume-workspace/service';

export const dynamic = 'force-dynamic';

export default async function AnalyzePage() {
  const user = await getOptionalUser();
  const caps = capabilities();
  let savedSources: Array<{ id: string; filename: string; origin?: 'builder' }> = [];

  if (user && caps.database) {
    try {
      const summaries = await listResumeSummaries(user.id);
      savedSources = summaries.sources.map((item) => ({
        id: item.id,
        filename: item.data.filename,
        origin: item.data.origin,
      }));
    } catch {
      savedSources = [];
    }
  }

  return (
    <div className="ob-root overflow-x-hidden">
      <header className="ob-header">
        <Link href="/" className="ob-brand">
          vibecheck<span>.</span>
        </Link>
        <div className="ob-header-actions">
          <Link href="/onboarding">Guided setup</Link>
          {user ? (
            <Link href="/dashboard">Open job tracker</Link>
          ) : (
            <Link href="/signin">Sign in</Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl min-w-0 px-4 py-8 sm:px-6">
        <SessionResumeStudio
          mode="library"
          signedIn={Boolean(user)}
          aiConfigured={caps.deepseek}
          savedSources={savedSources}
        />
      </main>
    </div>
  );
}
