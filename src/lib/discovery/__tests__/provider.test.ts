/** @jest-environment node */
import { canonicalJobUrl, collectDiscoverySources, groundDiscoveredJobs, searchWebJobs } from '../provider';
import type { DiscoveryPreferences } from '../types';

const mockResponse = jest.fn();
async function* completed(response: unknown) { yield { type: 'response.completed', response }; }
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ responses: { create: (...args: unknown[]) => mockResponse(...args) } })) }));
const jobUrl = 'https://careers.example.com/jobs/engineer-123';
const candidate = { company: 'Example', role: 'Engineer', location: '', workStyle: 'remote', compensation: '', summary: 'A role building accessible software.', url: jobUrl, sourceUrls: [jobUrl] };
const preferences: DiscoveryPreferences = { roles: ['Engineer'], locations: [], workStyles: ['remote'], employmentTypes: ['full-time'], additionalContext: '' };

describe('sourced web job discovery', () => {
  const previousKey = process.env.OPENAI_API_KEY;
  beforeEach(() => { jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-only'; });
  afterAll(() => { if (previousKey === undefined) Reflect.deleteProperty(process.env, 'OPENAI_API_KEY'); else process.env.OPENAI_API_KEY = previousKey; });

  it('normalizes tracking without changing job identity and rejects unsafe links', () => {
    expect(canonicalJobUrl(`${jobUrl}?jobId=7&utm_source=search#apply`)).toBe(`${jobUrl}?jobId=7`);
    for (const url of ['javascript:alert(1)', 'https://localhost/a', 'https://127.0.0.1/a', 'https://internal.local/a', 'https://user:password@example.com/job']) expect(canonicalJobUrl(url)).toBeNull();
  });
  it('keeps source citations from actual search actions and uses citation titles', () => {
    const sources = collectDiscoverySources({ output: [{ type: 'web_search_call', action: { type: 'search', sources: [{ url: jobUrl }] } }, { type: 'message', content: [{ annotations: [{ type: 'url_citation', url: jobUrl, title: 'Example engineering opening' }] }] }] });
    expect(sources).toEqual([{ url: jobUrl, title: 'Example engineering opening' }]);
    const matches = groundDiscoveredJobs({ jobs: [candidate, { ...candidate, url: 'https://invented.example/jobs/999' }, { ...candidate, url: `${jobUrl}?utm_source=duplicate` }] }, sources);
    expect(matches).toHaveLength(1); expect(matches[0].sources).toEqual(sources);
  });
  it('requires a completed web search before extraction and never returns invented sample jobs', async () => {
    mockResponse.mockReturnValue(completed({ status: 'completed', output: [], output_text: 'Here are some jobs from memory.' }));
    await expect(searchWebJobs(preferences)).rejects.toMatchObject({ code: 'DISCOVERY_PROVIDER_FAILED' });
    expect(mockResponse).toHaveBeenCalledTimes(1);
  });
  it('uses a real web-search response then grounds structured matches in its source URLs', async () => {
    mockResponse.mockReturnValueOnce(completed({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url: jobUrl }] } }], output_text: `Example seeks an Engineer. ${jobUrl}` }));
    mockResponse.mockReturnValueOnce(completed({ status: 'completed', output: [], output_text: JSON.stringify({ jobs: [candidate] }) }));
    expect(await searchWebJobs(preferences)).toMatchObject([{ url: jobUrl, sources: [{ url: jobUrl }] }]);
    expect(mockResponse.mock.calls[0][0]).toMatchObject({ stream: true, store: false, tool_choice: 'required', tools: [{ type: 'web_search', external_web_access: true }] });
    expect(mockResponse.mock.calls[1][0].text.format.strict).toBe(true);
  });
  it('fails clearly on malformed structured extraction instead of presenting guessed results', async () => {
    mockResponse.mockReturnValueOnce(completed({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url: jobUrl }] } }], output_text: 'Sourced result.' }));
    mockResponse.mockReturnValueOnce(completed({ status: 'completed', output: [], output_text: '{not json' }));
    await expect(searchWebJobs(preferences)).rejects.toMatchObject({ code: 'DISCOVERY_INVALID_RESULTS' });
  });
  it('uses the explicitly configured server provider without hosted approval or account linking', async () => {
    mockResponse.mockReturnValueOnce(completed({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url: jobUrl }] } }], output_text: 'Sourced role.' }));
    mockResponse.mockReturnValueOnce(completed({ status: 'completed', output: [], output_text: JSON.stringify({ jobs: [candidate] }) }));
    expect(await searchWebJobs(preferences)).toHaveLength(1);
    expect(mockResponse.mock.calls[0][0]).toMatchObject({ model: 'gpt-5.5', stream: true, store: false });
  });
  it('does not open a provider request when discovery is unconfigured', async () => {
    Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
    await expect(searchWebJobs(preferences)).rejects.toMatchObject({ status: 503 });
    expect(mockResponse).not.toHaveBeenCalled();
  });
});
