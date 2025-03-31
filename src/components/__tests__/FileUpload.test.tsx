import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FileUpload from '../FileUpload';
import { expect, test } from '@jest/globals';

test('renders file upload area', () => {
  const mockOnFileUpload = jest.fn();
  render(<FileUpload onFileUpload={mockOnFileUpload} />);
  
  expect(screen.getByText('Drag and drop your resume here')).toBeInTheDocument();
  expect(screen.getByText('PDF or TXT files only')).toBeInTheDocument();
  expect(screen.getByLabelText('Upload resume file')).toBeInTheDocument();
});

test('handles file selection via click', () => {
  const mockOnFileUpload = jest.fn();
  render(<FileUpload onFileUpload={mockOnFileUpload} />);
  
  const file = new File(['test content'], 'resume.pdf', { type: 'application/pdf' });
  const input = screen.getByLabelText('Upload resume file');
  
  fireEvent.change(input, { target: { files: [file] } });
  expect(mockOnFileUpload).toHaveBeenCalledWith(file);
});

test('handles drag and drop', () => {
  const mockOnFileUpload = jest.fn();
  render(<FileUpload onFileUpload={mockOnFileUpload} />);
  
  const dropZone = screen.getByText('Drag and drop your resume here').parentElement?.parentElement;
  const file = new File(['test content'], 'resume.pdf', { type: 'application/pdf' });
  
  if (dropZone) {
    fireEvent.dragEnter(dropZone);
    expect(dropZone).toHaveClass('border-blue-500');
    
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] }
    });
    expect(mockOnFileUpload).toHaveBeenCalledWith(file);
    expect(dropZone).not.toHaveClass('border-blue-500');
  }
});