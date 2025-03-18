import { render, screen, fireEvent } from '@testing-library/react';
import FileUpload from '../FileUpload';

describe('FileUpload Component', () => {
  const mockOnFileUpload = jest.fn();

  beforeEach(() => {
    mockOnFileUpload.mockClear();
  });

  it('renders upload area with correct text', () => {
    render(<FileUpload onFileUpload={mockOnFileUpload} />);
    expect(screen.getByText(/Drag and drop your resume here/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF or TXT files only/i)).toBeInTheDocument();
  });

  it('handles file input change', () => {
    render(<FileUpload onFileUpload={mockOnFileUpload} />);
    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByRole('textbox', { hidden: true });

    Object.defineProperty(input, 'files', {
      value: [file],
    });

    fireEvent.change(input);
    expect(mockOnFileUpload).toHaveBeenCalledWith(file);
  });

  it('handles drag and drop', () => {
    render(<FileUpload onFileUpload={mockOnFileUpload} />);
    const dropzone = screen.getByText(/Drag and drop your resume here/i).closest('div');
    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });

    if (dropzone) {
      fireEvent.dragEnter(dropzone.parentElement as HTMLElement);
      expect(dropzone.parentElement?.classList.contains('border-blue-500')).toBe(true);

      fireEvent.drop(dropzone.parentElement as HTMLElement, {
        dataTransfer: {
          files: [file],
        },
      });

      expect(mockOnFileUpload).toHaveBeenCalledWith(file);
    }
  });
});