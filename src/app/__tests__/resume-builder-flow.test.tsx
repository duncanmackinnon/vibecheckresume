import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ResultPage from '../result/page';
import ResumeBuilderPage from '../resume-builder/page';
import type { Analysis } from '@/app/types';

const mockAnalysis: Analysis = {
  score: 82,
  matchedSkills: [{ name: 'React', match: true }],
  missingSkills: ['AWS'],
  recommendations: {
    improvements: ['Quantify React delivery impact'],
    strengths: ['Strong React evidence'],
    skillGaps: ['AWS deployment evidence'],
    format: ['Tighten bullets'],
  },
  detailedAnalysis: 'Strong frontend fit.',
  resumeBuilderProfile: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-123-4567',
    location: 'Toronto, ON',
    links: ['linkedin.com/in/jane'],
    headline: 'Frontend Engineer',
    summary: 'Frontend engineer with React experience.',
    workHighlights: ['Built React applications.'],
    education: [],
    skills: ['React'],
    projects: [],
    awardsCertifications: [],
  },
};

describe('resume builder flow', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('latestAnalysis', JSON.stringify(mockAnalysis));
    sessionStorage.setItem('latestJobDescription', 'Frontend Engineer\nReact and AWS role.');
  });

  it('shows the report first and links to the builder page', async () => {
    render(<ResultPage />);

    expect(await screen.findByText('Analysis Report')).toBeInTheDocument();
    expect(screen.getByText('Detailed Fit Report')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Resume Builder' })).toHaveAttribute('href', '/resume-builder');
    expect(screen.queryByText('Generate Tailored LaTeX Resume')).not.toBeInTheDocument();
  });

  it('loads the resume builder from stored analysis', async () => {
    render(<ResumeBuilderPage />);

    expect((await screen.findAllByText('Resume Builder')).length).toBeGreaterThan(0);
    expect(screen.getByText('Generate Tailored LaTeX Resume')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    });
  });
});
