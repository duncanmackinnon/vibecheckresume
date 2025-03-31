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
  detailedAnalysis: 'Your resume shows strong frontend skills but lacks backend experience.'
};

test('displays analysis results correctly', () => {
  render(<AnalysisResult {...mockProps} />);
  
  expect(screen.getByText('75% Match')).toBeInTheDocument();
  expect(screen.getByText('React')).toBeInTheDocument();
  expect(screen.getByText('TypeScript')).toBeInTheDocument();
  expect(screen.getByText('Limited backend experience')).toBeInTheDocument();
  expect(screen.getByText('Node.js')).toBeInTheDocument();
  expect(screen.getByText('Add more project details')).toBeInTheDocument();
  expect(screen.getByText('Your resume shows strong frontend skills')).toBeInTheDocument();
});

test('renders different score colors correctly', () => {
  const { rerender } = render(<AnalysisResult {...mockProps} matchScore={85} />);
  expect(screen.getByText('85% Match')).toHaveClass('text-green-600');

  rerender(<AnalysisResult {...mockProps} matchScore={65} />);
  expect(screen.getByText('65% Match')).toHaveClass('text-yellow-600');

  rerender(<AnalysisResult {...mockProps} matchScore={45} />);
  expect(screen.getByText('45% Match')).toHaveClass('text-red-600');
});