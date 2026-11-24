import { handleMcpRequest, authChallenge, MCP_SCOPES } from '@/lib/mcp/server';
import { boundedBody, parseJson } from '@/lib/assistant/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await boundedBody(request, 300000); parseJson(body);
    return await handleMcpRequest(new Request(request, { body }));
  } catch (cause) {
    const status = cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 500;
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: status === 400 ? -32700 : -32603, message: status < 500 && cause instanceof Error ? cause.message : 'The MCP request could not be completed.' } }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET() {
  return Response.json({ error: 'Use POST for stateless MCP requests.' }, { status: 405, headers: { Allow: 'POST, OPTIONS', 'WWW-Authenticate': authChallenge(MCP_SCOPES), 'Cache-Control': 'no-store' } });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, MCP-Protocol-Version, MCP-Session-Id', 'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Protocol-Version', 'Access-Control-Max-Age': '86400' } });
}
