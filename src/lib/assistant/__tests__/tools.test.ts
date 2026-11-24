/** @jest-environment node */
import { functionTools, getTools, runTool } from '../tools';
import { executeAction, getSnapshot } from '@/lib/tracker/service';
import { STAGES } from '@/lib/tracker/types';
import { getOnboardingProfile } from '@/lib/onboarding/service';
import { outputSchemaFor } from '@/lib/mcp/output-schemas';

jest.mock('@/lib/tracker/service', () => ({ executeAction: jest.fn(), getSnapshot: jest.fn() }));
jest.mock('@/lib/resume-workspace/service', () => ({ resumeActionSchemas: {}, executeResumeAction: jest.fn() }));
jest.mock('@/lib/onboarding/service',()=>({getOnboardingProfile:jest.fn()}));
const applicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const taskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('shared assistant and MCP tool authorization boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns only the verified owner’s saved search preferences without resume or identity data',async()=>{
    const preferences={roles:'Designer',locations:'Toronto',workModes:['remote'],employmentTypes:['full-time'],additionalContext:'Small teams'};
    jest.mocked(getOnboardingProfile).mockResolvedValue({data:{preferences,displayName:'Private name',sourceResumeId:applicationId}} as never);
    const result=await runTool('owner-one','get_search_preferences',{},'request');
    expect(getOnboardingProfile).toHaveBeenCalledWith('owner-one');
    expect(outputSchemaFor('get_search_preferences').parse(result)).toEqual({preferences,websiteUrl:expect.stringContaining('/onboarding?edit=preferences')});
    expect(JSON.stringify(result)).not.toContain('Private name');
    expect(JSON.stringify(result)).not.toContain(applicationId);
    jest.mocked(getOnboardingProfile).mockResolvedValue(null);
    expect(await runTool('owner-two','get_search_preferences',{},'request')).toMatchObject({preferences:null});
  });

  it('rejects model-supplied ownership before touching data', async () => {
    await expect(runTool('owner-one', 'list_applications', { ownerId: 'owner-two' }, 'request')).rejects.toThrow('cannot select a user');
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('passes only verified owner, current version and stable idempotency key for a stage change', async () => {
    (executeAction as jest.Mock).mockResolvedValue({ id: applicationId, stage: 'Interview' });
    await runTool('owner-one', 'set_application_stage', { applicationId, expectedVersion: 3, stage: 'Interview', idempotencyKey: 'change-unique-1' }, 'transport-key');
    expect(executeAction).toHaveBeenCalledWith('owner-one', 'update_application', { id: applicationId, expectedVersion: 3, stage: 'Interview' }, 'change-unique-1');
  });

  it('does not let UI completion update arbitrary task fields', async () => {
    await expect(runTool('owner-one', 'complete_task', { taskId, expectedVersion: 2, completed: false, idempotencyKey: 'complete-one' }, 'request')).rejects.toThrow();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('filters archived and unrelated applications and keeps the current version', async () => {
    (getSnapshot as jest.Mock).mockResolvedValue({ applications: [{ id: applicationId, company: 'Acme', role: 'Engineer', stage: 'Applied', archived: false, tags: [], version: 4 }, { id: taskId, company: 'Elsewhere', role: 'Designer', stage: 'Saved', archived: true, tags: [], version: 1 }], entries: [] });
    const result = await runTool('owner-one', 'list_applications', { query: 'acme' }, 'request') as { applications: { id: string; version: number }[] };
    expect(getSnapshot).toHaveBeenCalledWith('owner-one');
    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]).toMatchObject({ id: applicationId, version: 4 });
  });

  it('counts every filtered application stage before the 50-result page is selected', async () => {
    const applications = Array.from({ length: 80 }, (_, index) => ({ id: `application-${index}`, company: 'Acme', role: 'Engineer', stage: index < 60 ? 'Applied' : 'Interview', archived: false, tags: [], version: 1 }));
    (getSnapshot as jest.Mock).mockResolvedValue({ applications: [...applications, { ...applications[0], id: 'archived', archived: true }, { ...applications[0], id: 'unrelated', company: 'Other' }], entries: [] });
    const result = await runTool('owner-one', 'list_applications', { query: 'Acme' }, 'request') as { applications: { stage: string }[]; total: number; stageCounts: Record<string, number> };
    expect(result.applications).toHaveLength(50); expect(result.total).toBe(80);
    expect(result.applications.every(application => application.stage === 'Applied')).toBe(true);
    expect(result.stageCounts).toEqual(Object.fromEntries(STAGES.map(stage => [stage, stage === 'Applied' ? 60 : stage === 'Interview' ? 20 : 0])));
    const filtered = await runTool('owner-one', 'list_applications', { query: 'Acme', stage: 'Interview' }, 'request') as { total: number; stageCounts: Record<string, number> };
    expect(filtered.total).toBe(20); expect(filtered.stageCounts.Interview).toBe(20); expect(filtered.stageCounts.Applied).toBe(0);
  });

  it('requires the current version and scopes for every mutation', async () => {
    await expect(runTool('owner-one', 'update_application', { id: applicationId, stage: 'Offer', idempotencyKey: 'update-offer' }, 'request')).rejects.toThrow();
    for (const tool of getTools()) {
      expect(tool.scopes).not.toHaveLength(0);
      expect(tool.scopes.every((scope) => scope.endsWith(tool.readOnly ? ':read' : ':write'))).toBe(true);
      expect(tool.name).not.toMatch(/sql|query_database|execute_code/);
    }
  });

  it('exports valid JSON schemas even for date transforms and optional fields', () => {
    const definitions = functionTools();
    const create = definitions.find((tool) => tool.name === 'create_application');
    expect(create?.parameters.type).toBe('object');
    expect(JSON.stringify(definitions)).toContain('idempotencyKey');
  });
});
