import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

test('renders spinner', () => {
  render(<LoadingSpinner />);
  expect(screen.getByRole('status', { hidden: true })).toBeTruthy();
});

test('shows progress when provided', () => {
  render(<LoadingSpinner progress={42} />);
  expect(screen.getByText('42%')).toBeInTheDocument();
});
