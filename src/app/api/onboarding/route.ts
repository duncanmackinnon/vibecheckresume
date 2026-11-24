import { requireUser } from '@/lib/tracker/auth';
import { capabilities } from '@/lib/tracker/config';
import { jsonError, readJson } from '@/lib/tracker/http';
import { TrackerError } from '@/lib/tracker/errors';
import { onboardingState, saveOnboarding } from '@/lib/onboarding/service';
import { syncDiscoverySchedule } from '@/lib/discovery/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = {'Cache-Control': 'private, no-store'};
export async function GET(request: Request) {
  const available = capabilities();
  try {
    if (!available.auth) return Response.json({authenticated: false, userId:null, draft:null, profile: null, connection: null, capabilities: available}, {headers});
    const user = await requireUser(request);
    const state = await onboardingState(user.id);
    return Response.json({authenticated: true, ...state, capabilities: available}, {headers});
  } catch (error) {
    if (error instanceof TrackerError && error.status === 401) return Response.json({authenticated: false, userId:null, draft:null, profile: null, connection: null, capabilities: available}, {headers});
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await readJson(request);
    const result = await saveOnboarding(user.id, body);
    // A scheduler outage must not turn a successfully saved profile into an apparent failed save.
    if (body.action === 'save_profile') {
      try { return Response.json({...result, schedule: await syncDiscoverySchedule(user.id)}, {headers}); }
      catch { return Response.json({...result, schedule: null, scheduleError: 'Your profile was saved. Scheduled searches could not be updated; restart them from Discover.'}, {headers}); }
    }
    return Response.json(result, {headers});
  } catch (error) { return jsonError(error); }
}
