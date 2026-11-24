import WorkspaceShell from '@/components/tracker/WorkspaceShell';
import WorkspaceAccess from '@/components/auth/WorkspaceAccess';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth0 } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
import { assertEmailVerified, safeReturnTo } from '@/lib/tracker/access';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  if (requestHeaders.get('x-vibecheck-preview') === '1') return <WorkspaceShell>{children}</WorkspaceShell>;
  const returnTo = safeReturnTo(requestHeaders.get('x-vibecheck-path'), '/dashboard');
  if (!capabilities().auth) return <WorkspaceAccess kind="setup" returnTo={returnTo}/>;
  let session;
  try { session = await getAuth0().getSession(); }
  catch { return <WorkspaceAccess kind="unavailable" returnTo={returnTo}/>; }
  if (!session?.user?.sub) redirect(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
  if (!assertEmailVerified(session.user)) redirect('/verify-email');
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
