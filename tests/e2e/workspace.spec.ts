import { expect, test } from '@playwright/test';

test.describe('authenticated PostgreSQL workspace', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated workspace navigation redirects cleanly to /signin', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-vibecheck-preview': '1' });
    await page.goto('/applications');
    await expect(page).toHaveURL(/\/signin\?returnTo=%2Fapplications/);
    await expect(page.getByRole('heading', { name: /Sign in to your job portal/i })).toBeVisible();
    await expect(page.getByText('These are sample applications.')).toHaveCount(0);
  });

  test('persists applications, stage updates, and tasks in PostgreSQL with strict two-user RLS isolation', async ({ page }) => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const userA = `alice-${stamp}@example.test`;
    const userB = `bob-${stamp}@example.test`;

    await page.goto('/signin?mode=signup&returnTo=%2Fapplications');
    await page.getByLabel('Full name').fill('Alice');
    await page.getByLabel('Email').fill(userA);
    await page.getByLabel('Password').fill('alice-secret-123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page).toHaveURL(/\/applications$/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Add application', exact: true }).first().click();
    await page.getByRole('textbox', { name: /Company/ }).fill('Cedar Labs');
    await page.getByRole('textbox', { name: /Role/ }).fill('Design Engineer');
    await page.getByRole('button', { name: 'Save application', exact: true }).click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]+$/);

    await page.getByRole('combobox', { name: 'Stage for Cedar Labs Design Engineer' }).selectOption('Applied');
    await expect(page.getByRole('combobox', { name: 'Stage for Cedar Labs Design Engineer' })).toHaveValue('Applied');

    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Follow up with hiring manager');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Follow up with hiring manager')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Stage for Cedar Labs Design Engineer' })).toHaveValue('Applied');
    await expect(page.getByText('Follow up with hiring manager')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/signin/);

    await page.getByRole('tab', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Full name').fill('Bob');
    await page.getByLabel('Email').fill(userB);
    await page.getByLabel('Password').fill('bob-secret-123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Applications/ }).click();
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.getByText('Cedar Labs')).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/signin/);

    await page.getByLabel('Email').fill(userA);
    await page.getByLabel('Password').fill('alice-secret-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Applications/ }).click();
    await expect(page.getByRole('link', { name: /Cedar Labs/ }).first()).toBeVisible();
  });

  test('uploads and downloads a resume in PostgreSQL without Supabase Storage and displays honest settings', async ({ page }) => {
    const email = `resume-user-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
    const content = 'Samir Patel\nSenior Software Engineer with Node.js, PostgreSQL, React, and AWS experience.';

    await page.goto('/signin?mode=signup&returnTo=%2Fresumes');
    await page.getByLabel('Full name').fill('Samir');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('samir-secret-123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page).toHaveURL(/\/resumes$/, { timeout: 30_000 });
    await page.getByLabel('Resume file', { exact: true }).setInputFiles({
      name: 'samir-cv.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });
    await expect(page.getByText('samir-cv.txt', { exact: true }).first()).toBeVisible();

    const downloadHref = await page.getByRole('link', { name: 'Download original', exact: true }).getAttribute('href');
    expect(downloadHref).toMatch(/\/api\/resumes\/[\da-f-]+\?download=1/);
    const downloadRes = await page.request.get(downloadHref!);
    expect(downloadRes.status()).toBe(200);
    expect(await downloadRes.text()).toContain('Samir Patel');

    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Settings/ }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('PostgreSQL database')).toBeVisible();
    await expect(page.getByText('Account sign-in')).toBeVisible();
    await expect(page.getByText('Open ChatGPT Plugins')).toHaveCount(0);
  });
});
