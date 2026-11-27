import { expect, test } from '@playwright/test';

test.describe('JD + Current Resume analysis and tracker adoption', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/analyze runs 4-step Analyze -> Fit Report -> Resume Builder -> Preview flow and saves into PostgreSQL tracker via signup', async ({ page }) => {
    const email = `studio-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
    await page.goto('/analyze');
    await expect(page.getByRole('heading', { name: /Compare your resume against a job description, or keep your current resume/i })).toBeVisible();

    await page.getByLabel('Session resume file').setInputFiles({
      name: 'duncan-resume.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Duncan MacKinnon\nduncan@example.com | 555-222-3333 | linkedin.com/in/duncan\n\nExperience\nBuilt full-stack TypeScript, React, Next.js, and PostgreSQL web apps.\nDeployed CI pipelines and Playwright suites.\n',
      ),
    });
    await expect(page.getByText('duncan-resume.txt', { exact: true })).toBeVisible();

    await page
      .getByRole('textbox', { name: 'Target job description' })
      .fill(
        'Full-Stack Software Engineer\nRequirements: TypeScript, React, Next.js, PostgreSQL, Docker, and automated testing across CI workflows.',
      );

    await page.getByRole('button', { name: 'Analyze Resume', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Detailed Fit Report', level: 2, exact: true }).first()).toBeVisible({ timeout: 65_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.getByRole('button', { name: 'Open Resume Builder', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Resume Builder', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Full name/ })).toHaveValue('Duncan MacKinnon');

    await page.getByRole('button', { name: 'Generate Resume Preview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Resume Preview', exact: true })).toBeVisible({ timeout: 65_000 });
    await expect(page.getByRole('button', { name: 'Download .tex', exact: true })).toBeVisible();

    await page.getByLabel('Company').fill('Stripe');
    await page.getByLabel('Role title').fill('Full-Stack Software Engineer');
    await page.getByRole('button', { name: /Save to Job Tracker/ }).click();

    await expect(page).toHaveURL(/\/signin\?mode=signup&adopt=1/);
    await page.getByLabel('Full name').fill('Duncan');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('studio-pass-123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page).toHaveURL(/\/applications\/[\da-f-]+/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Full-Stack Software Engineer', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Saved analysis')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Full-Stack Software Engineer', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Saved analysis')).toBeVisible();
  });

  test('/analyze lets user keep current resume and saves it as the active application resume', async ({ page }) => {
    const email = `kept-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;
    await page.goto('/analyze');

    await page.getByLabel('Session resume file').setInputFiles({
      name: 'duncan-current.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'Duncan MacKinnon\nduncan@example.com | 555-222-3333\n\nExperience\nBuilt full-stack TypeScript and PostgreSQL applications.',
      ),
    });
    await expect(page.getByText('duncan-current.txt', { exact: true })).toBeVisible();

    await page
      .getByRole('textbox', { name: 'Target job description' })
      .fill(
        'Full-Stack Software Engineer\nRequirements: TypeScript, PostgreSQL, and React delivery.',
      );

    await page.getByRole('button', { name: 'Keep current resume', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Using your original resume as-is', exact: true })).toBeVisible();
    await expect(page.getByText('duncan-current.txt', { exact: true })).toBeVisible();

    await page.getByLabel('Company').fill('Vercel');
    await page.getByLabel('Role title').fill('Product Engineer');
    await page.getByRole('button', { name: /Save to Job Tracker/ }).click();

    await expect(page).toHaveURL(/\/signin\?mode=signup&adopt=1/);
    await page.getByLabel('Full name').fill('Duncan');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('kept-pass-123');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page).toHaveURL(/\/applications\/[\da-f-]+/, { timeout: 65_000 });
    await expect(page.getByText('Using your current resume: duncan-current.txt')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download original', exact: true })).toBeVisible();
  });
});
