/** @jest-environment node */
import { POST } from '../route';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { generateTailoredResume } from '@/app/lib/resumeGenerator';

jest.mock('@/app/lib/deepseekEnhancer', () => ({ analyzeWithAI: jest.fn() }));
jest.mock('@/app/lib/resumeGenerator', () => ({
  ...jest.requireActual('@/app/lib/resumeGenerator'),
  generateTailoredResume: jest.fn(),
}));

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.ENABLE_LLM;
  jest.resetAllMocks();
});

afterAll(() => {
  process.env = originalEnv;
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://vibecheck.example.test/api/resumes/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://vibecheck.example.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('formatting retains every source line, separate employers, dates, and custom sections', async () => {
  const lines = ['Jordan Lee', 'jordan@example.test | Toronto', 'Professional Summary',
    'Experienced operations leader with a record of measurable improvements.', 'Work Experience',
    'Operations Manager | Harbor Ltd | 2015-2020', ...Array.from({length: 14}, (_, i) => `- Delivered verified achievement ${i + 1} with ${i + 11}% improvement.`),
    'Program Director | Cedar Inc | 2020-Present', '- Led a team of 18 across three locations.',
    'COMMUNITY LEADERSHIP', 'Volunteer coordinator, 2017-Present', 'Education', 'MBA, Example University, 2014'];
  const result = await POST(jsonRequest({ action: 'format', resumeText: lines.join('\n'), targetTitle: 'Chief Operating Officer' }));
  expect(result.status).toBe(200);
  const { generatedResume } = await result.json();
  const rendered = JSON.stringify(generatedResume.preview);
  for (const line of lines) expect(rendered).toContain(line.replace(/^- /, ''));
  expect(generatedResume.latex).toContain('Harbor Ltd');
  expect(generatedResume.latex).toContain('Cedar Inc');
  expect(generatedResume.latex).toContain('achievement 14');
  expect(JSON.stringify(generatedResume.preview.sections)).not.toContain('Chief Operating Officer');
});

describe('POST /api/resumes/session', () => {
  it('blocks cross-origin calls', async () => {
    const res = await POST(jsonRequest({ action: 'analyze', resumeText: 'a'.repeat(50), jobDescription: 'b'.repeat(50) }, { origin: 'https://evil.test' }));
    expect(res.status).toBe(403);
  });

  it('extracts UTF-8 text from an uploaded TXT resume', async () => {
    const form = new FormData();
    form.set('file', new File(['Duncan MacKinnon\nTypeScript, React, Next.js, PostgreSQL experience across full-stack apps.'], 'resume.txt', { type: 'text/plain' }));
    const res = await POST(new Request('https://vibecheck.example.test/api/resumes/session', {
      method: 'POST',
      headers: { origin: 'https://vibecheck.example.test' },
      body: form,
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ filename: 'resume.txt', mimeType: 'text/plain' });
    expect(data.text).toContain('TypeScript, React');
  });

  it('uses deterministic scoring without DEEPSEEK_API_KEY and runs DeepSeek with deterministic fallback when key is set', async () => {
    const resDet = await POST(jsonRequest({
      action: 'analyze',
      resumeText: 'Jane Doe\njane@example.com\nBuilt TypeScript and React applications with PostgreSQL.',
      jobDescription: 'Seeking a Full-Stack Engineer skilled in TypeScript, React, PostgreSQL, and Docker.',
    }));
    expect(resDet.status).toBe(200);
    const det = await resDet.json();
    expect(det.mode).toBe('deterministic');
    expect(det.analysis.score).toBeGreaterThan(50);
    expect(analyzeWithAI).not.toHaveBeenCalled();

    process.env.DEEPSEEK_API_KEY = 'sk-test-key';
    jest.mocked(analyzeWithAI).mockResolvedValueOnce({
      score: 91,
      matchedSkills: [{ name: 'TypeScript', match: true }],
      missingSkills: ['Docker'],
      recommendations: { strengths: ['Strong frontend'], improvements: ['Add Docker'], skillGaps: [], format: [] },
      detailedAnalysis: 'AI fit report.',
    });
    const resAi = await POST(jsonRequest({
      action: 'analyze',
      resumeText: 'Jane Doe\njane@example.com\nBuilt TypeScript and React applications.',
      jobDescription: 'Seeking a Full-Stack Engineer skilled in TypeScript, React, PostgreSQL, and Docker.',
    }));
    expect(resAi.status).toBe(200);
    const ai = await resAi.json();
    expect(ai.mode).toBe('ai');
    expect(ai.analysis.score).toBe(91);

    jest.mocked(analyzeWithAI).mockRejectedValueOnce(new Error('provider timeout'));
    const resFallback = await POST(jsonRequest({
      action: 'analyze',
      resumeText: 'Jane Doe\njane@example.com\nBuilt TypeScript and React applications with PostgreSQL.',
      jobDescription: 'Seeking a Full-Stack Engineer skilled in TypeScript, React, PostgreSQL, and Docker.',
    }));
    expect(resFallback.status).toBe(200);
    expect((await resFallback.json()).mode).toBe('deterministic');
  });

  it('preserves extracted resume sections and follow-up answers in deterministic generation', async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const analyzeRes = await POST(jsonRequest({
      action: 'analyze',
      resumeText: [
        'Jane Doe',
        'jane@example.com | Toronto, ON',
        '',
        'Summary',
        'Full-stack engineer focused on reliable web systems.',
        '',
        'Experience',
        '- Built TypeScript and React dashboards for internal teams.',
        '',
        'Projects',
        '- Open Tracker: Next.js and PostgreSQL application tracker.',
        '',
        'Education',
        'B.Sc. Computer Science, University of Waterloo',
        '',
        'Skills',
        'TypeScript, React, PostgreSQL, Playwright',
      ].join('\n'),
      jobDescription: 'Full-Stack Engineer\n- Build TypeScript and React web apps\n- Maintain PostgreSQL schemas\n- Automate Docker deployments',
    }));
    expect(analyzeRes.status).toBe(200);
    const analyzed = await analyzeRes.json();
    expect(analyzed.mode).toBe('deterministic');

    const genRes = await POST(jsonRequest({
      action: 'generate',
      jobDescription: 'Full-Stack Engineer',
      answers: {
        fullName: 'Jane Doe',
        contactDetails: 'jane@example.com | Toronto, ON',
        targetTitle: 'Full-Stack Engineer',
        impactMetrics: 'Reduced API p95 latency by 35%.',
        projectEvidence: 'Shipped automated Playwright test suite.',
        credentials: 'AWS Certified Cloud Practitioner',
      },
      analysis: analyzed.analysis,
    }));
    expect(genRes.status).toBe(200);
    const generated = await genRes.json();
    expect(generated.mode).toBe('deterministic');
    expect(generateTailoredResume).not.toHaveBeenCalled();

    const titles = generated.generatedResume.preview.sections.map((s: { title: string }) => s.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Experience',
      'Projects',
      'Education',
      'Certifications & Credentials',
    ]));
    expect(generated.generatedResume.preview.skillGroups.map((g: { label: string }) => g.label)).toEqual(
      expect.arrayContaining(['Matched Role Skills', 'Additional Skills']),
    );
    expect(generated.generatedResume.latex).toContain('Reduced API p95 latency by 35\\%.');
    expect(generated.generatedResume.latex).toContain('University of Waterloo');
    expect(generated.generatedResume.latex).toContain('AWS Certified Cloud Practitioner');
  });

  it('generates tailored resume preview & LaTeX via AI when DEEPSEEK_API_KEY is configured', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-key';
    jest.mocked(generateTailoredResume).mockResolvedValueOnce({
      latex: '\\documentclass{article}',
      preview: { fullName: 'Jane Doe', contact: ['jane@example.com'], headline: 'Engineer', summary: 'Summary', sections: [], skillGroups: [] },
      tailoringNotes: ['Aligned to TypeScript'],
      assumptions: [],
      followUpQuestions: [],
    });

    const res = await POST(jsonRequest({
      action: 'generate',
      jobDescription: 'Full-Stack Engineer',
      answers: { fullName: 'Jane Doe', contactDetails: 'jane@example.com', targetTitle: 'Full-Stack Engineer' },
      analysis: {
        score: 88,
        matchedSkills: [{ name: 'TypeScript', match: true }],
        missingSkills: [],
        recommendations: { strengths: [], improvements: [], skillGaps: [], format: [] },
        detailedAnalysis: 'Good fit',
      },
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe('ai');
    expect(data.generatedResume.preview.fullName).toBe('Jane Doe');
  });

  it('formats a resume directly without a job description for both structured and heading-less text', async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const structuredRes = await POST(jsonRequest({
      action: 'format',
      fullName: 'Taylor Brooks',
      targetTitle: 'Product Designer',
      resumeText: [
        'Taylor Brooks',
        'taylor@example.com | Toronto, ON',
        '',
        'Summary',
        'Designer focused on accessible workflows.',
        '',
        'Experience',
        '- Redesigned onboarding checklists for customer teams.',
        '',
        'Skills',
        'Figma, TypeScript, User research',
      ].join('\n'),
    }));
    expect(structuredRes.status).toBe(200);
    const structured = await structuredRes.json();
    expect(structured.mode).toBe('deterministic');
    expect(structured.generatedResume.preview.fullName).toBe('Taylor Brooks');
    expect(structured.generatedResume.preview.headline).toBe('Product Designer');
    expect(structured.generatedResume.preview.sections.map((s: { title: string }) => s.title)).toContain('Experience');
    expect(structured.generatedResume.latex).toContain('Taylor Brooks');

    const plainRes = await POST(jsonRequest({
      action: 'format',
      fullName: 'Sam',
      contactDetails: 'sam@example.com | Vancouver, BC',
      resumeText: [
        'Sam Lee',
        'Supported retail store operations and inventory audits.',
        'Trained four new team members on checkout procedures.',
        'Managed weekly supplier schedules and customer inquiries.',
      ].join('\n'),
    }));
    expect(plainRes.status).toBe(200);
    const plain = await plainRes.json();
    expect(plain.generatedResume.preview.fullName).toBe('Sam Lee');
    expect(plain.generatedResume.preview.contact).toEqual(['sam@example.com', 'Vancouver, BC']);
    expect(plain.generatedResume.preview.sections.length).toBeGreaterThan(0);
    expect(plain.generatedResume.latex).toContain('Supported retail store operations');

    const fallbackNameRes = await POST(jsonRequest({
      action: 'format',
      fullName: 'Jordan',
      resumeText: [
        'Built internal accessibility audit tooling and WCAG keyboard checklists.',
        'Reduced front-end bundle payload across three customer-facing workflows.',
      ].join('\n'),
    }));
    expect(fallbackNameRes.status).toBe(200);
    const fallbackName = await fallbackNameRes.json();
    expect(fallbackName.generatedResume.preview.fullName).toBe('Jordan');
  });

  it('allows blank contact details during wizard generation when allowBlankContact is true without inventing contact info', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const analysis = {
      score: 70,
      matchedSkills: [{ name: 'TypeScript', match: true }],
      missingSkills: [],
      recommendations: { strengths: [], improvements: [], skillGaps: [], format: [] },
      detailedAnalysis: 'Good fit',
    };

    const blockedRes = await POST(jsonRequest({
      action: 'generate',
      jobDescription: 'Frontend Engineer',
      answers: { fullName: 'Jordan', targetTitle: 'Frontend Engineer' },
      analysis,
    }));
    expect(blockedRes.status).toBe(400);

    const allowedRes = await POST(jsonRequest({
      action: 'generate',
      jobDescription: 'Frontend Engineer',
      answers: { fullName: 'Jordan', targetTitle: 'Frontend Engineer' },
      allowBlankContact: true,
      analysis,
    }));
    expect(allowedRes.status).toBe(200);
    const data = await allowedRes.json();
    expect(data.generatedResume.preview.fullName).toBe('Jordan');
    expect(data.generatedResume.preview.contact).toEqual([]);
  });

  it('incorporates builder answers and renders Jake template LaTeX even when resumeText is supplied in deterministic mode or AI fallback', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const resumeText = [
      'Jordan Lee',
      'jordan@example.test | Toronto, ON',
      '',
      'Experience',
      '- Built TypeScript web applications and API integrations.',
      '',
      'Education',
      'B.Sc. Computer Science, Example University',
      '',
      'Skills',
      'TypeScript, React, PostgreSQL',
    ].join('\n');

    const analyzeRes = await POST(jsonRequest({
      action: 'analyze',
      resumeText,
      jobDescription: 'Senior Full-Stack Engineer\n- Build TypeScript and PostgreSQL systems\n- Measure performance improvements',
    }));
    expect(analyzeRes.status).toBe(200);
    const { analysis } = await analyzeRes.json();

    const genRes = await POST(jsonRequest({
      action: 'generate',
      resumeText,
      jobDescription: 'Senior Full-Stack Engineer',
      answers: {
        fullName: 'Jordan Lee',
        contactDetails: 'jordan@example.test | Toronto, ON',
        targetTitle: 'Senior Full-Stack Engineer',
        impactMetrics: 'Cut query latency by 42% across billing endpoints.',
        credentials: 'PostgreSQL Certified Associate',
      },
      analysis,
    }));
    expect(genRes.status).toBe(200);
    const det = await genRes.json();
    expect(det.mode).toBe('deterministic');
    expect(det.generatedResume.preview.headline).toBe('Senior Full-Stack Engineer');
    expect(det.generatedResume.latex).toContain('\\documentclass[letterpaper,11pt]{article}');
    expect(det.generatedResume.latex).toContain('\\resumeSubheading');
    expect(det.generatedResume.latex).toContain('\\resumeItem{Cut query latency by 42\\% across billing endpoints.}');
    expect(det.generatedResume.latex).toContain('PostgreSQL Certified Associate');

    process.env.DEEPSEEK_API_KEY = 'sk-test-key';
    jest.mocked(generateTailoredResume).mockRejectedValueOnce(new Error('provider outage'));
    const fallbackRes = await POST(jsonRequest({
      action: 'generate',
      resumeText,
      jobDescription: 'Senior Full-Stack Engineer',
      answers: {
        fullName: 'Jordan Lee',
        contactDetails: 'jordan@example.test | Toronto, ON',
        targetTitle: 'Senior Full-Stack Engineer',
        impactMetrics: 'Cut query latency by 42% across billing endpoints.',
      },
      analysis,
    }));
    expect(fallbackRes.status).toBe(200);
    const fallback = await fallbackRes.json();
    expect(fallback.mode).toBe('deterministic');
    expect(fallback.generatedResume.tailoringNotes[0]).toContain('AI tailoring was temporarily unavailable');
    expect(fallback.generatedResume.latex).toContain('Cut query latency by 42\\%');
  });
});
