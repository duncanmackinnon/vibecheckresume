import { render, screen } from '@testing-library/react';
import AnalysisResult from '../AnalysisResult';

describe('AnalysisResult Component', () => {
  const mockHighMatchResult = {
    score: 85,
    matchedSkills: [
      { name: 'React', match: true },
      { name: 'TypeScript', match: true },
      { name: 'Node.js', match: false },
    ],
    missingSkills: ['Python', 'AWS'],
    isLoading: false,
  };

  const mockLowMatchResult = {
    score: 45,
    matchedSkills: [
      { name: 'JavaScript', match: true },
      { name: 'HTML', match: false },
    ],
    missingSkills: ['React', 'TypeScript', 'Node.js'],
    isLoading: false,
  };

  it('renders loading state correctly', () => {
    render(
      <AnalysisResult
        score={0}
        matchedSkills={[]}
        missingSkills={[]}
        isLoading={true}
      />
    );
    expect(screen.getByTestId('loading-animation')).toBeInTheDocument();
  });

  it('displays high match score in green', () => {
    const { score, matchedSkills, missingSkills } = mockHighMatchResult;
    render(
      <AnalysisResult
        score={score}
        matchedSkills={matchedSkills}
        missingSkills={missingSkills}
      />
    );
    const scoreElement = screen.getByText(/85% Match/i);
    expect(scoreElement).toHaveClass('text-green-600', 'bg-green-50');
  });

  it('displays low match score in red', () => {
    const { score, matchedSkills, missingSkills } = mockLowMatchResult;
    render(
      <AnalysisResult
        score={score}
        matchedSkills={matchedSkills}
        missingSkills={missingSkills}
      />
    );
    const scoreElement = screen.getByText(/45% Match/i);
    expect(scoreElement).toHaveClass('text-red-600', 'bg-red-50');
  });

  it('renders matched skills correctly', () => {
    const { score, matchedSkills, missingSkills } = mockHighMatchResult;
    render(
      <AnalysisResult
        score={score}
        matchedSkills={matchedSkills}
        missingSkills={missingSkills}
      />
    );
    expect(screen.getByText('React')).toHaveClass('bg-green-100');
    expect(screen.getByText('Node.js')).toHaveClass('bg-gray-100');
  });

  it('renders missing skills section when there are missing skills', () => {
    const { score, matchedSkills, missingSkills } = mockHighMatchResult;
    render(
      <AnalysisResult
        score={score}
        matchedSkills={matchedSkills}
        missingSkills={missingSkills}
      />
    );
    expect(screen.getByText('Missing Skills')).toBeInTheDocument();
    missingSkills.forEach(skill => {
      expect(screen.getByText(skill)).toHaveClass('bg-red-100');
    });
  });

  it('does not render missing skills section when there are no missing skills', () => {
    render(
      <AnalysisResult
        score={85}
        matchedSkills={mockHighMatchResult.matchedSkills}
        missingSkills={[]}
      />
    );
    expect(screen.queryByText('Missing Skills')).not.toBeInTheDocument();
  });

  it('includes a download report button', () => {
    const { score, matchedSkills, missingSkills } = mockHighMatchResult;
    render(
      <AnalysisResult
        score={score}
        matchedSkills={matchedSkills}
        missingSkills={missingSkills}
      />
    );
    expect(screen.getByText(/Download Report/i)).toBeInTheDocument();
  });
});