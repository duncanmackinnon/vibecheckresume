import WorkspaceAccess from '@/components/auth/WorkspaceAccess';
import { safeReturnTo } from '@/lib/tracker/access';
import { capabilities } from '@/lib/tracker/config';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; reason?: string; mode?: string; adopt?: string }>;
}) {
  const params = await searchParams;
  const caps = capabilities();
  const kind = !caps.auth ? 'setup' : params.reason === 'callback' ? 'callback' : 'signin';
  return (
    <WorkspaceAccess
      kind={kind}
      returnTo={safeReturnTo(params.returnTo, '/dashboard')}
      initialMode={params.mode === 'signup' ? 'signup' : 'signin'}
      adoptPendingBundle={params.adopt === '1'}
      auth0Enabled={Boolean(caps.auth0)}
    />
  );
}
