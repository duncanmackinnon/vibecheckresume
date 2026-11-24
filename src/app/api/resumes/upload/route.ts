import { requireUser } from '@/lib/tracker/auth';
import { jsonError, readJson } from '@/lib/tracker/http';
import { completeResumeUpload, prepareResumeUpload } from '@/lib/resume-workspace/service';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await readJson(request, 8192);
    if (body?.action === 'prepare') return Response.json(await prepareResumeUpload(user.id, body.input), { headers: { 'Cache-Control': 'no-store' } });
    if (body?.action === 'complete') {
      const record = await completeResumeUpload(user.id, body.input);
      return Response.json({ ...record, data: { ...record.data, text: '', storagePath: '' } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'Choose an upload action.' }, { status: 400 });
  } catch (error) { return jsonError(error); }
}
