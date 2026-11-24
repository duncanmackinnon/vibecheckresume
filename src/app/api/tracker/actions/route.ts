import { requireUser } from '@/lib/tracker/auth';
import { executeAction } from '@/lib/tracker/service';
import { actionRequestSchema } from '@/lib/tracker/schemas';
import { jsonError,readJson } from '@/lib/tracker/http';
export const runtime='nodejs';
export async function POST(request:Request) { try {const user=await requireUser(request);const body=actionRequestSchema.parse(await readJson(request));return Response.json({result:await executeAction(user.id,body.action,body.input,body.idempotencyKey)});}catch(error){return jsonError(error);} }
