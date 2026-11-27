import { NextResponse, type NextRequest } from 'next/server';
import { getAuth0 } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
import { clearedSessionCookieHeader, readCookieFromRequest } from '@/lib/tracker/native-auth';

export async function proxy(request: NextRequest) {
  const forwarded = new Headers(request.headers);
  forwarded.set('x-vibecheck-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const caps = capabilities();
  const useAuth0 = caps.auth0 ?? caps.auth;
  const isAuthLogout = request.nextUrl.pathname === '/auth/logout';
  const hasNativeCookie = Boolean(readCookieFromRequest(request));

  if (!useAuth0 || (isAuthLogout && hasNativeCookie)) {
    if (isAuthLogout) {
      const response = NextResponse.redirect(new URL('/', request.url));
      response.headers.set('Set-Cookie', clearedSessionCookieHeader(request));
      return response;
    }
    if (request.nextUrl.pathname.startsWith('/auth/')) {
      const target = caps.auth ? '/signin' : '/signin?reason=setup';
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next({ request: { headers: forwarded } });
  }

  const response = await getAuth0().middleware(request);
  if (request.nextUrl.pathname.startsWith('/auth/') || response.status !== 200) return response;
  const next = NextResponse.next({ request: { headers: forwarded } });
  for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
  for (const [key, value] of response.headers) {
    if (!key.startsWith('x-middleware-') && key !== 'set-cookie') next.headers.set(key, value);
  }
  return next;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|mcp|api|\\.well-known).*)'] };
