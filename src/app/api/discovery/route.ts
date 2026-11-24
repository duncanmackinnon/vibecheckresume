import { z } from 'zod';
import { requireUser } from '@/lib/tracker/auth';
import { readJson, jsonError } from '@/lib/tracker/http';
import { discoveryOverview, executeDiscoveryAction, type DiscoveryAction } from '@/lib/discovery/service';
import { syncDiscoverySchedule } from '@/lib/discovery/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const actionSchema = z.object({ action: z.enum(['find_jobs', 'list_discovered_jobs', 'get_job_search', 'save_discovered_job', 'restart_schedule']), input: z.unknown().optional() }).strict();

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(await discoveryOverview(user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const body = actionSchema.parse(await readJson(request, 8000));
    const user = await requireUser(request);
    const result = body.action === 'restart_schedule' ? { schedule: await syncDiscoverySchedule(user.id, true) }
      : await executeDiscoveryAction(user.id, body.action as DiscoveryAction, body.input || {});
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
