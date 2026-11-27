import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Page from '../page';
import { createOnboardingSession, writeOnboardingSession, writeWizardResult } from '@/lib/onboarding/session';
import { buildStarterResume } from '@/lib/onboarding/starter-resume';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

test('a failed account connection can be retried without losing the completed resume', async () => {
  const session = createOnboardingSession();
  session.profile.displayName = 'Jordan';
  session.screen = 'result';
  session.answers = { ...session.answers, fullName: 'Jordan', email: 'jordan@example.test', skills: 'TypeScript' };
  writeOnboardingSession(session);
  writeWizardResult({
    schemaVersion: 1,
    generatedResume: buildStarterResume(session.answers).generatedResume,
    analysis: null, answers: {}, company: '', targetRole: '', jobUrl: '', jobDescription: '', updatedAt: new Date().toISOString(),
  });
  (global.fetch as jest.Mock)
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      authenticated: false, userId: null, profile: null, draft: null, connection: null,
      capabilities: { auth: true, database: true, storage: false, deepseek: false, openai: false },
    }) });

  render(<Page />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry account connection' }));
  expect(await screen.findByRole('button', { name: 'Create account & open portal' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'Jordan, your resume is ready.' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Download .tex' })).toBeVisible();
});

beforeEach(() => {
  localStorage.clear();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      authenticated: false,
      profile: null,
      connection: null,
      capabilities: { auth: false, auth0: false, database: false, storage: false, deepseek: false, openai: false },
    }),
  });
});

test('starts with the name, preserves it across reload, and links to JD + resume analysis', async () => {
  const first = render(<Page />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What’s your name?');
  expect(screen.getByRole('link', { name: 'Analyze JD + resume' })).toHaveAttribute('href', '/analyze');
  await screen.findByText('Account database not configured');
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Jordan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Let’s get started, Jordan.');
  await waitFor(() => expect(localStorage.getItem('vibecheck:onboarding:v1')).toContain('Jordan'));
  first.unmount();
  render(<Page />);
  expect(await screen.findByRole('button', { name: /Answer a few questions/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Let’s get started, Jordan.');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('delivers the built resume immediately after the wizard and shows the full portal prompt', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      authenticated: false,
      profile: null,
      connection: null,
      capabilities: { auth: true, auth0: false, database: true, storage: false, deepseek: false, openai: false },
    }),
  });

  render(<Page />);
  await screen.findByRole('link', { name: 'Sign in' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Jordan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: /Answer a few questions/ }));

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Skills you can demonstrate'), { target: { value: 'TypeScript, Accessibility' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use this resume' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Jordan, your resume is ready.' })).toBeVisible();
  expect(document.querySelector('.resume-preview-paper')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download .tex' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: 'Make an account to get the full portal.' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Create account & open portal' })).toBeVisible();

  fireEvent.change(screen.getByLabelText('Roles you are looking for'), { target: { value: 'Software engineer' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secure-password-123' } });
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { id: 'new-user' } }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Workspace unavailable' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Create account & open portal' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Your account is ready, but we could not load your workspace.');
  expect(screen.getByRole('button', { name: 'Sign in & open portal' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Download .tex' })).toBeVisible();
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test('upload path allows keeping the current resume untouched before portal signup', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      authenticated: false,
      profile: null,
      connection: null,
      capabilities: { auth: true, auth0: false, database: true, storage: false, deepseek: false, openai: false },
    }),
  });

  render(<Page />);
  await screen.findByRole('link', { name: 'Sign in' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Jordan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: /Upload my resume/ }));

  const resumeText = 'Jordan Lee\njordan@example.test\n\nExperience\nBuilt TypeScript and React applications.';
  const file = new File([resumeText], 'jordan-cv.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => resumeText });
  fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [file] } });

  const keepButton = screen.getByRole('button', { name: 'Keep my current resume' });
  expect(keepButton).toBeEnabled();
  fireEvent.click(keepButton);

  expect(await screen.findByRole('heading', { level: 1, name: 'Jordan, your current resume is ready.' })).toBeVisible();
  expect(screen.getByText('jordan-cv.txt')).toBeVisible();
  expect(screen.getByText('TXT original')).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: 'Make an account to get the full portal.' })).toBeVisible();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('upload -> tailor path follows the old Fit Report -> Resume Builder -> Preview flow and lets users switch to keeping current resume', async () => {
  const analysisPayload = {
    mode: 'deterministic',
    analysis: {
      score: 84,
      matchedSkills: [{ name: 'TypeScript', match: true }, { name: 'React', match: true }],
      missingSkills: ['Docker'],
      recommendations: {
        strengths: ['Strong TypeScript UI delivery'],
        improvements: ['Add measurable impact outcomes'],
        skillGaps: ['Docker containerization'],
        format: ['Keep one-page density'],
      },
      detailedAnalysis: 'Strong frontend alignment.',
      resumeBuilderProfile: {
        fullName: 'Jordan Lee',
        email: 'jordan@example.test',
        links: ['linkedin.com/in/jordan'],
        headline: 'Frontend Engineer',
        workHighlights: ['Built TypeScript and React applications.'],
        education: [],
        skills: ['TypeScript', 'React'],
        projects: [],
        awardsCertifications: [],
      },
      roleRequirements: [
        { text: 'Build React interfaces', status: 'matched', evidence: 'Built TypeScript and React applications.' },
      ],
      priorityActions: [
        {
          categoryId: 'experience_relevance',
          title: 'Add impact metrics',
          rationale: 'Include measurable outcomes.',
          impact: 'high',
          effort: 'low',
        },
      ],
    },
  };
  const generatedPayload = {
    mode: 'deterministic',
    generatedResume: {
      latex: '\\documentclass{article}\n\\begin{document}Jordan Lee\\end{document}',
      preview: {
        fullName: 'Jordan Lee',
        headline: 'Frontend Engineer',
        contact: ['jordan@example.test', 'linkedin.com/in/jordan'],
        sections: [{ title: 'Experience', items: [{ heading: 'Frontend Engineer', details: ['Cut load time by 30%.'] }] }],
        skillGroups: [{ label: 'Matched Role Skills', skills: ['TypeScript', 'React'] }],
      },
      tailoringNotes: ['Prioritized matched skills.'],
      assumptions: [],
      followUpQuestions: [],
    },
  };

  (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/onboarding')) {
      return {
        ok: true,
        json: async () => ({
          authenticated: false,
          profile: null,
          connection: null,
          capabilities: { auth: true, auth0: false, database: true, storage: false, deepseek: false, openai: false },
        }),
      };
    }
    if (url.includes('/api/resumes/session') && init?.body) {
      const parsed = JSON.parse(String(init.body));
      if (parsed.action === 'analyze') {
        return { ok: true, json: async () => analysisPayload };
      }
      if (parsed.action === 'generate') {
        return { ok: true, json: async () => generatedPayload };
      }
    }
    return { ok: false, json: async () => ({ error: 'Unexpected request' }) };
  });

  render(<Page />);
  await screen.findByRole('link', { name: 'Sign in' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Jordan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: /Upload my resume/ }));

  const resumeText = 'Jordan Lee\njordan@example.test\n\nExperience\nBuilt TypeScript and React applications.';
  const file = new File([resumeText], 'jordan-cv.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => resumeText });
  fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Tailor to a job description' }));

  const jdField = await screen.findByLabelText('Target job description');
  fireEvent.change(jdField, {
    target: { value: 'Frontend Engineer\nRequirements: TypeScript, React, Docker, measurable impact metrics.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Resume' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Detailed Fit Report' })).toBeVisible();
  expect(screen.getByText('84%')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: 'Open Resume Builder' })[0]);

  expect(await screen.findByRole('heading', { level: 1, name: 'Resume Builder' })).toBeVisible();
  expect(screen.getByText('Extracted Profile')).toBeVisible();
  expect(screen.getByText('Targeted Follow-up Questions')).toBeVisible();
  expect(screen.getByText('Priority Inputs')).toBeVisible();
  expect(screen.getByText('Role Signals')).toBeVisible();
  expect(screen.getByDisplayValue('Jordan Lee')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Generate Resume Preview' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Jordan, your resume is ready.' })).toBeVisible();
  expect(document.querySelector('.resume-preview-paper')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download .tex' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Keep current resume instead' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Jordan, your current resume is ready.' })).toBeVisible();
  expect(screen.getByText('jordan-cv.txt')).toBeVisible();
  expect(screen.getByText('84% fit recorded')).toBeVisible();
});

test('keeps "GitHub | LinkedIn | Portfolio" out of "Roles you are looking for" and suggests the actual experience role', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      authenticated: false,
      profile: null,
      connection: null,
      capabilities: { auth: true, auth0: false, database: true, storage: false, deepseek: false, openai: false },
    }),
  });

  render(<Page />);
  await screen.findByRole('link', { name: 'Sign in' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Jordan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: /Upload my resume/ }));

  const resumeText = [
    'Jordan Lee',
    'jordan@example.test | Toronto, ON',
    'GitHub | LinkedIn | Portfolio',
    '',
    'Experience',
    'Senior Full-Stack Engineer | Acme Corp | 2022 - Present',
    '- Built distributed TypeScript services.',
  ].join('\n');
  const file = new File([resumeText], 'jordan-cv.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => resumeText });
  fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Keep my current resume' }));

  const rolesInput = await screen.findByLabelText('Roles you are looking for');
  expect(rolesInput).toHaveValue('Senior Full-Stack Engineer');
});
