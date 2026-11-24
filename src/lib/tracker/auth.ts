import { createHash } from 'node:crypto';
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { assertEmailVerified, safeReturnTo } from './access';
import { createRemoteJWKSet } from 'jose';
import { verifyMcpAccessToken, assertConnectionActive } from '@/lib/mcp/verify-token';
import { appBaseUrl, capabilities, mcpAudience } from './config';
import { TrackerError } from './errors';
import { createRecord, getUser, listRecords, saveUser, updateRecord, withOwnerTransaction } from './store';
import type { ConnectionData, User } from './types';
let auth0:Auth0Client|undefined;
export function authIssuer() { const domain=process.env.AUTH0_DOMAIN || ''; return `${domain.startsWith('https://')?domain:`https://${domain}`}`.replace(/\/$/,'')+'/'; }
export function getAuth0() {
  if(!capabilities().auth) throw new TrackerError('Sign-in is not configured for this deployment yet.',503,'AUTH_UNCONFIGURED');
  return auth0 ??= new Auth0Client({
    appBaseUrl:appBaseUrl(), authorizationParameters:{scope:'openid profile email'}, signInReturnToPath:'/onboarding',
    enableAccessTokenEndpoint: false,
    session:{rolling:true, absoluteDuration:7*86400, inactivityDuration:86400, cookie:{sameSite:'lax',secure:appBaseUrl().startsWith('https://'),path:'/'}},
    onCallback: async (error, context, session) => {
      const path = error ? '/signin?reason=callback' : !assertEmailVerified(session?.user || {}) ? '/verify-email' : safeReturnTo(context.returnTo);
      return NextResponse.redirect(new URL(path, appBaseUrl()));
    },
  });
}
export function identityId(issuer:string,subject:string) {
  const bytes=createHash('sha256').update(`${issuer}\0${subject}`).digest(); bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128;
  const hex=bytes.toString('hex').slice(0,32); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function userForIdentity(subject:string,claims:{email?:unknown;name?:unknown}, persist=true):Promise<User> {
  const issuer=authIssuer(); const user={id:identityId(issuer,subject),email:typeof claims.email==='string'?claims.email:'',name:typeof claims.name==='string'?claims.name:'Job seeker'};
  if(persist) await saveUser(user,issuer,subject); return user;
}
export async function requireUser(_request?:Request):Promise<User> {
  const session=await getAuth0().getSession();
  if(!session?.user?.sub) throw new TrackerError('Sign in to access your workspace.',401,'UNAUTHENTICATED');
  if (!assertEmailVerified(session.user)) throw new TrackerError('Verify your email address, then sign in again.',403,'EMAIL_UNVERIFIED');
  return userForIdentity(session.user.sub,session.user);
}
let jwks:ReturnType<typeof createRemoteJWKSet>|undefined;
export async function requireMcpUser(request:Request,requiredScopes:string[]):Promise<User> {
  if(!capabilities().auth) throw new TrackerError('Account linking is not configured.',503,'AUTH_UNCONFIGURED');
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token) throw new TrackerError('Connect your VibeCheck account.',401,'UNAUTHENTICATED');
  try {
    jwks ??= createRemoteJWKSet(new URL(`${authIssuer()}.well-known/jwks.json`));
    const payload=await verifyMcpAccessToken(token,{keys:jwks,issuer:authIssuer(),audience:mcpAudience(),requiredScopes});
    const user=await userForIdentity(payload.sub!,{email:payload.email,name:payload.name},false);
    await withOwnerTransaction(user.id,async()=>{
      const connections=await listRecords<ConnectionData>(user.id,'connection'); const existing=connections[0];
      assertConnectionActive(existing?.data,payload.iat!);
      // Do not overwrite the profile with access-token claims that may omit name/email.
      try { const saved=await getUser(user.id); Object.assign(user,saved); }
      catch(error) { if(error instanceof TrackerError && error.status===404 || error instanceof TrackerError && error.status===401) await saveUser(user,authIssuer(),payload.sub!); else throw error; }
      const data={enabled:true,lastUsedAt:new Date().toISOString(),revokedBefore:existing?.data.revokedBefore || null};
      if(existing) await updateRecord(user.id,'connection',existing.id,data,existing.version); else await createRecord(user.id,'connection',data);
    });
    return user;
  } catch(error) { if(error instanceof TrackerError) throw error; throw new TrackerError('Your connection expired or could not be verified. Reconnect your account.',401,'INVALID_TOKEN'); }
}
