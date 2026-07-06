import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResumeGenerator from '../ResumeGenerator';
import type { Analysis } from '@/app/types';

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

describe('ResumeGenerator', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
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
                  details: ['Reduced React page load time by 30 percent.'],
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
      }),
    }) as jest.Mock;
  });

  it('renders context from the analysis and stores a generated resume preview', async () => {
    render(<ResumeGenerator analysis={mockAnalysis} jobDescription="Frontend role requiring React." />);

    expect(screen.getByText('Generate Tailored Resume')).toBeInTheDocument();
    expect(screen.getByText('Extracted Profile')).toBeInTheDocument();
    expect(screen.getByText('Targeted Follow-up Questions')).toBeInTheDocument();
    expect(screen.getByText('Add impact metrics')).toBeInTheDocument();
    expect(screen.getByText('Build React interfaces')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/jane@example\.com/)).toBeInTheDocument();

    const generateButton = screen.getByRole('button', { name: 'Generate Resume Preview' });
    expect(generateButton).not.toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Reduced page load time/), {
      target: { value: 'Reduced React page load time by 30 percent.' },
    });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/generate-resume', expect.objectContaining({
        method: 'POST',
      }));
    });

    await waitFor(() => {
      const stored = sessionStorage.getItem('latestGeneratedResume');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored as string).preview.fullName).toBe('Jane Doe');
    });
    expect(screen.queryByText('Generated Output')).not.toBeInTheDocument();
  });
});
