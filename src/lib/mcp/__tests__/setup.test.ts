import { validateMcpSetup } from '../setup';
const valid={AUTH0_DOMAIN:'tenant.auth0.com',AUTH0_CLIENT_ID:'client',AUTH0_CLIENT_SECRET:'sensitive-client-secret',AUTH0_SECRET:'a'.repeat(64),APP_BASE_URL:'https://tracker.example',DATABASE_URL:'postgresql://restricted:sensitive-password@pooler.supabase.com:6543/postgres?sslmode=require'};
test('MCP needs Auth0 and persistence, without OpenAI approval or provider keys',()=>{
  const report=validateMcpSetup(valid);expect(report.ready).toBe(true);expect(report.urls).toMatchObject({loginCallback:'https://tracker.example/auth/callback',audience:'https://tracker.example/mcp',authorizationServer:'https://tenant.auth0.com/'});expect(JSON.stringify(report)).not.toContain('sensitive');expect(JSON.stringify(report)).not.toContain(valid.AUTH0_SECRET);
});
test('missing fields report names only and optional storage does not block linking',()=>{
  const report=validateMcpSetup({APP_BASE_URL:valid.APP_BASE_URL});expect(report.ready).toBe(false);expect(report.missing).toContain('DATABASE_URL');expect(report.missing).not.toContain('OPENAI_API_KEY');expect(report.missing).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
});
test.each(['http://tracker.example','https://localhost','https://127.0.0.1','https://10.0.0.1','https://[::1]','https://user:secret@tracker.example','https://tracker.example/secret?token=sensitive'])('rejects unsafe deployment origins without echoing them: %s',APP_BASE_URL=>{
  const report=validateMcpSetup({...valid,APP_BASE_URL});expect(report.ready).toBe(false);expect(report.urls).toBeNull();expect(JSON.stringify(report)).not.toContain('sensitive');
});
test('invalid database credentials and missing TLS remain redacted',()=>{
  const report=validateMcpSetup({...valid,DATABASE_URL:'postgres://admin:sensitive@db.example/postgres',AUTH0_SECRET:'short'});expect(report.invalid.map(item=>item.name)).toEqual(['AUTH0_SECRET','DATABASE_URL']);expect(JSON.stringify(report)).not.toContain('sensitive');
});
test('custom audience and Auth0 custom domains retain exact public identifiers',()=>{
  const report=validateMcpSetup({...valid,AUTH0_DOMAIN:'https://login.tracker.example/',MCP_AUDIENCE:'https://tracker.example/api'});expect(report.ready).toBe(true);expect(report.urls?.audience).toBe('https://tracker.example/api');expect(report.urls?.authorizationServer).toBe('https://login.tracker.example/');
});
