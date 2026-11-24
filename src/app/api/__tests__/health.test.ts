/** @jest-environment node */
import { GET, HEAD } from '../health/route';
import { databaseReadiness } from '@/lib/tracker/readiness';
import { capabilities } from '@/lib/tracker/config';
jest.mock('@/lib/tracker/readiness', () => ({ databaseReadiness: jest.fn() }));
jest.mock('@/lib/tracker/config', () => ({ capabilities: jest.fn() }));
beforeEach(() => {
  jest.mocked(capabilities).mockReturnValue({ database: true, auth: true, storage: true, deepseek: false, openai: false });
  jest.mocked(databaseReadiness).mockResolvedValue({ready:true,reason:'ready'});
});
test('tracking stays healthy when AI is unconfigured', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(databaseReadiness).toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ status: 'ok', features: { resumeAI: false, assistant: false } });
});
test('a failed database probe reports unready without leaking credentials', async () => {
  jest.mocked(databaseReadiness).mockResolvedValue({ready:false,reason:'unreachable'});
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('secret-password');
});
test('HEAD preserves readiness and has no response body', async () => {
  const response = await HEAD();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('');
});
