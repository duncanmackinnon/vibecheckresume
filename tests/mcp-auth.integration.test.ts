import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { assertConnectionActive, verifyMcpAccessToken } from '../src/lib/mcp/verify-token';

describe('cryptographic MCP access token validation', () => {
  let privateKey: CryptoKey; let keys: JWTVerifyGetKey;
  const issuer = 'https://identity.example/'; const audience = 'https://tracker.example/mcp';
  before(async () => { const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey; keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test-signing-key', alg: 'RS256' }] }); });
  const signed = (options: { audience?: string; issuer?: string; expiry?: number; scope?: string } = {}) => new SignJWT({ scope: options.scope ?? 'applications:read applications:write' }).setProtectedHeader({ alg: 'RS256', kid: 'test-signing-key' }).setSubject('auth0|owner-one').setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? audience).setIssuedAt().setExpirationTime(options.expiry ?? Math.floor(Date.now() / 1000) + 300).sign(privateKey);
  const verify = (token: string, requiredScopes = ['applications:read']) => verifyMcpAccessToken(token, { issuer, audience, keys, requiredScopes });

  it('accepts a correctly signed resource-bound token', async () => { assert.equal((await verify(await signed())).sub, 'auth0|owner-one'); });
  it('rejects expired tokens', async () => { await assert.rejects(verify(await signed({ expiry: Math.floor(Date.now() / 1000) - 5 })), { code: 'ERR_JWT_EXPIRED' }); });
  it('rejects tokens for another audience or issuer', async () => { await assert.rejects(verify(await signed({ audience: 'https://other.example/mcp' }))); await assert.rejects(verify(await signed({ issuer: 'https://other-identity.example/' }))); });
  it('does not let read-only consent authorize writes', async () => { await assert.rejects(verify(await signed({ scope: 'applications:read' }), ['applications:write']), { status: 403, code: 'INSUFFICIENT_SCOPE' }); });
  it('rejects modified signatures', async () => { const [header, payload, signature] = (await signed()).split('.'); await assert.rejects(verify(`${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`)); });
  it('requires fresh authorization after disconnect', () => { const issuedAt = 1700000000; assert.throws(() => assertConnectionActive({ enabled: false }, issuedAt), /disconnected/); assert.throws(() => assertConnectionActive({ enabled: true, revokedBefore: new Date(issuedAt * 1000 + 500).toISOString() }, issuedAt), /disconnected/); assert.doesNotThrow(() => assertConnectionActive({ enabled: true, revokedBefore: new Date(issuedAt * 1000).toISOString() }, issuedAt + 1)); });
});
