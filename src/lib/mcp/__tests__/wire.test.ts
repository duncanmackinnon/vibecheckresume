/** @jest-environment node */
import { handleMcpRequest } from '../server';
import { requireMcpUser } from '@/lib/tracker/auth';

jest.mock('@/lib/tracker/auth', () => ({ authIssuer: () => 'https://identity.example/', requireMcpUser: jest.fn() }));
jest.mock('@/lib/assistant/tools', () => {
  const { z } = jest.requireActual('zod');
  const { STAGES } = jest.requireActual('@/lib/tracker/types');
  return { getTools: () => [{ name: 'list_applications', title: 'Find applications', description: 'List applications', schema: z.object({ query: z.string().optional() }).strict(), scopes: ['applications:read'], readOnly: true, destructive: false }], runTool: jest.fn().mockResolvedValue({ applications: [], total: 0, stageCounts: Object.fromEntries(STAGES.map((stage: string) => [stage, 0])), tasks: [], websiteUrl: 'https://tracker.example' }), publicError: (error: Error) => error.message };
});

async function rpc(method: string, params: unknown, authorized = false) {
  const response = await handleMcpRequest(new Request('https://tracker.example/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25', ...(authorized ? { Authorization: 'Bearer test-token' } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  const text = await response.text();
  const body = response.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(text.split('\n').find((line) => line.startsWith('data: '))!.slice(6)) : JSON.parse(text);
  return { response, body };
}

describe('real MCP SDK stateless HTTP transport', () => {
  beforeEach(() => { process.env.APP_BASE_URL = 'https://tracker.example'; process.env.AUTH0_DOMAIN = 'identity.example'; (requireMcpUser as jest.Mock).mockResolvedValue({ id: 'owner-one' }); });

  it('initializes a 2025 client and lists tools with scoped auth and output schemas', async () => {
    const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } });
    expect(initialized.response.status).toBe(200);
    expect(initialized.body.result.serverInfo.name).toBe('VibeCheck application tracker');
    const list = await rpc('tools/list', {});
    const tool = list.body.result.tools[0];
    expect(tool.outputSchema.properties.applications.type).toBe('array');
    expect(tool._meta.securitySchemes[0].scopes).toEqual(['applications:read']);
    expect(tool._meta.ui.resourceUri).toBe('ui://vibecheck/v1/application-tracker.html');
  });

  it('calls an authorized tool and validates its structured result', async () => {
    const result = await rpc('tools/call', { name: 'list_applications', arguments: {} }, true);
    expect(result.response.status).toBe(200);
    expect(result.body.result.structuredContent).toMatchObject({ applications: [], total: 0 });
    expect(result.body.result.isError).not.toBe(true);
  });

  it('returns the widget resource with a restrictive CSP', async () => {
    const resource = await rpc('resources/read', { uri: 'ui://vibecheck/v1/application-tracker.html' });
    expect(resource.body.result.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect(resource.body.result.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
  });
});
