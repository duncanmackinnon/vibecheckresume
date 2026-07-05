import { NextRequest } from 'next/server';
import { POST } from '../generate-resume/route';
import { generateTailoredResume } from '@/app/lib/resumeGenerator';
import type { Analysis } from '@/app/types';

jest.mock('@/app/lib/resumeGenerator', () => ({
  generateTailoredResume: jest.fn(),
}));

jest.mock('@/utils/env', () => ({
  env: {
    api: {
      deepseek: {
        isConfigured: true,
      },
    },
  },
}));

const mockAnalysis: Analysis = {
  score: 82,
  matchedSkills: [
    { name: 'React', match: true },
    { name: 'TypeScript', match: true },
  ],
  missingSkills: ['AWS'],
  recommendations: {
    improvements: ['Quantify React delivery impact'],
    strengths: ['Strong frontend evidence'],
    skillGaps: ['AWS deployment evidence'],
    format: ['Tighten bullets for one-page format'],
  },
  detailedAnalysis: 'The resume aligns with frontend requirements.',
  resumeSections: {
    basics: ['Frontend engineer with React experience.'],
    work: ['Built React applications.'],
    education: [],
    skills: ['React', 'TypeScript'],
    projects: ['Dashboard project using React.'],
    awardsCertifications: [],
  },
  resumeBuilderProfile: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-123-4567',
    location: 'Toronto, ON',
    links: ['linkedin.com/in/jane', 'github.com/jane'],
    headline: 'Frontend Engineer',
    summary: 'Frontend engineer with React experience.',
    workHighlights: ['Built React applications.'],
    education: [],
    skills: ['React', 'TypeScript'],
    projects: ['Dashboard project using React.'],
    awardsCertifications: [],
  },
  roleRequirements: [
    {
      text: 'Build React interfaces',
      status: 'matched',
      evidence: 'The resume includes React delivery.',
    },
  ],
  priorityActions: [
    {
      categoryId: 'experience_relevance',
      title: 'Add impact metrics',
      rationale: 'The resume lacks measurable frontend outcomes.',
      impact: 'high',
      effort: 'low',
    },
  ],
};

function createGenerateRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const serialized = JSON.stringify(body);
  return {
    method: 'POST',
    url: 'http://localhost/api/generate-resume',
    headers: new Headers({
      'content-type': 'application/json',
      'content-length': String(serialized.length),
      ...headers,
    }),
    json: jest.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe('/api/generate-resume', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (generateTailoredResume as jest.Mock).mockResolvedValue({
      latex: String.raw`\documentclass{article}
\begin{document}
Jane Doe
\end{document}`,
      tailoringNotes: ['Tailored to React role requirements.'],
      assumptions: [],
      followUpQuestions: [],
    });
  });

  it('returns generated resume LaTeX and metadata', async () => {
    const answers = {
      fullName: 'Jane Doe',
      contactDetails: 'jane@example.com | linkedin.com/in/jane',
      targetTitle: 'Frontend Engineer',
      impactMetrics: 'Reduced load time by 30 percent.',
    };

    const response = await POST(createGenerateRequest({
      analysis: mockAnalysis,
      jobDescription: 'Frontend role requiring React and TypeScript.',
      answers,
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(generateTailoredResume).toHaveBeenCalledWith({
      analysis: mockAnalysis,
      jobDescription: 'Frontend role requiring React and TypeScript.',
      answers: expect.objectContaining(answers),
    });
    expect(data.latex).toContain(String.raw`\documentclass{article}`);
    expect(data.tailoringNotes).toEqual(['Tailored to React role requirements.']);
  });

  it('rejects missing required generator answers', async () => {
    const response = await POST(createGenerateRequest({
      analysis: mockAnalysis,
      jobDescription: 'Frontend role requiring React.',
      answers: {
        fullName: 'Jane Doe',
        contactDetails: '',
        targetTitle: 'Frontend Engineer',
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Missing required resume generator answers/);
    expect(generateTailoredResume).not.toHaveBeenCalled();
  });

  it('rejects missing analysis data', async () => {
    const response = await POST(createGenerateRequest({
      analysis: null,
      jobDescription: 'Frontend role requiring React.',
      answers: {
        fullName: 'Jane Doe',
        contactDetails: 'jane@example.com',
        targetTitle: 'Frontend Engineer',
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Missing valid analysis data/);
    expect(generateTailoredResume).not.toHaveBeenCalled();
  });

  it('rejects non-json requests', async () => {
    const response = await POST(createGenerateRequest({}, { 'content-type': 'text/plain' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Invalid content type/);
    expect(generateTailoredResume).not.toHaveBeenCalled();
  });
});
