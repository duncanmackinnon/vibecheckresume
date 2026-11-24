/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/proxy';
import WorkspaceLayout from '@/app/(workspace)/layout';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { capabilities } from '../config';
const mockSession=jest.fn();
const mockMiddleware=jest.fn();
jest.mock('../auth',()=>({getAuth0:()=>({getSession:mockSession,middleware:mockMiddleware})}));
jest.mock('../config',()=>({capabilities:jest.fn()}));
jest.mock('next/headers',()=>({headers:jest.fn()}));
jest.mock('next/navigation',()=>({redirect:jest.fn((url:string)=>{throw new Error(url);})}));
jest.mock('@/components/tracker/WorkspaceShell',()=>({__esModule:true,default:()=>null}));
jest.mock('@/components/auth/WorkspaceAccess',()=>({__esModule:true,default:()=>null}));
beforeEach(()=>{
  jest.clearAllMocks();
  jest.mocked(capabilities).mockReturnValue({auth:true,database:true,storage:false,deepseek:false,openai:false});
  jest.mocked(headers).mockResolvedValue(new Headers({'x-vibecheck-preview':'0','x-vibecheck-path':'/applications/a'}) as Awaited<ReturnType<typeof headers>>);
  mockMiddleware.mockResolvedValue(NextResponse.next());
});
test('proxy overwrites forged sample and return-path headers',async()=>{
  const response=await proxy(new NextRequest('https://tracker.example/applications',{headers:{'x-vibecheck-preview':'1','x-vibecheck-path':'https://evil.example'}}));
  expect(response.headers.get('x-middleware-request-x-vibecheck-preview')).toBe('0');
  expect(response.headers.get('x-middleware-request-x-vibecheck-path')).toBe('/applications');
  const preview=await proxy(new NextRequest('https://tracker.example/dashboard?preview=1'));
  expect(preview.headers.get('x-middleware-request-x-vibecheck-preview')).toBe('1');
});
test('private pages require a session and preserve deep links',async()=>{
  mockSession.mockResolvedValue(null);
  await expect(WorkspaceLayout({children:null})).rejects.toThrow('/signin?returnTo=%2Fapplications%2Fa');
  expect(redirect).toHaveBeenCalled();
});
test('expired provider and unverified identities cannot render workspace children',async()=>{
  mockSession.mockRejectedValueOnce(new Error('outage'));
  expect((await WorkspaceLayout({children:null})).props.kind).toBe('unavailable');
  mockSession.mockResolvedValue({user:{sub:'auth0|a',email_verified:false}});
  await expect(WorkspaceLayout({children:null})).rejects.toThrow('/verify-email');
});
test('unconfigured accounts show setup; explicit preview does not read a session',async()=>{
  jest.mocked(capabilities).mockReturnValue({auth:false,database:false,storage:false,deepseek:false,openai:false});
  expect((await WorkspaceLayout({children:null})).props.kind).toBe('setup');
  jest.mocked(headers).mockResolvedValue(new Headers({'x-vibecheck-preview':'1'}) as Awaited<ReturnType<typeof headers>>);
  await WorkspaceLayout({children:null});
  expect(mockSession).not.toHaveBeenCalled();
});
