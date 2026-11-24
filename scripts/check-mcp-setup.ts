import { config } from 'dotenv';
import { validateMcpSetup } from '../src/lib/mcp/setup';
import { databaseReadiness } from '../src/lib/tracker/readiness';
import { getPool } from '../src/lib/tracker/db';

config({path:'.env.local'});config();
async function main() {
  const args=new Set(process.argv.slice(2));
  if([...args].some(arg=>!['--json','--probe-db','--help'].includes(arg))) throw new Error('Unknown option.');
  if(args.has('--help')) {console.log('Usage: tsx scripts/check-mcp-setup.ts [--json] [--probe-db]\nConfiguration-only by default. --probe-db checks role safety and migrated ownership policies without reading private records. No OpenAI key or hosted approval is required.');return;}
  const setup=validateMcpSetup(process.env);
  const probe=args.has('--probe-db') && !setup.missing.includes('DATABASE_URL') && !setup.invalid.some(item=>item.name==='DATABASE_URL');
  let database:Awaited<ReturnType<typeof databaseReadiness>>|{ready:false;reason:'not_probed'|'invalid_configuration'}={ready:false,reason:args.has('--probe-db')?'invalid_configuration':'not_probed'};
  if(probe) try {database=await databaseReadiness();} finally {await getPool().end();}
  const report={...setup,ready:setup.ready && (!args.has('--probe-db') || database.ready),database};
  if(args.has('--json')) console.log(JSON.stringify(report,null,2));
  else {
    console.log(`MCP configuration: ${setup.ready?'ready':'incomplete'}`);
    for(const name of setup.missing) console.log(`Missing: ${name}`);
    for(const item of setup.invalid) console.log(`Invalid: ${item.name} — ${item.reason}`);
    console.log(`Database: ${database.reason}`);
    console.log(`Migration credential: ${setup.optional[0].configured?'configured':'not configured (needed only to apply migrations)'}`);
    console.log(`Private document storage: ${setup.optional[1].configured && setup.optional[2].configured?'configured':'not configured (tracking and MCP account linking can be configured independently)'}`);
    if(setup.urls) for(const [name,url] of Object.entries(setup.urls)) console.log(`${name}: ${url}`);
    console.log(`Auth0 API scopes: ${setup.scopes.join(', ')}`);
    console.log('Auth0 Google/email connections, PKCE client registration, exact ChatGPT callbacks, consent, and deployed HTTPS must be verified in their managed services. This check does not provision accounts.');
  }
  if(!report.ready) process.exitCode=1;
}
main().catch(()=>{console.error('MCP setup check could not complete. Check option names and service connectivity. No credentials are logged.');process.exitCode=1;});
