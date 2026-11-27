import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { appBaseUrl } from './config';
import { currentClient, withOwnerTransaction } from './db';
import { TrackerError } from './errors';
import { getUser, saveUser } from './store';
import type { User } from './types';

export const SESSION_COOKIE_NAME = 'vc_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const AUTH_RATE_WINDOW_MS = 60 * 1000;
const AUTH_RATE_LIMIT = 25;

interface SessionPayload {
  uid: string;
  email: string;
  exp: number;
}

const authRateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkAuthRateLimit(request: Request, action: string): void {
  if (process.env.NODE_ENV === 'test') return;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const key = `${action}:${forwarded || realIp || 'local'}`;
  const now = Date.now();
  if (authRateBuckets.size > 2000) authRateBuckets.clear();
  const entry = authRateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    authRateBuckets.set(key, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > AUTH_RATE_LIMIT) {
    throw new TrackerError('Too many authentication attempts. Please wait a minute and try again.', 429, 'RATE_LIMITED');
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function nativeUserId(email: string): string {
  const normalized = normalizeEmail(email);
  const bytes = createHash('sha256').update(`vibecheck:local\0${normalized}`).digest();
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.AUTH0_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new TrackerError('Account sessions require AUTH_SECRET in production.', 503, 'AUTH_UNCONFIGURED');
  }
  return 'vibecheck-local-dev-auth-secret-not-for-production';
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hex] = parts;
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, expected.length, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken(user: Pick<User, 'id' | 'email'>): string {
  const payload: SessionPayload = {
    uid: user.id,
    email: normalizeEmail(user.email),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  if (!encoded || !providedSig) return null;
  try {
    const expectedSig = createHmac('sha256', sessionSecret()).update(encoded).digest();
    const actualSig = Buffer.from(providedSig, 'base64url');
    if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (typeof parsed.uid !== 'string' || typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') return null;
    if (parsed.exp <= Date.now()) return null;
    return { uid: parsed.uid, email: parsed.email, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function readCookieFromRequest(request: Request, name = SESSION_COOKIE_NAME): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function readCookieFromNextHeaders(name = SESSION_COOKIE_NAME): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(name)?.value ?? null;
  } catch {
    return null;
  }
}

function cookieSecurityFlag(request?: Request): string {
  if (process.env.NODE_ENV !== 'production') return '';
  const proto = request?.headers.get('x-forwarded-proto');
  if (proto === 'https' || appBaseUrl().startsWith('https://')) return '; Secure';
  return '';
}

export function sessionCookieHeader(user: Pick<User, 'id' | 'email'>, request?: Request): string {
  const token = createSessionToken(user);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecurityFlag(request)}`;
}

export function clearedSessionCookieHeader(request?: Request): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurityFlag(request)}`;
}

export async function registerNativeUser(input: { email: string; password: string; name?: string }): Promise<User> {
  const email = normalizeEmail(input.email);
  if (!email.includes('@') || email.length > 254) {
    throw new TrackerError('Enter a valid email address.', 400, 'INVALID_EMAIL');
  }
  if (input.password.length < 8 || input.password.length > 128) {
    throw new TrackerError('Password must be between 8 and 128 characters.', 400, 'INVALID_PASSWORD');
  }
  const ownerId = nativeUserId(email);
  const displayName = (input.name?.trim() || email.split('@')[0] || 'Member').slice(0, 120);
  const passwordHash = await hashPassword(input.password);

  return withOwnerTransaction(ownerId, async () => {
    const existing = await currentClient().query(
      'SELECT user_id FROM tracker.auth_credentials WHERE user_id = $1 OR email = $2',
      [ownerId, email],
    );
    if (existing.rows.length > 0) {
      throw new TrackerError('An account with this email already exists. Sign in instead.', 409, 'EMAIL_EXISTS');
    }
    const user: User = { id: ownerId, email, name: displayName };
    await saveUser(user, 'vibecheck:local', email);
    await currentClient().query(
      'INSERT INTO tracker.auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)',
      [ownerId, email, passwordHash],
    );
    return user;
  });
}

export async function authenticateNativeUser(input: { email: string; password: string }): Promise<User> {
  const email = normalizeEmail(input.email);
  if (!email.includes('@') || !input.password || input.password.length > 128) {
    throw new TrackerError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }
  const ownerId = nativeUserId(email);

  return withOwnerTransaction(ownerId, async () => {
    const row = await currentClient().query(
      'SELECT user_id, password_hash FROM tracker.auth_credentials WHERE user_id = $1 AND email = $2',
      [ownerId, email],
    );
    const cred = row.rows[0] as { user_id: string; password_hash: string } | undefined;
    if (!cred || !(await verifyPassword(input.password, cred.password_hash))) {
      throw new TrackerError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }
    const user = await getUser(ownerId);
    if (!user) throw new TrackerError('Account record not found.', 404, 'USER_NOT_FOUND');
    return user;
  });
}

export async function getNativeSessionUser(request?: Request): Promise<User | null> {
  const token = request ? readCookieFromRequest(request) : await readCookieFromNextHeaders();
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || !process.env.DATABASE_URL) return null;
  return withOwnerTransaction(payload.uid, () => getUser(payload.uid));
}
