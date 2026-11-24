import { requireUser } from '@/lib/tracker/auth';
import { jsonError } from '@/lib/tracker/http';
import { resumeDownloadLink, executeResumeAction } from '@/lib/resume-workspace/service';
import { getRecord } from '@/lib/tracker/store';
import type { SourceResumeData } from '@/lib/tracker/types';
import { resumeIdSchema } from '@/lib/resume-workspace/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const url = new URL(request.url);
    if (url.searchParams.get('download') === '1') {
      const source = await getRecord<SourceResumeData>(user.id, 'source_resume', resumeIdSchema.parse(id));
      if (source.data.origin === 'builder' && !source.data.storagePath) {
        return new Response(source.data.text, {headers: {
          'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `attachment; filename="resume.txt"; filename*=UTF-8''${encodeURIComponent(source.data.filename)}`,
        }});
      }
      return new Response(null, { status: 302, headers: { Location: await resumeDownloadLink(user.id, id), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    return Response.json(await executeResumeAction(user.id, 'get_resume', { id, kind: url.searchParams.get('kind') || 'resume_version' }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
