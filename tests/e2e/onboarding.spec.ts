import { expect, test } from '@playwright/test';

test.describe('wizard -> resume -> account -> full portal', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('build path delivers printable/LaTeX resume first, then prompts for account to open full PostgreSQL portal', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const uniqueEmail = `jordan-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What’s your name?', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Analyze JD + resume', exact: true })).toHaveAttribute('href', '/analyze');

    await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Jordan');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get started, Jordan.', exact: true })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: /Answer a few questions/ }).click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(uniqueEmail);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('textbox', { name: 'Skills you can demonstrate', exact: true }).fill('Product design, research, accessible interfaces');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Review resume', exact: true }).click();
    await expect(page.locator('.ob-starter-preview').getByRole('heading', { name: 'Jordan', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Use this resume', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Jordan, your resume is ready.', exact: true })).toBeVisible();
    await expect(page.locator('.ob-resume-result .resume-preview-paper').getByRole('heading', { name: 'Jordan', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download .tex', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make an account to get the full portal.', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Jordan, your resume is ready.', exact: true })).toBeVisible();

    await page.getByLabel('Roles you are looking for').fill('Product designer on a small team');
    await page.getByLabel('Preferred location (optional)').fill('Toronto');
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill('secure-password-123');
    await page.getByRole('button', { name: 'Create account & open portal', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Jordan’s job portal', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link')).toHaveCount(7);

    await page.getByRole('button', { name: 'Add application', exact: true }).first().click();
    await page.getByRole('textbox', { name: /Company/ }).fill('Harbor Studio');
    await page.getByRole('textbox', { name: /Role/ }).fill('Product Designer');
    await page.getByRole('button', { name: 'Save application', exact: true }).click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]+$/);
    await expect(page.getByRole('heading', { name: 'Product Designer' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Product Designer' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('upload + tailor path runs Analyze -> Fit Report -> Resume Builder -> Preview, then saves bundle via account signup', async ({ page }) => {
    const uniqueEmail = `taylor-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Taylor');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /Upload my resume/ }).click();
    await page.getByLabel('Resume file').setInputFiles({
      name: 'taylor-resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Taylor Brooks\ntaylor@example.test | Toronto, ON\n\nExperience\n- Built TypeScript, React, Next.js, and PostgreSQL web applications.\n- Improved page accessibility across checkout and profile flows.\n\nSkills\nTypeScript, React, Next.js, PostgreSQL, Playwright',
      ),
    });
    await expect(page.getByText('taylor-resume.txt')).toBeVisible();
    const tailorButton = page.getByRole('button', { name: 'Tailor to a job description', exact: true });
    await expect(tailorButton).toHaveCSS('background-color', 'rgb(38, 89, 76)');
    await expect(tailorButton).toHaveCSS('color', 'rgb(255, 255, 255)');
    await tailorButton.click();

    await expect(page.getByRole('heading', { name: 'Compare your resume against a job description.', exact: true })).toBeVisible();
    await page.getByLabel('Target job description').fill(
      'Full-Stack Software Engineer\nRequirements: TypeScript, React, Next.js, PostgreSQL, Docker, and automated end-to-end testing.',
    );
    await page.getByLabel('Company name (optional)').fill('Northstar Labs');
    await page.getByRole('button', { name: 'Analyze Resume', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Detailed Fit Report', level: 1, exact: true })).toBeVisible({ timeout: 65_000 });
    await expect(page.getByRole('heading', { name: 'Detailed Fit Report', level: 2, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open Resume Builder', exact: true }).first().click();

    await expect(page.getByRole('heading', { name: 'Resume Builder', level: 1, exact: true })).toBeVisible();
    await expect(page.getByText('Extracted Profile', { exact: true })).toBeVisible();
    await expect(page.getByText('Targeted Follow-up Questions', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Full name/ })).toHaveValue('Taylor Brooks');
    await page.getByRole('button', { name: 'Generate Resume Preview', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Taylor, your resume is ready.', exact: true })).toBeVisible({ timeout: 65_000 });
    await expect(page.getByText(/% fit/)).toBeVisible();
    await expect(page.locator('.ob-resume-result .resume-preview-paper').getByRole('heading', { name: 'Taylor Brooks', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download .tex', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill('taylor-pass-123');
    await page.getByRole('button', { name: 'Create account & open portal', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Applications/ }).click();
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.getByRole('link', { name: /Northstar Labs/ }).first()).toBeVisible();

    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Resumes/ }).click();
    await expect(page).toHaveURL(/\/resumes$/);
    await expect(page.getByText('taylor-resume.txt', { exact: true }).first()).toBeVisible();
  });

  test('upload + keep current resume preserves original file untouched, then saves source resume on account signup', async ({ page }) => {
    const uniqueEmail = `morgan-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Morgan');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /Upload my resume/ }).click();
    await page.getByLabel('Resume file').setInputFiles({
      name: 'morgan-cv.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Morgan Lee\nmorgan@example.test | Vancouver, BC\n\nOperations Coordinator\n\nExperience\n- Managed operations and inventory across two retail locations.\n- Trained new staff members and tracked weekly supplier orders.',
      ),
    });
    await page.getByRole('button', { name: 'Keep my current resume', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Morgan, your current resume is ready.', exact: true })).toBeVisible();
    await expect(page.locator('.ob-kept-card').getByRole('heading', { name: 'morgan-cv.txt', exact: true })).toBeVisible();
    await expect(page.getByText(/Original file kept untouched/)).toBeVisible();

    await page.getByLabel('Roles you are looking for').fill('Operations Coordinator');
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill('morgan-pass-123');
    await page.getByRole('button', { name: 'Create account & open portal', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('link', { name: /Resumes/ }).click();
    await expect(page).toHaveURL(/\/resumes$/);
    await expect(page.getByText('morgan-cv.txt', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download original', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review resume', exact: true })).toHaveCount(0);
  });
});
