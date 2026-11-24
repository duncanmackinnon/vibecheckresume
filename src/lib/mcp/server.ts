import { randomUUID } from 'node:crypto';
import { createMcpHandler } from 'mcp-handler';
import { authIssuer, requireMcpUser } from '@/lib/tracker/auth';
import { appBaseUrl, mcpAudience } from '@/lib/tracker/config';
import { getTools, publicError, runTool } from '@/lib/assistant/tools';
import { TRACKER_UI_URI, trackerWidgetHtml } from './widget';
import { outputSchemaFor } from './output-schemas';

export const MCP_SCOPES = ['applications:read', 'applications:write', 'resumes:read', 'resumes:write'];
export function resourceMetadataUrl() { return `${appBaseUrl()}/.well-known/oauth-protected-resource`; }
export function protectedResourceMetadata() {
  if (!process.env.AUTH0_DOMAIN) return null;
  return { resource: mcpAudience(), authorization_servers: [authIssuer()], scopes_supported: MCP_SCOPES, bearer_methods_supported: ['header'], resource_name: 'VibeCheck application tracker', resource_documentation: `${appBaseUrl()}/settings` };
}

export function authChallenge(scopes: string[], insufficient = false) {
  return `Bearer resource_metadata="${resourceMetadataUrl()}", error="${insufficient ? 'insufficient_scope' : 'invalid_token'}", error_description="Connect your VibeCheck account with the required permissions", scope="${scopes.join(' ')}"`;
}

/** A handler instance closes over one request only; identities never leak between requests. */
export async function handleMcpRequest(request: Request) {
  const tools = getTools();
  const handler = createMcpHandler((server) => {
    server.registerResource('application_tracker', TRACKER_UI_URI, {
      title: 'Application tracker', description: 'Interactive application list, stage updates and follow-up tasks.', mimeType: 'text/html;profile=mcp-app',
    }, async () => ({ contents: [{ uri: TRACKER_UI_URI, mimeType: 'text/html;profile=mcp-app', text: trackerWidgetHtml(), _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] } }, 'openai/widgetDescription': 'An interactive list of the user’s job applications with stage updates and task completion.', 'openai/widgetCSP': { connect_domains: [], resource_domains: [] }, 'openai/widgetPrefersBorder': true } }] }));

    for (const tool of tools) {
      const interactive = ['list_applications', 'get_application', 'list_followups'].includes(tool.name);
      server.registerTool(tool.name, {
        title: tool.title, description: tool.description, inputSchema: tool.schema, outputSchema: outputSchemaFor(tool.name),
        annotations: { readOnlyHint: tool.readOnly, destructiveHint: tool.destructive, idempotentHint: tool.idempotent, openWorldHint: /^(analyze_resume|generate_resume|retry_ai_job|find_jobs)$/.test(tool.name) },
        _meta: { securitySchemes: [{ type: 'oauth2', scopes: tool.scopes }], ...(interactive ? { ui: { resourceUri: TRACKER_UI_URI, visibility: ['model', 'app'] }, 'openai/outputTemplate': TRACKER_UI_URI, 'openai/widgetAccessible': true } : { ui: { visibility: ['model', 'app'] } }) },
      }, async (input) => {
        try {
          const user = await requireMcpUser(request, tool.scopes);
          const result = await runTool(user.id, tool.name, input, `mcp:${randomUUID()}`);
          const structuredContent = result !== null && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : { result };
          return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent };
        } catch (cause) {
          const status = cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 400;
          return { isError: true, content: [{ type: 'text' as const, text: publicError(cause) }], ...(status === 401 || status === 403 ? { _meta: { 'mcp/www_authenticate': [authChallenge(tool.scopes, status === 403)] } } : {}) };
        }
      });
    }
  }, { serverInfo: { name: 'VibeCheck application tracker', version: '1.1.0' }, maxSubscriptions: 0, instructions: 'Manage only the connected user’s applications. Read current record versions before updating. Never invent resume experience or missing builder answers. Writes require an explicit user request. For job discovery, use ChatGPT web search when available, cite actual vacancy URLs, and save user-selected opportunities with create_application in the Saved stage. Do not invent job listings or claim openings were verified without checking their sources. The optional find_jobs tool runs a separately configured website provider; it is not required for ChatGPT web search or tracker access. Never send an OpenAI API key or ChatGPT credential to tracker tools. Resume processing runs in the background; use get_ai_job to retrieve progress later.', capabilities: { tools: {}, resources: {} } });
  const response = await handler(request);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version');
  return response;
}
