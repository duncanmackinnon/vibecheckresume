import { requireUser } from '@/lib/tracker/auth';
import { assertSameOrigin, jsonError, readJson } from '@/lib/tracker/http';
import { executeResumeAction, importLegacyResume, listResumeSummaries, listResumeWorkspace, resumeActionSchemas, uploadResume, type ResumeAction } from '@/lib/resume-workspace/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const args = resumeActionSchemas.list_resumes.parse({ applicationId: new URL(request.url).searchParams.get('applicationId') || undefined });
    const data = args.applicationId ? await listResumeWorkspace(user.id, args.applicationId) : await listResumeSummaries(user.id);
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      if (Number(request.headers.get('content-length') || 0) > 9 * 1024 * 1024) return Response.json({ error: 'Upload a resume up to 8 MB.' }, { status: 413 });
      const reader = request.body?.getReader();
      if (!reader) return Response.json({ error: 'Choose a PDF or TXT resume.' }, { status: 400 });
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 9 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: 'Upload a resume up to 8 MB.' }, { status: 413 }); } chunks.push(chunk.value); }
      const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
      const file = form.get('resume');
      if (!(file instanceof File)) return Response.json({ error: 'Choose a PDF or TXT resume.' }, { status: 400 });
      const record = await uploadResume(user.id, file, String(form.get('idempotencyKey') || ''));
      return Response.json({ ...record, data: { ...record.data, text: '', storagePath: '' } }, { status: 201 });
    }
    const body = await readJson(request);
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') return Response.json({ error: 'Choose a resume action.' }, { status: 400 });
    if (body.action === 'import_legacy') return Response.json(await importLegacyResume(user.id, body.input));
    if (!Object.hasOwn(resumeActionSchemas, body.action)) return Response.json({ error: 'Unknown resume action.' }, { status: 400 });
    const result = await executeResumeAction(user.id, body.action as ResumeAction, body.input);
    return Response.json(result, { status: ['analyze_resume', 'generate_resume', 'retry_ai_job'].includes(body.action) ? 202 : 200 });
  } catch (error) { return jsonError(error); }
}
