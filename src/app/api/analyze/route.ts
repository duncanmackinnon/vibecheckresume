/** Legacy anonymous endpoint. Resume jobs now require an owned application. */
export async function POST() {
  return Response.json({ error: 'Open an application in the tracker to start a saved resume analysis.', code: 'MOVED_TO_WORKSPACE', href: '/applications' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
