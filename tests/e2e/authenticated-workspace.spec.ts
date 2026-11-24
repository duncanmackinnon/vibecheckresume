import { expect, test } from '@playwright/test';
import { createDemoSnapshot } from '../../src/lib/tracker/demo';
import type { Application, TrackerEntry } from '../../src/lib/tracker/types';
import type { ResumeWorkspaceData } from '../../src/lib/resume-workspace/types';

// Private page fixtures require a real Auth0 browser session; API interception cannot bypass the server guard.
test.beforeEach(()=>test.skip(!process.env.PLAYWRIGHT_AUTH_STATE,'Set PLAYWRIGHT_AUTH_STATE to an authenticated browser storage state.'));

// These browser fixtures exercise the live UI contract, not an authentication bypass.
// Real authentication, ownership and persistence are exercised by service/API tests.
test('authenticated UI creates, edits, reloads and follows application deep links', async ({ page }) => {
  const state = createDemoSnapshot();
  state.demo = false;
  state.user = { ...state.user, name: 'Test Applicant', email: 'applicant@example.test' };
  state.applications = [];
  state.entries = [];
  state.capabilities = { database: true, auth: true, storage: false, deepseek: false, openai: false };
  const applicationId = '90000000-0000-4000-8000-000000000001';
  const taskId = '90000000-0000-4000-8000-000000000002';
  const seenActions: string[] = [];
  await page.route('**/api/tracker', route => route.fulfill({ json: state }));
  await page.route('**/api/tracker/actions', async route => {
    const { action, input, idempotencyKey } = route.request().postDataJSON();
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeGreaterThan(10);
    seenActions.push(action);
    const meta = { ownerId: state.user.id, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (action === 'create_application') {
      expect(input.company).toBe('Thoughtful Studio');
      const application: Application = { ...meta, id: applicationId, applicationId: null, archived: false, submittedResumeVersionId: null, ...input };
      state.applications = [application];
      await route.fulfill({ json: { result: application } });
    } else if (action === 'update_application') {
      const app = state.applications[0];
      expect(input.id).toBe(applicationId);
      expect(input.expectedVersion).toBe(app.version);
      const { id: _id, expectedVersion: _version, ...patch } = input;
      state.applications[0] = { ...app, ...patch, version: app.version + 1 };
      await route.fulfill({ json: { result: state.applications[0] } });
    } else if (action === 'create_task') {
      expect(input.applicationId).toBe(applicationId);
      const task: TrackerEntry = { ...meta, id: taskId, kind: 'task', completed: false, dueDate: null, body: '', startAt: null, endAt: null, timezone: 'UTC', email: '', phone: '', url: '', contactRole: '', ...input };
      state.entries = [task];
      await route.fulfill({ json: { result: task } });
    } else if (action === 'update_task') {
      const task = state.entries[0];
      expect(input.id).toBe(taskId);
      expect(input.expectedVersion).toBe(task.version);
      expect(input).not.toHaveProperty('applicationId');
      state.entries[0] = { ...task, completed: input.completed, version: task.version + 1 };
      await route.fulfill({ json: { result: state.entries[0] } });
    } else await route.fulfill({ status: 400, json: { error: `Unexpected fixture action: ${action}` } });
  });

  await page.goto('/applications');
  await expect(page.getByText('Private workspace', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add application', exact: true }).first().click();
  await page.getByRole('textbox', { name: /Company/ }).fill('Thoughtful Studio');
  await page.getByRole('textbox', { name: /Role/ }).fill('Product Designer');
  await page.getByRole('textbox', { name: 'Job description', exact: true }).fill('Design useful tools with a thoughtful team.');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
  await expect(page.getByRole('heading', { name: 'Product Designer', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByRole('textbox', { name: /Role/ }).fill('Senior Product Designer');
  await page.getByRole('combobox', { name: 'Stage', exact: true }).selectOption('Applied');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Senior Product Designer', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Stage for Thoughtful Studio Senior Product Designer' })).toHaveValue('Applied');

  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Prepare portfolio walkthrough');
  await page.getByLabel('Due date', { exact: true }).fill('2026-09-25');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Prepare portfolio walkthrough', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen Prepare portfolio walkthrough', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'All applications', exact: true }).click();
  await page.getByRole('link', { name: 'Senior Product Designer Thoughtful Studio', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
  await expect(page.getByRole('button', { name: 'Reopen Prepare portfolio walkthrough', exact: true })).toBeVisible();
  expect(seenActions).toEqual(['create_application', 'update_application', 'create_task', 'update_task']);
});

test('a conflicting edit reloads the current record and explains what happened', async ({ page }) => {
  const state = createDemoSnapshot();
  state.demo = false;
  state.applications = [state.applications[0]];
  const app = state.applications[0];
  await page.route('**/api/tracker', route => route.fulfill({ json: state }));
  await page.route('**/api/tracker/actions', async route => {
    const { action, input } = route.request().postDataJSON();
    expect(action).toBe('update_application');
    expect(input.expectedVersion).toBe(1);
    state.applications[0] = { ...app, role: 'Updated in another window', version: 2 };
    await route.fulfill({ status: 409, json: { error: 'This application changed elsewhere.' } });
  });
  await page.goto(`/applications/${app.id}`);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByRole('textbox', { name: /Role/ }).fill('An outdated edit');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('This record changed elsewhere. The latest version is loaded; please try your edit again.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updated in another window', exact: true })).toBeVisible();
});

test('printing a selected resume hides the studio, version controls and tracker', async ({ page }) => {
  const state = createDemoSnapshot();
  state.demo = false;
  const application = state.applications[0];
  const resumes: ResumeWorkspaceData = { sources: [], analyses: [], drafts: [], jobs: [], versions: [{
    id: '91000000-0000-4000-8000-000000000001', ownerId: state.user.id, applicationId: application.id, kind: 'resume_version', version: 1,
    createdAt: '2026-09-13T12:00:00.000Z', updatedAt: '2026-09-13T12:00:00.000Z',
    data: { analysisId: '91000000-0000-4000-8000-000000000002', sourceResumeId: null, sourceText: '', jobDescription: application.jobDescription, jobId: null, label: 'First tailored version', answers: {},
      analysis: { score: 82, matchedSkills: [], missingSkills: [], detailedAnalysis: 'Relevant experience.', recommendations: { improvements: [], strengths: [], skillGaps: [], format: [] } },
      generatedResume: { latex: 'Test resume', tailoringNotes: [], assumptions: [], followUpQuestions: [], preview: { fullName: 'Test Applicant', headline: 'Product Designer', contact: ['applicant@example.test'], summary: 'Designing clear, useful products.', sections: [], skillGroups: [] } },
    },
  }] };
  await page.route('**/api/tracker', route => route.fulfill({ json: state }));
  await page.route('**/api/resumes?applicationId=*', route => route.fulfill({ json: resumes }));
  await page.goto(`/applications/${application.id}?resumeVersion=${resumes.versions[0].id}#resume-workspace`);
  await expect(page.getByRole('heading', { name: 'Put your best version forward.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test Applicant', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Test Applicant', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Put your best version forward.' })).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Saved versions' })).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as submitted resume' })).not.toBeVisible();
  await page.emulateMedia({ media: 'screen' });
});

test('saved notes can be edited and reopened after a reload', async ({ page }) => {
  const state = createDemoSnapshot();
  state.demo = false;
  const application = state.applications[0];
  const note = state.entries.find(entry => entry.applicationId === application.id && entry.kind === 'note')!;
  await page.route('**/api/tracker', route => route.fulfill({ json: state }));
  await page.route('**/api/tracker/actions', async route => {
    const { action, input } = route.request().postDataJSON();
    expect(action).toBe('update_note');
    expect(input.id).toBe(note.id);
    expect(input.expectedVersion).toBe(note.version);
    expect(input).not.toHaveProperty('applicationId');
    const updated = { ...note, title: input.title, body: input.body, version: note.version + 1 };
    state.entries = state.entries.map(entry => entry.id === note.id ? updated : entry);
    await route.fulfill({ json: { result: updated } });
  });
  await page.goto(`/applications/${application.id}`);
  await page.getByRole('button', { name: `Edit ${note.title}`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Preparation for the conversation');
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Ask about how the team evaluates design decisions.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preparation for the conversation', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ask about how the team evaluates design decisions.', { exact: true })).toBeVisible();
});
