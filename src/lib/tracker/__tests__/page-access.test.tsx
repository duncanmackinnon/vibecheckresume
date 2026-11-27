/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/proxy';
import WorkspaceLayout from '@/app/(workspace)/layout';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { capabilities } from '../config';

const mockSession = jest.fn();
const mockMiddleware = jest.fn();
const mockNativeSession = jest.fn();

jest.mock('../auth', () => ({ getAuth0: () => ({ getSession: mockSession, middleware: mockMiddleware }) }));
jest.mock('../native-auth', () => ({
  getNativeSessionUser: () => mockNativeSession(),
  readCookieFromRequest: jest.fn(() => null),
  clearedSessionCookieHeader: jest.fn(() => 'vc_session=; Path=/; Max-Age=0'),
}));
jest.mock('../config', () => ({ capabilities: jest.fn() }));
jest.mock('next/headers', () => ({ headers: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn((url: string) => { throw new Error(url); }) }));
jest.mock('@/components/tracker/WorkspaceShell', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/auth/WorkspaceAccess', () => ({ __esModule: true, default: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(capabilities).mockReturnValue({ auth: true, auth0: true, database: true, storage: false, deepseek: false, openai: false });
  jest.mocked(headers).mockResolvedValue(new Headers({ 'x-vibecheck-path': '/applications/a' }) as Awaited<ReturnType<typeof headers>>);
  mockMiddleware.mockResolvedValue(NextResponse.next());
  mockNativeSession.mockResolvedValue(null);
});

test('proxy overwrites forged return-path headers and ignores legacy preview parameter', async () => {
  const response = await proxy(new NextRequest('https://tracker.example/applications?preview=1', { headers: { 'x-vibecheck-path': 'https://evil.example' } }));
  expect(response.headers.get('x-middleware-request-x-vibecheck-preview')).toBeNull();
  expect(response.headers.get('x-middleware-request-x-vibecheck-path')).toBe('/applications?preview=1');
});

test('private pages require a native or Auth0 session and preserve deep links', async () => {
  mockSession.mockResolvedValue(null);
  await expect(WorkspaceLayout({ children: null })).rejects.toThrow('/signin?returnTo=%2Fapplications%2Fa');
  expect(redirect).toHaveBeenCalled();

  jest.mocked(capabilities).mockReturnValue({ auth: true, auth0: false, database: true, storage: false, deepseek: false, openai: false });
  mockNativeSession.mockResolvedValueOnce({ id: 'u1', email: 'u@example.test', name: 'User' });
  const authed = await WorkspaceLayout({ children: null });
  expect(authed.type).toBeDefined();
});

test('expired provider and unverified identities cannot render workspace children', async () => {
  mockSession.mockRejectedValueOnce(new Error('outage'));
  expect((await WorkspaceLayout({ children: null })).props.kind).toBe('unavailable');
  mockSession.mockResolvedValue({ user: { sub: 'auth0|a', email_verified: false } });
  await expect(WorkspaceLayout({ children: null })).rejects.toThrow('/verify-email');
});

test('unconfigured accounts render setup guidance instead of a local or preview shell', async () => {
  jest.mocked(capabilities).mockReturnValue({ auth: false, auth0: false, database: false, storage: false, deepseek: false, openai: false });
  const view = await WorkspaceLayout({ children: null });
  expect(view.props.kind).toBe('setup');
  expect(view.props.local).toBeUndefined();
  expect(mockSession).not.toHaveBeenCalled();
});
