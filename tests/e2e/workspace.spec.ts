import { expect, test } from '@playwright/test';

test.use({storageState:{cookies:[],origins:[]}});

test('private pages never silently show sample data, even with a forged preview header',async({page})=>{
  await page.setExtraHTTPHeaders({'x-vibecheck-preview':'1'});
  await page.goto('/applications');
  await expect(page.getByText('These are sample applications.',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Your applications.'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:/sample|preview/i}).first()).toBeVisible();
});

test('preview remains isolated through navigation and reload', async ({ page }) => {
  await page.goto('/dashboard?preview=1');
  await expect(page.getByText('These are sample applications.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your application journey' })).toBeVisible();
  await page.screenshot({ path: `artifacts/vibecheck-${test.info().project.name}.png`, fullPage: true, animations:'disabled' });
  await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Discover/ }).click();
  await expect(page).toHaveURL(/discover\?preview=1/);
  await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Applications/ }).click();
  await expect(page).toHaveURL(/applications\?preview=1/);
  await expect(page.getByRole('heading', { name: 'Your applications.' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('These are sample applications.', { exact: false })).toBeVisible();
});

test('application search works in both board and list views', async ({ page }) => {
  await page.goto('/applications?preview=1');
  await page.getByRole('textbox', { name: 'Search applications' }).fill('Figma');
  await expect(page.getByRole('link', { name: /Design Engineer Figma/ })).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Stage for Figma Design Engineer' })).toHaveValue('Screening');
  await page.getByRole('textbox', { name: 'Search applications' }).fill('no-such-opportunity');
  await expect(page.getByRole('heading', { name: 'No matches just yet.' })).toBeVisible();
});

test('sample application writes stay blocked', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/tracker')) writes.push(request.url()); });
  await page.goto('/dashboard?preview=1');
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: /Company/ }).fill('Test opportunity');
  await page.getByRole('textbox', { name: /Role/ }).fill('Test role');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(page.getByText('This is a read-only preview. Sign in to save your own applications.')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Polish portfolio walkthrough' }).click();
  await expect(page.getByRole('button', { name: 'Complete Polish portfolio walkthrough' })).toBeVisible();
  expect(writes).toHaveLength(0);
});

test('application detail keeps notes, contacts, interviews and activity together', async ({ page }) => {
  await page.goto('/applications?preview=1');
  await page.getByRole('textbox', { name: 'Search applications' }).fill('Linear');
  await page.getByRole('link', { name: 'Product Designer Linear', exact: true }).click();
  await expect(page).toHaveURL(/applications\/[\da-f-]+\?preview=1/);
  await expect(page.getByRole('heading', { name: 'What stood out' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Morgan Lee' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Portfolio conversation' })).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The story so far' })).toBeVisible();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A conversation about this opportunity.' })).toBeVisible();
});

test('settings explain service readiness and ChatGPT connection requirements', async ({ page }) => {
  await page.goto('/settings?preview=1');
  await expect(page.getByRole('heading', { name: 'Bring your search into ChatGPT' })).not.toBeVisible();
  await page.getByText('Optional: use VibeCheck inside ChatGPT', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bring your search into ChatGPT' })).toBeVisible();
  await expect(page.getByText(/localhost cannot be connected from ChatGPT/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy connection URL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disconnect ChatGPT', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Continue with ChatGPT',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open ChatGPT Plugins',exact:true})).toHaveAttribute('href','https://chatgpt.com/plugins');
  await expect(page.getByText(/No website OpenAI account link or API key is needed for ChatGPT itself/)).toBeVisible();
  await expect(page.getByText('Open ChatGPT Plugins and choose Add custom MCP server.')).toBeVisible();
});

test('assistant preview offers website actions without a ChatGPT dependency',async({page})=>{
  await page.goto('/assistant?preview=1');
  await expect(page.getByRole('link',{name:'Explore applications',exact:true})).toHaveAttribute('href','/applications?preview=1');
  await expect(page.getByRole('link',{name:'Workspace settings',exact:true})).toHaveAttribute('href','/settings?preview=1');
  await expect(page.getByRole('link',{name:/Open ChatGPT Plugins/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Continue with ChatGPT',exact:true})).toHaveCount(0);
});

test('discovery preview offers manual entry without leaving the sample workspace',async({page})=>{
  await page.goto('/discover?preview=1');
  await expect(page.getByRole('link',{name:'Add a job manually',exact:true})).toHaveAttribute('href','/applications?preview=1');
  await expect(page.getByRole('link',{name:/Open ChatGPT Plugins/})).toHaveCount(0);
});

test('dialog supports keyboard dismissal and the page fits the viewport', async ({ page }) => {
  await page.goto('/dashboard?preview=1');
  await page.getByRole('button', { name: 'Add application', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
