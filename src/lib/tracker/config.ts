export function capabilities() {
  return {
    database: Boolean(process.env.DATABASE_URL),
    auth: Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_SECRET && process.env.APP_BASE_URL),
    storage: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY),
  };
}
export function appBaseUrl() { return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''); }
export function mcpAudience() { return process.env.MCP_AUDIENCE || `${appBaseUrl()}/mcp`; }
