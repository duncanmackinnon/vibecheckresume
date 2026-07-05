import { NextRequest } from 'next/server';
import { POST } from '../analyze/route';
import { analyzeWithAI } from '@/app/lib/deepseekEnhancer';
import { extractPdfText } from '@/app/lib/pdfUtils';
import type { Analysis } from '@/app/types';

jest.mock('@/app/lib/deepseekEnhancer', () => ({
  analyzeWithAI: jest.fn(),
}));

jest.mock('@/app/lib/pdfUtils', () => ({
  extractPdfText: jest.fn(),
}));

jest.mock('@/utils/env', () => ({
  env: {
    api: {
      deepseek: {
        isConfigured: true,
      },
    },
    logConfig: jest.fn(),
  },
}));

jest.mock('../analyze/middleware', () => ({
  logRequest: jest.fn(),
  logResponse: jest.fn(),
}));

const mockAnalysis: Analysis = {
  score: 88,
  matchedSkills: [
    { name: 'React', match: true },
    { name: 'TypeScript', match: true },
  ],
  missingSkills: ['Python'],
  recommendations: {
    improvements: ['Add Python automation evidence'],
    strengths: ['Strong frontend delivery evidence'],
    skillGaps: ['Python automation'],
    format: ['Quantify recent project impact'],
  },
  detailedAnalysis: 'The resume aligns with most frontend requirements.',
  resumeSections: {
    basics: ['Frontend engineer with React experience.'],
    work: ['Delivered React and TypeScript applications.'],
    education: [],
    skills: ['React', 'TypeScript'],
    projects: ['Frontend project with measurable delivery evidence.'],
    awardsCertifications: [],
  },
  resumeBuilderProfile: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-123-4567',
    location: 'Toronto, ON',
    links: ['linkedin.com/in/janedoe', 'github.com/janedoe'],
    headline: 'Frontend Engineer',
    summary: 'Frontend engineer with React delivery evidence.',
    workHighlights: ['Delivered React and TypeScript applications.'],
    education: [],
    skills: ['React', 'TypeScript'],
    projects: ['Frontend project with measurable delivery evidence.'],
    awardsCertifications: [],
  },
  roleRequirements: [
    {
      text: 'React frontend delivery',
      status: 'matched',
      evidence: 'The resume includes React delivery evidence.',
    },
  ],
  priorityActions: [
    {
      categoryId: 'technical_skills',
      title: 'Add Python automation evidence',
      rationale: 'The job includes Python and the resume does not show Python delivery.',
      impact: 'high',
      effort: 'medium',
    },
  ],
  evaluation: {
    categories: [
      {
        id: 'technical_skills',
        label: 'Technical Skills',
        score: 32,
        max: 35,
        evidence: 'React and TypeScript match the core requirements.',
      },
      {
        id: 'experience_relevance',
        label: 'Experience Relevance',
        score: 25,
        max: 30,
        evidence: 'Recent frontend experience maps to the role responsibilities.',
      },
      {
        id: 'projects_and_open_source',
        label: 'Projects and Open Source',
        score: 16,
        max: 20,
        evidence: 'Project work demonstrates relevant delivery experience.',
      },
      {
        id: 'role_alignment',
        label: 'Role Alignment',
        score: 15,
        max: 15,
        evidence: 'The resume aligns with the target frontend role.',
      },
    ],
    bonus: {
      score: 0,
      max: 10,
      evidence: 'No bonus points applied.',
    },
    deductions: {
      score: 0,
      evidence: 'No deductions applied.',
    },
    fairnessNotes: [
      'Scoring excludes demographic, location, school-name, and grade-based signals.',
    ],
  },
};

describe('/api/analyze', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (analyzeWithAI as jest.Mock).mockResolvedValue(mockAnalysis);
  });

  function createAnalyzeRequest(formData: FormData): NextRequest {
    return {
      method: 'POST',
      url: 'http://localhost/api/analyze',
      headers: new Headers({
        'content-type': 'multipart/form-data',
      }),
      formData: jest.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;
  }

  it('returns legacy analysis fields and the new evaluation scorecard', async () => {
    const resumeFile = new File(['Resume text with React and TypeScript experience.'], 'resume.txt', { type: 'text/plain' });
    const jobFile = new File(['Job description requiring React, TypeScript, and frontend delivery.'], 'job.txt', { type: 'text/plain' });
    Object.defineProperty(resumeFile, 'text', {
      value: jest.fn().mockResolvedValue('Resume text with React and TypeScript experience.'),
    });
    Object.defineProperty(jobFile, 'text', {
      value: jest.fn().mockResolvedValue('Job description requiring React, TypeScript, and frontend delivery.'),
    });

    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('jobDescription', jobFile);

    const request = createAnalyzeRequest(formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      score: 88,
      matchedSkills: [
        { name: 'React', match: true },
        { name: 'TypeScript', match: true },
      ],
      missingSkills: ['Python'],
      detailedAnalysis: mockAnalysis.detailedAnalysis,
    }));
    expect(data.evaluation.categories).toHaveLength(4);
    expect(data.evaluation.categories[0]).toEqual(mockAnalysis.evaluation?.categories[0]);
    expect(data.evaluation.fairnessNotes).toEqual(mockAnalysis.evaluation?.fairnessNotes);
    expect(data.resumeSections.skills).toEqual(['React', 'TypeScript']);
    expect(data.resumeBuilderProfile).toEqual(mockAnalysis.resumeBuilderProfile);
    expect(data.roleRequirements).toEqual(mockAnalysis.roleRequirements);
    expect(data.priorityActions).toEqual(mockAnalysis.priorityActions);
  });

  it('rejects unsupported resume file types before analysis', async () => {
    const resumeFile = new File(['not a resume but long enough content'], 'resume.png', { type: 'image/png' });
    const jobFile = new File(['Job description requiring React and TypeScript delivery.'], 'job.txt', { type: 'text/plain' });

    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('jobDescription', jobFile);

    const response = await POST(createAnalyzeRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Unsupported resume file type/);
    expect(analyzeWithAI).not.toHaveBeenCalled();
  });

  it('returns a readable error when PDF text extraction fails', async () => {
    (extractPdfText as jest.Mock).mockRejectedValue(new Error('No readable text layer'));

    const resumeFile = new File(['%PDF long enough fake content for validation'], 'resume.pdf', { type: 'application/pdf' });
    const jobFile = new File(['Job description requiring React and TypeScript delivery.'], 'job.txt', { type: 'text/plain' });

    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('jobDescription', jobFile);

    const response = await POST(createAnalyzeRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Failed to extract text/);
    expect(analyzeWithAI).not.toHaveBeenCalled();
  });
});
