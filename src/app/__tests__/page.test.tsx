import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Page from '../page';
import { expect, test } from '@jest/globals';

test('renders the main page', () => {
  render(<Page />);
  expect(screen.getByText('Resume Match Analyzer')).toBeInTheDocument();
});

test('handles file upload and job description input', async () => {
  render(<Page />);
  
  const fileInput = screen.getByLabelText('Upload Resume');
  const textarea = screen.getByPlaceholderText('Paste the job description here...');
  const submitButton = screen.getByText('Analyze Resume');

  // Test form validation
  fireEvent.click(submitButton);
  expect(submitButton).toBeDisabled();

  // Test file upload
  const file = new File(['test content'], 'resume.pdf', { type: 'application/pdf' });
  fireEvent.change(fileInput, { target: { files: [file] } });
  
  // Test text input
  fireEvent.change(textarea, { target: { value: 'Test job description' } });
  
  expect(submitButton).not.toBeDisabled();
});