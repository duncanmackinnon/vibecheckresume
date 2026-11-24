import WorkspaceAccess from '@/components/auth/WorkspaceAccess';
import { safeReturnTo } from '@/lib/tracker/access';
import { capabilities } from '@/lib/tracker/config';
export default async function SignInPage({searchParams}: {searchParams:Promise<{returnTo?:string;reason?:string}>}) {
  const params = await searchParams;
  const kind = !capabilities().auth ? 'setup' : params.reason === 'callback' ? 'callback' : 'signin';
  return <WorkspaceAccess kind={kind} returnTo={safeReturnTo(params.returnTo)}/>;
}
