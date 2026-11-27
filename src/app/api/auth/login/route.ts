import { z } from 'zod';
import { jsonError, readJson } from '@/lib/tracker/http';
import { authenticateNativeUser, checkAuthRateLimit, sessionCookieHeader } from '@/lib/tracker/native-auth';

export const runtime = 'nodejs';

const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address.').max(254),
  password: z.string().min(1, 'Password is required.').max(128),
});

export async function POST(request: Request) {
  try {
    checkAuthRateLimit(request, 'login');
    const body = LoginSchema.parse(await readJson(request));
    const user = await authenticateNativeUser(body);
    return Response.json(
      { user },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': sessionCookieHeader(user, request),
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
