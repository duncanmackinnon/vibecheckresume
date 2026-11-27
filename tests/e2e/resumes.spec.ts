import { expect, test, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWorkspaceFixtureSnapshot } from './fixtures';
import type { Analysis, GeneratedResume } from '../../src/app/types';
import type { RecordKind, StoredRecord } from '../../src/lib/tracker/types';
import type { ResumeWorkspaceData } from '../../src/lib/resume-workspace/types';

// Private page fixtures require a real Auth0 browser session; API interception cannot bypass the server guard.
test.beforeEach(()=>test.skip(!process.env.PLAYWRIGHT_AUTH_STATE,'Set PLAYWRIGHT_AUTH_STATE to an authenticated browser storage state.'));

function resumeFixture() {
  const snapshot = createWorkspaceFixtureSnapshot();
  snapshot.demo = false; snapshot.applications = [snapshot.applications[0]]; snapshot.entries = [];
  snapshot.capabilities = { database: true, auth: true, storage: true, deepseek: true, openai: true };
  const app = snapshot.applications[0];
  const record = <T>(kind: RecordKind, id: string, data: T): StoredRecord<T> => ({ id, kind, ownerId: snapshot.user.id, applicationId: app.id, version: 1, createdAt: '2026-09-13T12:00:00Z', updatedAt: '2026-09-13T12:00:00Z', data });
  const sourceId = '92000000-0000-4000-8000-000000000001';
  const analysisId = '92000000-0000-4000-8000-000000000002';
  const oldVersionId = '92000000-0000-4000-8000-000000000003';
  const newVersionId = '92000000-0000-4000-8000-000000000004';
  const analysis: Analysis = {
    score: 86, matchedSkills: [{ name: 'TypeScript', match: true }], missingSkills: ['PostgreSQL'], detailedAnalysis: '## Role fit\nYour product work demonstrates useful, measurable experience.',
    recommendations: { strengths: ['Accessible product delivery'], improvements: ['Add database ownership details'], skillGaps: ['Describe your data model'], format: ['Keep the layout easy to scan'] },
    evaluation: { categories: [{ id: 'technical_skills', label: 'Technical evidence', score: 30, max: 35, evidence: 'Built an accessible TypeScript design system.' }], bonus: { score: 2, max: 10, evidence: 'Relevant shipped project.' }, deductions: { score: 0, evidence: 'No unsupported deductions.' }, fairnessNotes: ['Scoring uses job-relevant evidence.'] },
    roleRequirements: [{ text: 'Ship accessible web interfaces', status: 'matched', evidence: 'Owned keyboard navigation and screen-reader testing.' }],
    priorityActions: [{ categoryId: 'experience_relevance', title: 'Quantify the onboarding improvement', rationale: 'Show the result of the shipped work.', impact: 'high', effort: 'low', exampleRewrite: 'Reduced onboarding time by 20 percent.' }],
  };
  const generated = (name: string, content: string): GeneratedResume => ({ latex: `\\documentclass{article}\n\\begin{document}${content}\\end{document}`, preview: { fullName: name, headline: 'Product Designer', contact: ['alice@example.test'], summary: content, sections: [], skillGroups: [] }, tailoringNotes: ['Uses the selected role evidence.'], assumptions: [], followUpQuestions: [] });
  const originalAnswers = { fullName: 'Alice Saved', contactDetails: 'alice@example.test', targetTitle: 'Product Designer' };
  const data: ResumeWorkspaceData = {
    sources: [{ ...record('source_resume', sourceId, { filename: 'alice-original.txt', mimeType: 'text/plain' as const, size: 1024, storagePath: '', text: '' }), applicationId: null }],
    analyses: [record('analysis', analysisId, { sourceResumeId: sourceId, sourceText: 'Saved original source', jobDescription: app.jobDescription, analysis })],
    drafts: [{ ...record('builder_draft', '92000000-0000-4000-8000-000000000005', { analysisId, answers: originalAnswers }), version: 3 }], jobs: [],
    versions: [
      record('resume_version', newVersionId, { analysisId, sourceResumeId: sourceId, sourceText: '', jobDescription: app.jobDescription, analysis, answers: originalAnswers, generatedResume: generated('Alice Latest', 'Latest saved resume content.'), jobId: null, label: 'Latest version' }),
      { ...record('resume_version', oldVersionId, { analysisId, sourceResumeId: sourceId, sourceText: '', jobDescription: app.jobDescription, analysis, answers: originalAnswers, generatedResume: generated('Alice First', 'First saved resume content.'), jobId: null, label: 'First version' }), createdAt: '2026-09-12T12:00:00Z' },
    ],
  };
  return { snapshot, app, record, data, analysis, originalAnswers, oldVersionId, newVersionId };
}

async function mountFixture(page: Page, fixture: ReturnType<typeof resumeFixture>, mutation: (route: Route) => Promise<void>) {
  await page.route('**/api/tracker', route => route.fulfill({ json: fixture.snapshot }));
  await page.route('**/api/resumes?applicationId=*', route => route.fulfill({ json: fixture.data }));
  await page.route('**/api/resumes', route => route.request().method() === 'POST' ? mutation(route) : route.fulfill({ json: { summariesOnly: true, sources: fixture.data.sources, analyses: [], drafts: [], versions: [], jobs: [] } }));
}

async function openStudio(page: Page, applicationId: string) {
  await page.goto(`/applications/${applicationId}`);
  await page.getByRole('button', { name: 'Resumes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Full name/ })).toHaveValue('Alice Saved');
}

test('resume studio restores drafts, shows the complete fit report, chooses immutable versions and exports only the selected resume', async ({ page }) => {
  const fixture = resumeFixture();
  const actions: string[] = [];
  await mountFixture(page, fixture, async route => {
    const { action, input } = route.request().postDataJSON(); actions.push(action);
    if (action === 'save_resume_draft') {
      expect(input.expectedVersion).toBe(3);
      fixture.data.drafts[0] = { ...fixture.data.drafts[0], version: 4, data: { ...fixture.data.drafts[0].data, answers: input.answers } };
      await route.fulfill({ json: fixture.data.drafts[0] });
    } else if (action === 'select_submitted_resume') {
      expect(input.versionId).toBe(fixture.oldVersionId); expect(input.expectedVersion).toBe(1);
      fixture.snapshot.applications[0] = { ...fixture.app, submittedResumeVersionId: input.versionId, version: 2 };
      await route.fulfill({ json: { ...fixture.record('application', fixture.app.id, fixture.snapshot.applications[0]), version: 2 } });
    } else await route.fulfill({ status: 400, json: { error: `Unexpected action ${action}` } });
  });
  await openStudio(page, fixture.app.id);
  await page.getByText('Full fit report and recommendations', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evidence Scorecard' })).toBeVisible();
  await expect(page.getByText('Built an accessible TypeScript design system.', { exact: true })).toBeVisible();
  await expect(page.getByText('Accessible product delivery', { exact: true })).toBeVisible();
  await expect(page.getByText('Owned keyboard navigation and screen-reader testing.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quantify the onboarding improvement' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze Another' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download Report' })).toHaveCount(0);
  await page.getByRole('textbox', { name: /Full name/ }).fill('Alice Revised');
  await page.getByRole('button', { name: 'Save answers', exact: true }).click();
  await expect(page.getByText('Answers saved', { exact: true }).first()).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Resumes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Full name/ })).toHaveValue('Alice Revised');
  await page.getByRole('combobox', { name: 'Saved versions', exact: true }).selectOption(fixture.oldVersionId);
  await expect(page.locator('.vc-selected-resume').getByRole('heading', { name: 'Alice First', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as submitted resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submitted resume', exact: true })).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .tex', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('alice-first-resume.tex');
  expect(await readFile((await download.path())!, 'utf8')).toBe(fixture.data.versions[1].data.generatedResume.latex);
  await page.reload();
  await expect(page.locator('.vc-selected-resume').getByRole('heading', { name: 'Alice First', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Saved versions', exact: true })).toHaveValue(fixture.oldVersionId);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.resume-preview-paper').getByRole('heading', { name: 'Alice First', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Put your best version forward.' })).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: /Full name/ })).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Saved versions' })).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).not.toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  expect(actions).toEqual(['save_resume_draft', 'select_submitted_resume']);
});

for (const operation of ['analyze_resume', 'generate_resume'] as const) {
  test(`${operation} retains its request key after a lost response and reports a failed background job accurately`, async ({ page }) => {
    const fixture = resumeFixture();
    const keys: string[] = [];
    await mountFixture(page, fixture, async route => {
      const { action, input } = route.request().postDataJSON(); expect(action).toBe(operation); keys.push(input.idempotencyKey);
      if (keys.length === 1) { await route.abort('failed'); return; }
      await route.fulfill({ json: fixture.record('ai_job', '92000000-0000-4000-8000-000000000006', { status: 'failed', operation: operation === 'analyze_resume' ? 'analyze' : 'generate', error: 'The background job could not start. Use Retry.' }) });
    });
    await openStudio(page, fixture.app.id);
    const button = page.getByRole('button', { name: operation === 'analyze_resume' ? 'Analyze fit' : 'Generate new version', exact: true });
    await expect(button).toBeEnabled(); await button.click();
    await expect(page.locator('#resume-workspace [role="alert"]')).toHaveText(/Failed to fetch|NetworkError|Load failed/i);
    await expect(button).toBeEnabled(); await button.click();
    await expect(page.locator('#resume-workspace [role="alert"]')).toHaveText('The background job could not start. Use Retry.');
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.getByText(operation === 'analyze_resume' ? 'Analysis started. Your work will be saved automatically.' : 'Resume generation started. You can leave this page.', { exact: true })).toHaveCount(0);
  });
}

test('keep current resume selects the source resume inside an application', async ({ page }) => {
  const fixture = resumeFixture();
  const actions: Array<{ action: string; input: Record<string, unknown> }> = [];
  await mountFixture(page, fixture, async route => {
    const { action, input } = route.request().postDataJSON();
    actions.push({ action, input });
    if (action === 'select_current_resume') {
      fixture.snapshot.applications[0] = {
        ...fixture.app,
        submittedSourceResumeId: String(input.sourceResumeId),
        submittedResumeVersionId: null,
        version: 2,
      };
      await route.fulfill({ json: { ...fixture.record('application', fixture.app.id, fixture.snapshot.applications[0]), version: 2 } });
    } else {
      await route.fulfill({ status: 400, json: { error: `Unexpected action ${action}` } });
    }
  });

  await openStudio(page, fixture.app.id);
  await page.getByRole('button', { name: 'Keep current resume', exact: true }).click();
  await expect(page.getByText('Using your current resume: alice-original.txt')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download original', exact: true })).toHaveAttribute(
    'href',
    `/api/resumes/${fixture.data.sources[0].id}?download=1`,
  );
  await expect(page.getByRole('button', { name: 'Using current resume', exact: true }).first()).toBeDisabled();
  expect(actions).toEqual([
    {
      action: 'select_current_resume',
      input: {
        applicationId: fixture.app.id,
        sourceResumeId: fixture.data.sources[0].id,
        expectedVersion: 1,
      },
    },
  ]);
});

test('legacy session import requires an application and explicit confirmation and attaches no generated resume by default', async ({ page }) => {
  const fixture = resumeFixture(); let imports = 0;
  await page.addInitScript(({ analysis, answers, generatedResume, jobDescription }) => {
    sessionStorage.setItem('latestAnalysis', JSON.stringify(analysis)); sessionStorage.setItem('latestResumeGenerationAnswers', JSON.stringify(answers));
    sessionStorage.setItem('latestGeneratedResume', JSON.stringify(generatedResume)); sessionStorage.setItem('latestJobDescription', jobDescription);
  }, { analysis: fixture.analysis, answers: fixture.originalAnswers, generatedResume: fixture.data.versions[1].data.generatedResume, jobDescription: fixture.app.jobDescription });
  await mountFixture(page, fixture, async route => {
    const { action, input } = route.request().postDataJSON(); expect(action).toBe('import_legacy');
    expect(input).toMatchObject({ applicationId: fixture.app.id, company: fixture.app.company, role: fixture.app.role, confirmed: true, attachGenerated: false });
    imports += 1; await route.fulfill({ json: { analysis: fixture.data.analyses[0], alreadyImported: false } });
  });
  await page.goto('/resumes');
  const button = page.getByRole('button', { name: 'Import previous analysis', exact: true });
  await expect(button).toBeDisabled();
  await page.getByRole('combobox', { name: 'Application', exact: true }).selectOption(fixture.app.id);
  await expect(button).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /Also attach the generated resume/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /I confirm this analysis belongs to/ }).check();
  await button.click();
  await expect(page.getByRole('heading', { name: 'Bring your previous work along' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bring your previous work along' })).toHaveCount(0);
  expect(imports).toBe(1);
});
