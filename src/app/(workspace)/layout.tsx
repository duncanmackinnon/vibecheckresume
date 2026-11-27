import WorkspaceShell from '@/components/tracker/WorkspaceShell';
import WorkspaceAccess from '@/components/auth/WorkspaceAccess';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth0 } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
import { assertEmailVerified, safeReturnTo } from '@/lib/tracker/access';
import { getNativeSessionUser } from '@/lib/tracker/native-auth';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const returnTo = safeReturnTo(requestHeaders.get('x-vibecheck-path'), '/dashboard');
  const caps = capabilities();
  if (!caps.auth) return <WorkspaceAccess kind="setup" returnTo={returnTo} />;

  let nativeUser = null;
  try {
    nativeUser = await getNativeSessionUser();
  } catch {
    return <WorkspaceAccess kind="unavailable" returnTo={returnTo} />;
  }
  if (nativeUser) return <WorkspaceShell>{children}</WorkspaceShell>;

  if (!(caps.auth0 ?? caps.auth)) {
    redirect(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
  }

  let session;
  try {
    session = await getAuth0().getSession();
  } catch {
    return <WorkspaceAccess kind="unavailable" returnTo={returnTo} />;
  }
  if (!session?.user?.sub) redirect(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
  if (!assertEmailVerified(session.user)) redirect('/verify-email');
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
