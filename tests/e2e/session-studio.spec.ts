import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('preview session resume studio analyzes fit, generates a tailored resume, and exports .tex without login', async ({ page }) => {
  await page.goto('/resumes?preview=1');
  await expect(page.getByRole('heading', { name: /Bring your resume, analyze fit/i })).toBeVisible();

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

  await page.getByRole('button', { name: 'Analyze fit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detailed Fit Report' })).toBeVisible({ timeout: 65_000 });
  await expect(page.getByRole('textbox', { name: /Full name/ })).toHaveValue('Duncan MacKinnon');
  await expect(page.getByRole('textbox', { name: /Contact details/ })).not.toHaveValue(/Next\.js/);

  await page.getByRole('button', { name: 'Generate tailored resume', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Tailored resume & LaTeX export/i })).toBeVisible({ timeout: 65_000 });
  await expect(page.getByRole('button', { name: 'Download .tex', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Detailed Fit Report' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tailored resume & LaTeX export/i })).toBeVisible();
});
