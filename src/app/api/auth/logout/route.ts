import { assertSameOrigin, jsonError } from '@/lib/tracker/http';
import { clearedSessionCookieHeader } from '@/lib/tracker/native-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return Response.json(
      { signedOut: true },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': clearedSessionCookieHeader(request),
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
