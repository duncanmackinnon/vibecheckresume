export type McpSetupReport = {
  ready:boolean;
  missing:string[];
  invalid:{name:string;reason:string}[];
  optional:{name:string;configured:boolean}[];
  urls:{application:string;loginCallback:string;logoutReturn:string;mcp:string;audience:string;protectedResource:string;authorizationServer:string}|null;
  scopes:string[];
};
const required=['AUTH0_DOMAIN','AUTH0_CLIENT_ID','AUTH0_CLIENT_SECRET','AUTH0_SECRET','APP_BASE_URL','DATABASE_URL'];
function privateHost(host:string) {
  const normalized=host.replace(/^\[|\]$/g,'').toLowerCase();
  return normalized==='localhost' || normalized.endsWith('.localhost') || normalized==='::1' || /^(?:fc|fd|fe80):/.test(normalized) || /^(?:0|10|127)\./.test(normalized) || /^192\.168\./.test(normalized) || /^169\.254\./.test(normalized) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized);
}
/** Reports field names and safe public URLs only; never returns credentials. */
export function validateMcpSetup(env:Record<string,string|undefined>):McpSetupReport {
  const missing=required.filter(name=>!env[name]?.trim());
  const invalid:McpSetupReport['invalid']=[];
  const fail=(name:string,reason:string)=>invalid.push({name,reason});
  let base:URL|undefined,issuer:URL|undefined,audience:URL|undefined;
  if(env.APP_BASE_URL) try {
    const parsed=new URL(env.APP_BASE_URL);
    if(parsed.protocol!=='https:' || privateHost(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) fail('APP_BASE_URL','Use a public HTTPS origin without credentials, path, query, or fragment.');
    else base=parsed;
  } catch {fail('APP_BASE_URL','Use a valid public HTTPS origin.');}
  if(env.AUTH0_DOMAIN) try {
    const parsed=new URL(env.AUTH0_DOMAIN.startsWith('https://')?env.AUTH0_DOMAIN:`https://${env.AUTH0_DOMAIN}`);
    if(parsed.protocol!=='https:' || privateHost(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) fail('AUTH0_DOMAIN','Use the Auth0 tenant domain or verified custom domain only.');
    else issuer=parsed;
  } catch {fail('AUTH0_DOMAIN','Use the Auth0 tenant domain or verified custom domain only.');}
  if(env.AUTH0_SECRET && !/^[a-fA-F0-9]{64}$/.test(env.AUTH0_SECRET)) fail('AUTH0_SECRET','Use a random 32-byte cookie secret encoded as 64 hexadecimal characters.');
  if(env.DATABASE_URL) try {
    const db=new URL(env.DATABASE_URL);
    if(!['postgres:','postgresql:'].includes(db.protocol) || !db.hostname || !db.username || !db.password || db.pathname.length<=1) fail('DATABASE_URL','Use a PostgreSQL runtime connection string with a restricted login and database.');
    if(!['require','verify-ca','verify-full'].includes(db.searchParams.get('sslmode') || env.PGSSLMODE || '')) fail('DATABASE_URL','Require TLS with sslmode=require, verify-ca, or verify-full.');
  } catch {fail('DATABASE_URL','Use a valid PostgreSQL runtime connection string.');}
  if(env.MCP_AUDIENCE) try {
    const parsed=new URL(env.MCP_AUDIENCE);
    if(parsed.protocol!=='https:' || privateHost(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) fail('MCP_AUDIENCE','Use the public HTTPS API identifier registered in Auth0.');
    else audience=parsed;
  } catch {fail('MCP_AUDIENCE','Use the public HTTPS API identifier registered in Auth0.');}
  return {ready:missing.length===0 && invalid.length===0,missing,invalid,
    optional:['MIGRATION_DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(name=>({name,configured:!!env[name]})),
    urls:base && issuer && (!env.MCP_AUDIENCE || audience)?{application:base.origin,loginCallback:`${base.origin}/auth/callback`,logoutReturn:base.origin,mcp:`${base.origin}/mcp`,audience:audience?.toString() || `${base.origin}/mcp`,protectedResource:`${base.origin}/.well-known/oauth-protected-resource`,authorizationServer:`${issuer.origin}/`}:null,
    scopes:['applications:read','applications:write','resumes:read','resumes:write']};
}
