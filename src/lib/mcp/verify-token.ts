import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { TrackerError } from '@/lib/tracker/errors';

export async function verifyMcpAccessToken(token: string, options: { keys: JWTVerifyGetKey; issuer: string; audience: string; requiredScopes: string[] }) {
  const { payload } = await jwtVerify(token, options.keys, { issuer: options.issuer, audience: options.audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'] });
  if (!payload.sub || !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat)) throw new TrackerError('Reconnect your VibeCheck account.', 401, 'INVALID_TOKEN');
  const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : [];
  if (options.requiredScopes.some((scope) => !scopes.includes(scope))) throw new TrackerError('Reconnect to grant the requested permissions.', 403, 'INSUFFICIENT_SCOPE');
  return payload;
}

export function assertConnectionActive(connection: { enabled: boolean; revokedBefore?: string | null } | undefined, issuedAt: number) {
  if (connection && (!connection.enabled || (connection.revokedBefore && issuedAt * 1000 <= Date.parse(connection.revokedBefore)))) throw new TrackerError('This connection was disconnected. Enable and reconnect it in Settings.', 401, 'CONNECTION_REVOKED');
}
