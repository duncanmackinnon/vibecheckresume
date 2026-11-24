import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Page from '../page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
beforeEach(() => {
  sessionStorage.clear();
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ authenticated: false, profile: null, connection: null, capabilities: { auth: false, database: false, storage: false, deepseek: false, openai: false } }) });
});

test('starts with the name and preserves it before sign-in', async () => {
  const first = render(<Page />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What’s your name?');
  expect(screen.getByRole('link', { name: 'Explore a sample' })).toHaveAttribute('href', '/dashboard?preview=1');
  await screen.findByText('Session preview');
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: 'Jordan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Let’s get started, Jordan.');
  await waitFor(() => expect(sessionStorage.getItem('vibecheck:onboarding:v1')).toContain('Jordan'));
  first.unmount(); render(<Page />);
  expect(await screen.findByRole('button', { name: /Answer a few questions/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Let’s get started, Jordan.');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
