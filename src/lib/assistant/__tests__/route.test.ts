/** @jest-environment node */
import { POST } from '@/app/api/assistant/route';
import { requireUser } from '@/lib/tracker/auth';
import { assistantResponse } from '../service';

jest.mock('@/lib/tracker/auth', () => ({ requireUser: jest.fn().mockResolvedValue({ id: 'owned-user' }) }));
jest.mock('../service', () => ({ assistantRequestSchema: { parse: (value: unknown) => value }, assistantResponse: jest.fn().mockImplementation(() => new Response('stream')) }));
jest.mock('../tools', () => ({ publicError: (cause: Error) => cause.message }));

describe('assistant cookie request origin protection', () => {
  const previousUrl = process.env.APP_BASE_URL;
  beforeEach(() => { jest.clearAllMocks(); process.env.APP_BASE_URL = 'https://tracker.example'; });
  afterAll(() => { if (previousUrl === undefined) Reflect.deleteProperty(process.env, 'APP_BASE_URL'); else process.env.APP_BASE_URL = previousUrl; });

  it.each([{ Origin: 'https://unrelated.example' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[])('rejects cross-site changes before opening the assistant stream', async headers => {
    const response = await POST(new Request('https://tracker.example/api/assistant', { method: 'POST', headers, body: '{}' }));
    expect(response.status).toBe(403);
    expect(requireUser).not.toHaveBeenCalled(); expect(assistantResponse).not.toHaveBeenCalled();
  });

  it('uses the configured public origin behind a hosting proxy', async () => {
    const response = await POST(new Request('http://internal-host/api/assistant', { method: 'POST', headers: { Origin: 'https://tracker.example', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: '{"message":"Hello"}' }));
    expect(response.status).toBe(200); expect(assistantResponse).toHaveBeenCalledWith('owned-user', { message: 'Hello' }, expect.anything());
  });
});
