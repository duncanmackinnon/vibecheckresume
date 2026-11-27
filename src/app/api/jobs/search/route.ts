import { z } from 'zod';
import { searchFreeJobs } from '@/lib/discovery/free-sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const list = (max: number) => z.string().max(200).optional().transform(value => (value || '').split(',').map(part => part.trim()).filter(Boolean).slice(0, max));
const querySchema = z.object({
  roles: z.string().trim().min(2, 'Add the roles you are looking for.').max(2000),
  locations: z.string().trim().max(1000).optional().default(''),
  modes: list(3),
  types: list(4),
});

/** Free job search over public feeds. No account, API key, or AI service involved. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || 'Check your search.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const { roles, locations, modes, types } = parsed.data;
  const result = await searchFreeJobs({ roles, locations, workModes: modes, employmentTypes: types });
  if (!result.sources.some(source => source.ok)) {
    return Response.json({ error: 'The free job feeds could not be reached right now. Try again in a few minutes, or add a job manually.', ...result }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
