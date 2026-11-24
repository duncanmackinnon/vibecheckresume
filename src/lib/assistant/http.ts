import { TrackerError } from '@/lib/tracker/errors';

/** Content-Length is advisory; count actual bytes and cancel before unbounded buffering. */
export async function boundedBody(request: Request, maximumBytes: number): Promise<string> {
  if (Number(request.headers.get('content-length') || 0) > maximumBytes) throw new TrackerError('This request is too large.', 413);
  if (!request.body) throw new TrackerError('A JSON request body is required.', 400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new TrackerError('This request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new TrackerError('This request must contain valid UTF-8 JSON.', 400); }
}

export function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new TrackerError('This request must contain valid JSON.', 400); }
}
