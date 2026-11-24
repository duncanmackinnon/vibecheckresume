import { requireUser } from '@/lib/tracker/auth';
import { getSnapshot } from '@/lib/tracker/service';
import { jsonError } from '@/lib/tracker/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) { try {const user=await requireUser(request);return Response.json(await getSnapshot(user.id),{headers:{'Cache-Control':'no-store'}});}catch(error){return jsonError(error);} }
