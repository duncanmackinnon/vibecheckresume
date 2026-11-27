import { z } from 'zod';
import { jsonError, readJson } from '@/lib/tracker/http';
import { checkAuthRateLimit, registerNativeUser, sessionCookieHeader } from '@/lib/tracker/native-auth';

export const runtime = 'nodejs';

const SignupSchema = z.object({
  email: z.string().email('Enter a valid email address.').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  try {
    checkAuthRateLimit(request, 'signup');
    const body = SignupSchema.parse(await readJson(request));
    const user = await registerNativeUser(body);
    return Response.json(
      { user },
      {
        status: 201,
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
