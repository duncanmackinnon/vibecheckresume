import type { Capabilities } from './types';

export function auth0Configured() {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_SECRET &&
      process.env.APP_BASE_URL,
  );
}

export function nativeAuthConfigured() {
  return Boolean(process.env.DATABASE_URL) && Boolean(process.env.AUTH_SECRET || process.env.AUTH0_SECRET || process.env.NODE_ENV !== 'production');
}

export function capabilities(): Capabilities {
  return {
    database: Boolean(process.env.DATABASE_URL),
    auth: auth0Configured() || nativeAuthConfigured(),
    auth0: auth0Configured(),
    storage: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    deepseek: llmEnabled(),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
}

export function llmEnabled() { return Boolean(process.env.DEEPSEEK_API_KEY?.trim()); }
export function appBaseUrl() { return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''); }
export function mcpAudience() { return process.env.MCP_AUDIENCE || `${appBaseUrl()}/mcp`; }
