/** @jest-environment node */
import { POST } from '../generate-resume/route';
test('retired anonymous generation requires the saved workspace flow', async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ code: 'MOVED_TO_WORKSPACE' });
});
