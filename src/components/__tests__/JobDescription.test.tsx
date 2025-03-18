import { render, screen, fireEvent } from '@testing-library/react';
import JobDescription from '../JobDescription';

describe('JobDescription Component', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders job description input form', () => {
    render(<JobDescription onJobDescriptionSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('initializes with disabled submit button', () => {
    render(<JobDescription onJobDescriptionSubmit={mockOnSubmit} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('enables submit button when job description is entered', () => {
    render(<JobDescription onJobDescriptionSubmit={mockOnSubmit} />);
    const textarea = screen.getByLabelText(/job description/i);
    fireEvent.change(textarea, { target: { value: 'Test job description' } });
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('calls onSubmit with entered job description', () => {
    render(<JobDescription onJobDescriptionSubmit={mockOnSubmit} />);
    const textarea = screen.getByLabelText(/job description/i);
    const submitButton = screen.getByRole('button');

    fireEvent.change(textarea, { target: { value: 'Test job description' } });
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith('Test job description');
  });

  it('does not call onSubmit when form is submitted with empty description', () => {
    render(<JobDescription onJobDescriptionSubmit={mockOnSubmit} />);
    const submitButton = screen.getByRole('button');

    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});