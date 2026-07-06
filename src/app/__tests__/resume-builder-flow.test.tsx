import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ResultPage from '../result/page';
import ResumeBuilderPage from '../resume-builder/page';
import ResumePreviewPage from '../resume-preview/page';
import type { Analysis, GeneratedResume } from '@/app/types';

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

const mockGeneratedResume: GeneratedResume = {
  latex: String.raw`\documentclass{article}
\begin{document}
Jane Doe
\end{document}`,
  preview: {
    fullName: 'Jane Doe',
    contact: ['jane@example.com', 'linkedin.com/in/jane'],
    headline: 'Frontend Engineer',
    summary: 'Frontend engineer focused on React delivery.',
    sections: [
      {
        title: 'Experience',
        items: [
          {
            heading: 'Frontend Engineer',
            subheading: 'Acme',
            date: '2022 - Present',
            details: ['Built React applications for customer workflows.'],
          },
        ],
      },
    ],
    skillGroups: [
      { label: 'Languages', skills: ['TypeScript', 'JavaScript'] },
    ],
  },
  tailoringNotes: ['Tailored to React role requirements.'],
  assumptions: [],
  followUpQuestions: ['What AWS deployment evidence should be included?'],
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
    expect(screen.queryByText('Generate Tailored Resume')).not.toBeInTheDocument();
  });

  it('loads the resume builder from stored analysis', async () => {
    render(<ResumeBuilderPage />);

    expect((await screen.findAllByText('Resume Builder')).length).toBeGreaterThan(0);
    expect(screen.getByText('Generate Tailored Resume')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    });
  });

  it('loads the generated resume preview from storage', async () => {
    sessionStorage.setItem('latestGeneratedResume', JSON.stringify(mockGeneratedResume));

    render(<ResumePreviewPage />);

    expect(await screen.findByText('Resume Preview')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getAllByText('Frontend Engineer').length).toBeGreaterThan(0);
    expect(screen.getByText('Built React applications for customer workflows.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy LaTeX' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download .tex' })).toBeInTheDocument();
  });
});
