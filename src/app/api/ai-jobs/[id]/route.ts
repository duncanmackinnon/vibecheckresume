import { requireUser } from '@/lib/tracker/auth';
import { jsonError, readJson } from '@/lib/tracker/http';
import { executeResumeAction } from '@/lib/resume-workspace/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    return Response.json(await executeResumeAction(user.id, 'get_ai_job', { id: (await context.params).id }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const body = await readJson(request);
    return Response.json(await executeResumeAction(user.id, 'retry_ai_job', { id: (await context.params).id, expectedVersion: body.expectedVersion }), { status: 202 });
  } catch (error) { return jsonError(error); }
}
