import React from 'react';
import { render, screen } from '@testing-library/react';
import AnalysisResult from '../AnalysisResult';
import { expect, test } from '@jest/globals';

const mockProps = {
  matchScore: 75,
  strengths: ['React', 'TypeScript'],
  weaknesses: ['Limited backend experience'],
  missingSkills: ['Node.js', 'AWS'],
  recommendations: ['Add more project details', 'Highlight leadership experience'],
  detailedAnalysis: 'Your resume shows strong frontend skills but lacks backend experience.',
  roleRequirements: [
    {
      text: 'React frontend delivery',
      status: 'matched' as const,
      evidence: 'React and TypeScript work maps to the requirement.'
    },
    {
      text: 'Backend API ownership',
      status: 'partial' as const,
      evidence: 'The resume mentions frontend integration but limited backend ownership.'
    }
  ],
  priorityActions: [
    {
      categoryId: 'experience_relevance',
      title: 'Quantify frontend impact',
      rationale: 'The role values delivery outcomes and the resume has unmeasured project bullets.',
      impact: 'high' as const,
      effort: 'low' as const,
      exampleRewrite: 'Improved checkout conversion by 12 percent through React performance work.'
    }
  ],
  evaluation: {
    categories: [
      {
        id: 'technical_skills',
        label: 'Technical Skills',
        score: 28,
        max: 35,
        evidence: 'React and TypeScript match core requirements.'
      },
      {
        id: 'experience_relevance',
        label: 'Experience Relevance',
        score: 22,
        max: 30,
        evidence: 'Frontend experience aligns with the role.'
      },
      {
        id: 'projects_and_open_source',
        label: 'Projects and Open Source',
        score: 10,
        max: 20,
        evidence: 'Project evidence is relevant but limited.'
      },
      {
        id: 'role_alignment',
        label: 'Role Alignment',
        score: 15,
        max: 15,
        evidence: 'The resume aligns with target responsibilities.'
      }
    ],
    bonus: {
      score: 0,
      max: 10,
      evidence: 'No bonus points applied.'
    },
    deductions: {
      score: 0,
      evidence: 'No deductions applied.'
    },
    fairnessNotes: [
      'Scoring excludes demographic, location, school-name, and grade-based signals.'
    ]
  }
};

test('displays analysis results correctly', () => {
  render(<AnalysisResult {...mockProps} />);
  
  expect(screen.getByText('75%')).toBeInTheDocument();
  expect(screen.getByText('React')).toBeInTheDocument();
  expect(screen.getByText('TypeScript')).toBeInTheDocument();
  expect(screen.getByText('Limited backend experience')).toBeInTheDocument();
  expect(screen.getByText('Node.js')).toBeInTheDocument();
  expect(screen.getByText('Add more project details')).toBeInTheDocument();
  expect(screen.getAllByText(/Your resume shows strong frontend skills/).length).toBeGreaterThan(0);
  expect(screen.getByText('Evidence Scorecard')).toBeInTheDocument();
  expect(screen.getByText('Top Fixes')).toBeInTheDocument();
  expect(screen.getByText('Quantify frontend impact')).toBeInTheDocument();
  expect(screen.getByText('Role Requirements')).toBeInTheDocument();
  expect(screen.getByText('React frontend delivery')).toBeInTheDocument();
  expect(screen.getByText('Technical Skills')).toBeInTheDocument();
  expect(screen.getByText('React and TypeScript match core requirements.')).toBeInTheDocument();
  expect(screen.getByText(/Scoring excludes demographic/)).toBeInTheDocument();
});

test('renders different score colors correctly', () => {
  const { rerender } = render(<AnalysisResult {...mockProps} matchScore={85} />);
  expect(screen.getByText('85%')).toHaveClass('text-green-700');

  rerender(<AnalysisResult {...mockProps} matchScore={65} />);
  expect(screen.getByText('65%')).toHaveClass('text-amber-700');

  rerender(<AnalysisResult {...mockProps} matchScore={45} />);
  expect(screen.getByText('45%')).toHaveClass('text-rose-700');
});
