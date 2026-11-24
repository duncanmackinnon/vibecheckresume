/** @jest-environment node */
import { POST } from '../analyze/route';
test('retired anonymous analysis cannot consume provider credits', async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ code: 'MOVED_TO_WORKSPACE', href: '/applications' });
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
});
