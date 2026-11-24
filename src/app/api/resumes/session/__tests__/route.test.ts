/** @jest-environment node */
import { POST } from '../route';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { generateTailoredResume } from '@/app/lib/resumeGenerator';

jest.mock('@/app/lib/deepseekEnhancer', () => ({ analyzeWithAI: jest.fn() }));
jest.mock('@/app/lib/resumeGenerator', () => ({ generateTailoredResume: jest.fn() }));

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.DEEPSEEK_API_KEY;
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

  it('runs deterministic analysis when DEEPSEEK_API_KEY is unset and AI when configured', async () => {
    const resDet = await POST(jsonRequest({
      action: 'analyze',
      resumeText: 'Jane Doe\njane@example.com\nBuilt TypeScript and React applications with PostgreSQL.',
      jobDescription: 'Seeking a Full-Stack Engineer skilled in TypeScript, React, PostgreSQL, and Docker.',
    }));
    expect(resDet.status).toBe(200);
    const det = await resDet.json();
    expect(det.mode).toBe('deterministic');
    expect(det.analysis.score).toBeGreaterThan(50);

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
  });

  it('generates tailored resume preview & LaTeX', async () => {
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
});
