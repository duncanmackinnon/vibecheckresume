import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleMcpRequest } from '../src/lib/mcp/server';

test('the actual complete tool registry is discoverable without account credentials', async () => {
  const response = await handleMcpRequest(new Request('https://tracker.example/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  }));
  assert.equal(response.status, 200);
  const raw = await response.text();
  const payload = JSON.parse(response.headers.get('content-type')?.includes('text/event-stream') ? raw.split('\n').find(line => line.startsWith('data: '))!.slice(6) : raw);
  assert.equal(payload.error, undefined);
  const tools = payload.result.tools as { name: string; inputSchema: { type: string }; outputSchema: { type: string }; annotations: { idempotentHint: boolean }; _meta: { securitySchemes: { scopes: string[] }[] } }[];
  for (const name of ['get_search_preferences','list_applications', 'create_application', 'update_note', 'update_task', 'set_application_stage', 'complete_task', 'get_resume', 'generate_resume', 'get_ai_job']) assert.ok(tools.some(tool => tool.name === name), name);
  assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert.equal(tool.outputSchema.type, 'object', tool.name);
    assert.ok(tool._meta.securitySchemes[0].scopes.length > 0, tool.name);
  }
  for (const name of ['create_application', 'delete_entry', 'set_application_stage', 'analyze_resume', 'generate_resume', 'save_resume_draft', 'select_submitted_resume', 'retry_ai_job']) assert.equal(tools.find(tool => tool.name === name)?.annotations.idempotentHint, true, name);
});
