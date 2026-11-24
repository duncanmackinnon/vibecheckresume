import { databaseReadiness } from '@/lib/tracker/readiness';
import { capabilities } from '@/lib/tracker/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  const configured=capabilities(); const probe = await databaseReadiness(); const database=probe.ready;
  const ready=database&&configured.auth;
  return Response.json({status:ready?'ok':'unconfigured',services:{database,auth:configured.auth,storage:configured.storage},databaseReadiness:probe.reason,features:{resumeAI:configured.deepseek,assistant:configured.openai,scheduledDiscovery:configured.openai,mcp:ready},aiProvider:'platform'},{status:ready?200:503,headers:{'Cache-Control':'no-store'}});
}
export async function HEAD() {const response=await GET();return new Response(null,{status:response.status,headers:response.headers});}
