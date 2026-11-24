import { NextResponse, type NextRequest } from 'next/server';
import { getAuth0 } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
export async function proxy(request:NextRequest) {
  const forwarded = new Headers(request.headers);
  // Always overwrite caller-supplied flags; only this proxy can authorize sample rendering.
  forwarded.set('x-vibecheck-preview', request.nextUrl.searchParams.get('preview') === '1' ? '1' : '0');
  forwarded.set('x-vibecheck-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if(!capabilities().auth) {
    if(request.nextUrl.pathname.startsWith('/auth/')) return NextResponse.redirect(new URL('/signin?reason=setup',request.url));
    return NextResponse.next({request:{headers:forwarded}});
  }
  const response = await getAuth0().middleware(request);
  if (request.nextUrl.pathname.startsWith('/auth/') || response.status !== 200) return response;
  const next = NextResponse.next({request:{headers:forwarded}});
  for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
  for (const [key,value] of response.headers) if (!key.startsWith('x-middleware-') && key !== 'set-cookie') next.headers.set(key,value);
  return next;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|mcp|api|\\.well-known).*)']};
