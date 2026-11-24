/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { assistantResponse, listConversations } from '../service';
import { runTool } from '../tools';
import { TrackerError } from '@/lib/tracker/errors';

const mockRecords = new Map<string, any>();
const mockCreateResponse = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ responses: { create: (...args: unknown[]) => mockCreateResponse(...args) } })) }));
jest.mock('../tools', () => ({ functionTools: () => [], getTools: () => [{ name: 'create_application', title: 'Add application', readOnly: false }, { name: 'generate_resume', title: 'Generate resume', readOnly: false }], runTool: jest.fn(), publicError: (cause: Error) => cause.message }));
jest.mock('@/lib/tracker/db', () => ({ currentClient: () => ({ query: jest.fn() }) }));
jest.mock('@/lib/tracker/store', () => ({
  withOwnerTransaction: (_owner: string, callback: () => unknown) => callback(),
  getRecord: async (owner: string, kind: string, id: string) => { const record = mockRecords.get(`${owner}:${kind}:${id}`); if (!record) throw new TrackerError('Not found.', 404); return record; },
  listRecords: async (owner: string, kind: string) => [...mockRecords.values()].filter((record) => record.ownerId === owner && record.kind === kind),
  createRecord: async (owner: string, kind: string, data: unknown, options: { id?: string; applicationId?: string } = {}) => { const id = options.id || randomUUID(); const record = { id, ownerId: owner, kind, data, applicationId: options.applicationId || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 }; mockRecords.set(`${owner}:${kind}:${id}`, record); return record; },
  updateRecord: async (owner: string, kind: string, id: string, data: unknown, expectedVersion: number) => { const previous = mockRecords.get(`${owner}:${kind}:${id}`); const record = { ...previous, data, version: expectedVersion + 1 }; mockRecords.set(`${owner}:${kind}:${id}`, record); return record; },
}));

async function* answer(text = 'Ready for your next step.') {
  yield { type: 'response.output_text.delta', delta: text };
  yield { type: 'response.completed', response: { output: [] } };
}
async function* toolCall(name = 'create_application') {
  yield { type: 'response.completed', response: { output: [{ type: 'function_call', id: randomUUID(), call_id: randomUUID(), name, arguments: '{}' }] } };
}
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const signal = () => new AbortController().signal;

describe('persistent, bounded assistant execution', () => {
  beforeEach(() => { mockRecords.clear(); jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-only-api-key'; process.env.ASSISTANT_DAILY_LIMIT = '40'; mockCreateResponse.mockImplementation(() => answer()); });
  afterAll(() => { Reflect.deleteProperty(process.env, 'OPENAI_API_KEY'); Reflect.deleteProperty(process.env, 'ASSISTANT_DAILY_LIMIT'); });

  it('saves both sides of a conversation and replays a duplicate request without another model call', async () => {
    const input = { message: 'Help me plan.', requestId: randomUUID() };
    const first = await assistantResponse(owner, input, signal()); const frames = (await first.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(frames[0].type).toBe('conversation'); expect(frames.at(-1).type).toBe('done');
    expect([...mockRecords.values()].filter((record) => record.kind === 'message').map((record) => record.data.role).sort()).toEqual(['assistant', 'user']);
    const replay = await assistantResponse(owner, input, signal()); expect(await replay.text()).toContain('Ready for your next step.');
    expect(mockCreateResponse).toHaveBeenCalledTimes(1);
    expect(mockCreateResponse.mock.calls[0][0]).toMatchObject({ model: 'gpt-5.6-terra', stream: true, store: false, parallel_tool_calls: false, max_output_tokens: 1800 });
  });

  it('enforces daily quota before opening a second paid stream', async () => {
    process.env.ASSISTANT_DAILY_LIMIT = '1';
    const first = await assistantResponse(owner, { message: 'Hello', requestId: randomUUID() }, signal()); await first.text();
    await expect(assistantResponse(owner, { message: 'Again', requestId: randomUUID() }, signal())).rejects.toMatchObject({ status: 429 });
    expect(mockCreateResponse).toHaveBeenCalledTimes(1);
  });

  it('blocks another user’s conversation before any model request', async () => {
    const first = await assistantResponse(owner, { message: 'Hello', requestId: randomUUID() }, signal()); const text = await first.text(); const conversationId = JSON.parse(text.split('\n')[0]).conversationId;
    mockCreateResponse.mockClear();
    await expect(assistantResponse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { message: 'Read this', conversationId, requestId: randomUUID() }, signal())).rejects.toMatchObject({ status: 404 });
    expect(mockCreateResponse).not.toHaveBeenCalled();
  });

  it('restores conversations only in the application context where they can continue', async () => {
    const general = await assistantResponse(owner, { message: 'Plan my search.', requestId: randomUUID() }, signal()); await general.text();
    const applicationId = randomUUID();
    const specific = await assistantResponse(owner, { message: 'Prepare for this role.', applicationId, requestId: randomUUID() }, signal()); await specific.text();
    expect((await listConversations(owner)).map(conversation => conversation.title)).toEqual(['Plan my search.']);
    expect((await listConversations(owner, applicationId)).map(conversation => conversation.title)).toEqual(['Prepare for this role.']);
  });

  it('bounds repeated failed tools and never claims a completed change', async () => {
    mockCreateResponse.mockImplementation(() => toolCall()); (runTool as jest.Mock).mockRejectedValue(new Error('This action failed.'));
    const response = await assistantResponse(owner, { message: 'Add this role.', requestId: randomUUID() }, signal()); const text = await response.text();
    expect(mockCreateResponse).toHaveBeenCalledTimes(5); expect(runTool).toHaveBeenCalledTimes(5);
    expect(text).toContain('No tracker changes were completed.'); expect(text).toContain('5 actions could not finish.');
  });

  it('reports a failed background job without counting a successful resume change', async () => {
    mockCreateResponse.mockImplementation(() => toolCall('generate_resume'));
    (runTool as jest.Mock).mockResolvedValue({ kind: 'ai_job', data: { status: 'failed', error: 'The background job could not be started.' } });
    const response = await assistantResponse(owner, { message: 'Generate my resume.', requestId: randomUUID() }, signal());
    const text = await response.text();
    expect(text).toContain('No tracker changes were completed.');
    expect(text).toContain('"status":"failed"'); expect(text).not.toContain('"status":"completed"');
  });

  it('rejects failed terminal responses before executing model-requested mutations', async () => {
    mockCreateResponse.mockImplementation(async function* () {
      yield { type: 'response.failed', response: { error: { code: 'server_error' }, output: [{ type: 'function_call', call_id: 'call', name: 'create_application', arguments: '{}' }] } };
    });
    const response = await assistantResponse(owner, { message: 'Add this role.', requestId: randomUUID() }, signal());
    expect(await response.text()).toContain('Website AI is temporarily unavailable.');
    expect(runTool).not.toHaveBeenCalled();
  });

  it('reports missing configuration without mock answers or persistence', async () => {
    Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
    await expect(assistantResponse(owner, { message: 'Hello', requestId: randomUUID() }, signal())).rejects.toMatchObject({ status: 503, code: 'PLATFORM_AI_UNCONFIGURED' });
    expect(mockRecords.size).toBe(0); expect(mockCreateResponse).not.toHaveBeenCalled();
  });
});
