import { protectedResourceMetadata } from '@/lib/mcp/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const metadata = protectedResourceMetadata();
  return Response.json(metadata || { error: 'Account linking is not configured for this deployment.' }, { status: metadata ? 200 : 503, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } });
}
