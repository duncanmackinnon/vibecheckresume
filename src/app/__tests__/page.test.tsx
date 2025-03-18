import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Home from '../page';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('Home Page Integration', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('renders all main components', () => {
    render(<Home />);
    expect(screen.getByText(/Smart Resume Analyzer/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1: Upload Your Resume/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 2: Enter Job Description/i)).toBeInTheDocument();
  });

  it('handles complete resume analysis flow', async () => {
    const mockResponse = {
      score: 75,
      matchedSkills: [
        { name: 'React', match: true },
        { name: 'TypeScript', match: true },
        { name: 'Node.js', match: false },
      ],
      missingSkills: ['Python', 'AWS'],
    };

    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    render(<Home />);

    // Upload resume
    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText('Upload resume file');
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    // Enter job description
    const textarea = screen.getByLabelText(/job description/i);
    fireEvent.change(textarea, { target: { value: 'Test job description' } });
    
    // Submit form
    const submitButton = screen.getByText(/Analyze Resume/i);
    fireEvent.click(submitButton);

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText(/75% Match/i)).toBeInTheDocument();
    });

    // Verify API call
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('React')).toHaveClass('bg-green-100');
    expect(screen.getByText('Python')).toHaveClass('bg-red-100');
  });

  it('shows error message when API call fails', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      })
    );

    render(<Home />);

    // Upload resume and submit
    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText('Upload resume file');
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    const textarea = screen.getByLabelText(/job description/i);
    fireEvent.change(textarea, { target: { value: 'Test job description' } });
    
    const submitButton = screen.getByText(/Analyze Resume/i);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Failed to analyze resume/i)).toBeInTheDocument();
    });
  });
});