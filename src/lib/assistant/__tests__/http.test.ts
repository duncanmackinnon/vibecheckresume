/** @jest-environment node */
import { boundedBody, parseJson } from '../http';

it('rejects oversized chunked bodies even without Content-Length', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } });
  const request = new Request('https://tracker.example/mcp', { method: 'POST', body, duplex: 'half' } as RequestInit);
  await expect(boundedBody(request, 10)).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
});

it('counts UTF-8 bytes and preserves valid JSON across chunks', async () => {
  const request = new Request('https://tracker.example', { method: 'POST', body: '{"message":"✓"}' });
  expect(parseJson(await boundedBody(request, 30))).toEqual({ message: '✓' });
  expect(() => parseJson('{oops')).toThrow('valid JSON');
});
