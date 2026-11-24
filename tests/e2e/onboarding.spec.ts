import { expect, test } from '@playwright/test';
import { createOnboardingSession, ONBOARDING_SESSION_KEY } from '../../src/lib/onboarding/session';
import { createOnboardingProfile } from '../../src/lib/onboarding/types';
import { createStarterResumeAnswers } from '../../src/lib/onboarding/starter-resume';

test.describe('public onboarding',()=>{
  test.use({storageState:{cookies:[],origins:[]}});
  test.beforeEach(async({page})=>{await page.route('**/api/onboarding',route=>route.fulfill({json:{authenticated:false,userId:null,draft:null,profile:null,connection:null,capabilities:{auth:false,database:false,storage:false,openai:false,deepseek:false}}}));});
test('name and builder onboarding survive reload and open a personalized session portal', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') requests.push(request.url()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What’s your name?', exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/onboarding-name-${test.info().project.name}.png`, fullPage: true, animations:'disabled' });
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Jordan');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Let’s get started, Jordan.', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Answer a few questions/ }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('jordan@example.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('textbox', { name: 'Skills you can demonstrate', exact: true }).fill('Product design, research, accessible interfaces');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Review resume', exact: true }).click();
  await expect(page.locator('.ob-starter-preview').getByRole('heading', { name: 'Jordan', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.resume-preview-paper').getByRole('heading', { name: 'Jordan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use this resume', exact: true })).not.toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Use this resume', exact: true }).click();
  await page.getByRole('textbox', { name: /Roles you’re interested in/ }).fill('Product designer on a small team');
  await page.getByRole('textbox', { name: 'Where would you like to work?', exact: true }).fill('Toronto');
  await page.getByRole('checkbox', { name: 'Remote', exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How often should we look?' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /When I ask/ })).toBeChecked();
  await page.getByRole('radio', { name: /Once a week/ }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert').filter({hasText:'Opt in'})).toBeVisible();
  await page.getByRole('checkbox', { name: /scheduled job searches/ }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Jordan’s job portal.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open my session preview', exact: true }).click();
  await expect(page).toHaveURL(/dashboard\?preview=1/);
  await expect(page.getByRole('link', { name: 'Jordan’s job portal', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link')).toHaveCount(7);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Jordan’s job portal', exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/personalized-portal-${test.info().project.name}.png`, fullPage: true, animations:'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(requests).toEqual([]);
});

test('local upload stays on the device and requires reselection after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Taylor');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Upload my resume/ }).click();
  await page.getByLabel('Resume file').setInputFiles({ name: 'taylor.txt', mimeType: 'text/plain', buffer: Buffer.from('Taylor\nProduct designer') });
  await expect(page.getByText('Selected in this tab · Not uploaded yet')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Please select this file again after reloading')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with this file', exact: true })).toBeDisabled();
});

});

test('authenticated completion saves the generated source and reports a schedule delay honestly', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_AUTH_STATE,'Set PLAYWRIGHT_AUTH_STATE to an authenticated browser storage state.');
  const profile = { ...createOnboardingProfile('Morgan'), step: 'connect' as const, resumePath: 'build' as const, preferences: { ...createOnboardingProfile().preferences, roles: 'Frontend engineer' }, cadence: 'weekly' as const, discoveryConsent: true };
  const session = { ...createOnboardingSession(), profile, screen: 'finish' as const, builtResume: true, pendingSignIn: true, answers: { ...createStarterResumeAnswers('Morgan'), email: 'morgan@example.test', skills: 'TypeScript' } };
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), { key: ONBOARDING_SESSION_KEY, value: session });
  const meta = { id: '93000000-0000-4000-8000-000000000001', kind: 'profile', ownerId: '93000000-0000-4000-8000-000000000002', applicationId: null, version: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await page.route('**/api/onboarding', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: { authenticated: true, userId:meta.ownerId,draft:null,profile: { ...meta, data: profile }, capabilities: { auth: true, database: true, storage: false, openai: false, deepseek: false }, connection: null } }); return; }
    const body = route.request().postDataJSON();
    expect(body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
    if(body.action==='save_draft'){await route.fulfill({json:{draft:{...meta,kind:'onboarding_draft',data:body.input}}});return;}
    if (body.action === 'save_starter_resume') await route.fulfill({ json: { resume: { id: '93000000-0000-4000-8000-000000000003' }, profile: { ...meta, data: profile } } });
    else {
      expect(body.action).toBe('save_profile'); expect(body.expectedVersion).toBe(3);
      expect(body.input).toMatchObject({ sourceResumeId: '93000000-0000-4000-8000-000000000003', step: 'complete', cadence: 'weekly', discoveryConsent: true });
      await route.fulfill({ json: { profile: { ...meta, version: 4, data: { ...body.input, completedAt: new Date().toISOString() } }, scheduleError: 'Search provider is not configured.' } });
    }
  });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Open my job portal', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your profile is saved, but scheduled searches could not start yet.');
  await expect(page.getByRole('link', { name: 'Continue to my saved portal', exact: true })).toBeVisible();
});


test('private onboarding restores unfinished answers and autosaves the current builder step',async({page})=>{
  test.skip(!process.env.PLAYWRIGHT_AUTH_STATE,'Set PLAYWRIGHT_AUTH_STATE to an authenticated browser storage state.');
  const ownerId='94000000-0000-4000-8000-000000000001';
  const profile={...createOnboardingProfile('Casey'),step:'build' as const,resumePath:'build' as const};
  let saved={id:'94000000-0000-4000-8000-000000000002',ownerId,applicationId:null,kind:'onboarding_draft',version:7,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),data:{profile,screen:'build',builderStep:3,answers:{...createStarterResumeAnswers('Casey'),email:'unfinished@'},builtResume:false}};
  const writes:Record<string,unknown>[]=[];
  await page.route('**/api/onboarding',async route=>{
    if(route.request().method()==='GET'){await route.fulfill({json:{authenticated:true,userId:ownerId,draft:saved,profile:null,connection:null,capabilities:{auth:true,database:true,storage:false,openai:false,deepseek:false}}});return;}
    const body=route.request().postDataJSON();writes.push(body);
    expect(body.action).toBe('save_draft');expect(body.expectedVersion).toBe(saved.version);
    saved={...saved,version:saved.version+1,data:body.input};await route.fulfill({json:{draft:saved}});
  });
  await page.goto('/onboarding');
  await expect(page.getByRole('heading',{name:'What have you learned?',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'School or provider',exact:true}).fill('Community college');
  await expect.poll(()=>writes.length).toBe(1);
  expect(saved.data.answers.email).toBe('unfinished@');expect(saved.data.builderStep).toBe(3);
  await page.reload();
  await expect(page.getByRole('textbox',{name:'School or provider',exact:true})).toHaveValue('Community college');
});
