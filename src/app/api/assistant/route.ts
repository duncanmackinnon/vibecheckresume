import { z } from 'zod';
import { requireUser } from '@/lib/tracker/auth';
import { assertSameOrigin } from '@/lib/tracker/http';
import { assistantRequestSchema, assistantResponse, conversationMessages, listConversations } from '@/lib/assistant/service';
import { publicError } from '@/lib/assistant/tools';
import { boundedBody, parseJson } from '@/lib/assistant/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function failure(cause: unknown) {
  const status = cause instanceof z.ZodError ? 400 : cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 500;
  return Response.json({ error: publicError(cause) }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request); const query = new URL(request.url).searchParams;
    const conversationId = query.get('conversationId'); const applicationId = query.get('applicationId');
    if (conversationId) return Response.json({ messages: await conversationMessages(user.id, z.string().uuid().parse(conversationId)) }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ configured: Boolean(process.env.OPENAI_API_KEY), conversations: await listConversations(user.id, applicationId ? z.string().uuid().parse(applicationId) : undefined) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { return failure(cause); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const raw = await boundedBody(request, 40000);
    return await assistantResponse(user.id, assistantRequestSchema.parse(parseJson(raw)), request.signal);
  } catch (cause) { return failure(cause); }
}
