/** @jest-environment node */
import { handleMcpRequest, protectedResourceMetadata, authChallenge } from '../server';
import { requireMcpUser } from '@/lib/tracker/auth';
import { runTool } from '@/lib/assistant/tools';
import { trackerWidgetHtml } from '../widget';

jest.mock('@/lib/tracker/auth', () => ({ authIssuer: () => 'https://identity.example/', requireMcpUser: jest.fn() }));
jest.mock('@/lib/assistant/tools', () => ({
  getTools: () => [{ name: 'list_applications', title: 'Find applications', description: 'List', schema: {}, scopes: ['applications:read'], readOnly: true, destructive: false }],
  runTool: jest.fn(), publicError: (error: Error) => error.message,
}));
jest.mock('mcp-handler', () => ({ createMcpHandler: (initialize: (server: unknown) => void) => {
  const callbacks: Record<string, (input: unknown) => Promise<unknown>> = {};
  initialize({ registerResource: jest.fn(), registerTool: (name: string, _options: unknown, callback: (input: unknown) => Promise<unknown>) => { callbacks[name] = callback; } });
  return async (request: Request) => {
    const payload = await request.json();
    return Response.json(payload.method === 'tools/list' ? { tools: Object.keys(callbacks) } : await callbacks[payload.name](payload.arguments));
  };
} }));

const request = (owner: string, method = 'tools/call') => new Request('https://tracker.example/mcp', { method: 'POST', headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ method, name: 'list_applications', arguments: {} }) });

describe('MCP request isolation and discovery', () => {
  beforeEach(() => { jest.clearAllMocks(); process.env.APP_BASE_URL = 'https://tracker.example'; process.env.AUTH0_DOMAIN = 'identity.example'; delete process.env.MCP_AUDIENCE; });

  it('keeps discovery available before account linking', async () => {
    const response = await handleMcpRequest(request('', 'tools/list'));
    expect((await response.json()).tools).toContain('list_applications');
    expect(requireMcpUser).not.toHaveBeenCalled();
  });

  it('authenticates each concurrent request independently and never accepts client-selected identity', async () => {
    (requireMcpUser as jest.Mock).mockImplementation(async (incoming: Request) => ({ id: incoming.headers.get('authorization')!.slice(7) }));
    (runTool as jest.Mock).mockImplementation(async (owner: string) => ({ owner }));
    const responses = await Promise.all([handleMcpRequest(request('one')), handleMcpRequest(request('two'))]);
    expect((await responses[0].json()).structuredContent).toEqual({ owner: 'one' });
    expect((await responses[1].json()).structuredContent).toEqual({ owner: 'two' });
    expect(requireMcpUser).toHaveBeenCalledTimes(2);
    expect(requireMcpUser).toHaveBeenCalledWith(expect.anything(), ['applications:read']);
  });

  it('returns a tool-level OAuth challenge without running an unauthenticated tool', async () => {
    (requireMcpUser as jest.Mock).mockRejectedValue(Object.assign(new Error('Connect your account.'), { status: 401 }));
    const response = await handleMcpRequest(request('invalid')); const body = await response.json();
    expect(body.isError).toBe(true);
    expect(body._meta['mcp/www_authenticate'][0]).toContain('resource_metadata="https://tracker.example/.well-known/oauth-protected-resource"');
    expect(runTool).not.toHaveBeenCalled();
  });

  it('publishes the exact configured audience and issuer', () => {
    expect(protectedResourceMetadata()).toMatchObject({ resource: 'https://tracker.example/mcp', authorization_servers: ['https://identity.example/'] });
    expect(authChallenge(['applications:write'], true)).toContain('error="insufficient_scope"');
  });

  it('ships a self-contained standard bridge widget with no external network or HTML insertion', () => {
    const html = trackerWidgetHtml();
    expect(html).toContain('ui/initialize'); expect(html).toContain('ui/notifications/initialized'); expect(html).toContain("request('tools/call'");
    expect(html).toContain("connect-src 'none'"); expect(html).not.toContain('innerHTML'); expect(html).not.toContain('fetch(');
    expect(html).toContain('event.source!==window.parent');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    expect(() => new Function(script)).not.toThrow();
  });
});
