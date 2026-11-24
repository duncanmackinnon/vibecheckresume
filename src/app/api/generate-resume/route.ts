/** Legacy anonymous endpoint. Generation now creates a saved, immutable version. */
export async function POST() {
  return Response.json({ error: 'Open an application in the tracker to generate a saved resume version.', code: 'MOVED_TO_WORKSPACE', href: '/applications' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
