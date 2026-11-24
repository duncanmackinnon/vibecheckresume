/** @jest-environment node */
import { GET, POST } from '@/app/api/onboarding/route';
import { GET as download } from '@/app/api/resumes/[id]/route';
import { requireUser } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
import { getRecord } from '@/lib/tracker/store';
import { onboardingState, saveOnboarding } from '../service';
import { syncDiscoverySchedule } from '@/lib/discovery/schedule';
import { TrackerError } from '@/lib/tracker/errors';
import { resumeDownloadLink } from '@/lib/resume-workspace/service';

jest.mock('@/lib/tracker/auth', () => ({requireUser: jest.fn()}));
jest.mock('@/lib/tracker/config', () => ({capabilities: jest.fn(), appBaseUrl: () => 'https://tracker.example'}));
jest.mock('@/lib/tracker/store', () => ({getRecord: jest.fn()}));
jest.mock('../service', () => ({onboardingState: jest.fn(), saveOnboarding: jest.fn()}));
jest.mock('@/lib/discovery/schedule', () => ({syncDiscoverySchedule: jest.fn()}));
jest.mock('@/lib/resume-workspace/service', () => ({resumeDownloadLink: jest.fn(), executeResumeAction: jest.fn()}));

const id = 'a0000000-0000-4000-8000-000000000001';
const request = (origin = 'https://tracker.example') => new Request('https://tracker.example/api/onboarding', {method:'POST', headers:{'Content-Type':'application/json', Origin:origin}, body:JSON.stringify({action:'save_profile'})});
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireUser).mockResolvedValue({id, name:'Alex', email:'alex@example.test'});
  jest.mocked(capabilities).mockReturnValue({auth:true, database:true, storage:false, deepseek:false, openai:false});
});

test('unconfigured onboarding is an honest anonymous draft, without touching storage', async () => {
  jest.mocked(capabilities).mockReturnValue({auth:false, database:false, storage:false, deepseek:false, openai:false});
  expect(await (await GET(new Request('https://tracker.example/api/onboarding'))).json()).toMatchObject({authenticated:false, profile:null});
  expect(requireUser).not.toHaveBeenCalled(); expect(onboardingState).not.toHaveBeenCalled();
});
test('authenticated setup loads the workspace without a subscription connection',async()=>{
  jest.mocked(onboardingState).mockResolvedValue({userId:id,profile:null,draft:null,connection:{enabled:true,lastUsedAt:null}});
  const response=await GET(new Request('https://tracker.example/api/onboarding'));
  expect(await response.json()).toMatchObject({authenticated:true,userId:id,profile:null,draft:null});
});
test('sign-in and same-origin checks protect profile writes', async () => {
  jest.mocked(requireUser).mockRejectedValueOnce(new TrackerError('Sign in.', 401));
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request('https://foreign.example'))).status).toBe(403);
  expect(saveOnboarding).not.toHaveBeenCalled();
});
test('a scheduler outage reports a saved profile with an actionable warning', async () => {
  jest.mocked(saveOnboarding).mockResolvedValue({profile:{id, data:{displayName:'Alex'}}} as never);
  jest.mocked(syncDiscoverySchedule).mockRejectedValue(new Error('internal connection string'));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({profile:{id}, schedule:null, scheduleError:expect.stringContaining('restart')});
  expect(saveOnboarding).toHaveBeenCalledWith(id, {action:'save_profile'});
});
test('generated source downloads remain private and work without Storage', async () => {
  jest.mocked(getRecord).mockResolvedValue({data:{origin:'builder', storagePath:'', text:'Alex\nTypeScript', filename:'Alex resume.txt'}} as never);
  const response = await download(new Request(`https://tracker.example/api/resumes/${id}?download=1`), {params:Promise.resolve({id})});
  expect(response.status).toBe(200); expect(await response.text()).toContain('TypeScript');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Content-Disposition')).toContain('Alex%20resume.txt');
  expect(getRecord).toHaveBeenCalledWith(id, 'source_resume', id);
  expect(resumeDownloadLink).not.toHaveBeenCalled();
});
test('foreign source downloads and malformed document IDs return no contents', async () => {
  jest.mocked(getRecord).mockRejectedValue(new TrackerError('Not found.', 404));
  const foreign = await download(new Request(`https://tracker.example/api/resumes/${id}?download=1`), {params:Promise.resolve({id})});
  expect(foreign.status).toBe(404);
  const malformed = await download(new Request('https://tracker.example/api/resumes/nope?download=1'), {params:Promise.resolve({id:'nope'})});
  expect(malformed.status).toBe(400); expect(resumeDownloadLink).not.toHaveBeenCalled();
});
