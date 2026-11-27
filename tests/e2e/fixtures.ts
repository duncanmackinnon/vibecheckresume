import { STAGES, type Application, type TrackerEntry, type TrackerSnapshot } from '../../src/lib/tracker/types';

export function createWorkspaceFixtureSnapshot(): TrackerSnapshot {
  const now = new Date();
  const day = (offset: number) => {
    const value = new Date(now);
    value.setDate(value.getDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const ownerId = '00000000-0000-4000-8000-000000000001';
  const companies = [
    ['Linear', 'Product Designer', 'San Francisco, CA', '$150k - $190k', 'Interview'],
    ['Notion', 'Senior Product Designer', 'New York, NY', '$165k - $210k', 'Applied'],
    ['Figma', 'Design Engineer', 'Remote', '$170k - $225k', 'Screening'],
  ];
  const applications: Application[] = companies.map(([company, role, location, compensation, stage], index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    ownerId,
    applicationId: null,
    version: 1,
    createdAt: `${day(-12 + index)}T14:00:00.000Z`,
    updatedAt: `${day(-(index % 3))}T14:00:00.000Z`,
    company,
    role,
    stage: stage as (typeof STAGES)[number],
    jobUrl: '',
    jobDescription: `Join the ${company} team to build thoughtful digital experiences.`,
    location,
    compensation,
    priority: index === 0 ? 'high' : 'medium',
    tags: index % 2 ? ['Product', 'Full-time'] : ['Design', 'Remote'],
    appliedDate: stage === 'Saved' ? null : day(-12 + index),
    deadline: null,
    archived: false,
    submittedResumeVersionId: null,
  }));
  const base = {
    ownerId,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    body: '',
    dueDate: null,
    completed: false,
    startAt: null,
    endAt: null,
    timezone: 'America/Toronto',
    email: '',
    phone: '',
    url: '',
    contactRole: '',
  };
  const entries: TrackerEntry[] = [
    {
      ...base,
      id: '20000000-0000-4000-8000-000000000001',
      applicationId: applications[0].id,
      kind: 'interview',
      title: 'Portfolio conversation',
      body: 'Walk through your strongest project and the decisions behind it.',
      startAt: `${day(1)}T15:00:00.000Z`,
      endAt: `${day(1)}T16:00:00.000Z`,
    },
    {
      ...base,
      id: '20000000-0000-4000-8000-000000000003',
      applicationId: applications[0].id,
      kind: 'task',
      title: 'Polish portfolio walkthrough',
      dueDate: day(0),
    },
    {
      ...base,
      id: '20000000-0000-4000-8000-000000000007',
      applicationId: applications[0].id,
      kind: 'note',
      title: 'What stood out',
      body: 'A small team with a strong design culture. Prepare examples of simplifying a complex workflow.',
    },
  ];
  return {
    user: { id: ownerId, name: 'Test Applicant', email: 'applicant@example.test' },
    applications,
    entries,
    resumes: [],
    analyses: [],
    drafts: [],
    versions: [],
    jobs: [],
    conversations: [],
    connection: { enabled: false, lastUsedAt: null },
    capabilities: { database: true, auth: true, storage: false, deepseek: false, openai: false },
    demo: false,
  };
}
