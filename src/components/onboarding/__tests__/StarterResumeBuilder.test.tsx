import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StarterResumeBuilder from '../StarterResumeBuilder';
import { createStarterResumeAnswers, type StarterResumeAnswers } from '@/lib/onboarding/starter-resume';

function Builder({ initial = createStarterResumeAnswers(), onComplete = jest.fn() }: { initial?: StarterResumeAnswers; onComplete?: jest.Mock }) {
  const [value, setValue] = useState(initial);
  return <StarterResumeBuilder value={value} onChange={setValue} onComplete={onComplete} />;
}

test('a first-time seeker can finish with contact and actual skills without adding employment', async () => {
  const onComplete = jest.fn();
  render(<Builder onComplete={onComplete} />);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex Rivera' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Skills you can demonstrate'), { target: { value: 'Customer service, French' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  const paper = document.querySelector('.resume-preview-paper') as HTMLElement;
  expect(within(paper).getByRole('heading', { name: 'Alex Rivera' })).toBeVisible();
  expect(within(paper).getByRole('heading', { name: 'Skills' })).toBeVisible();
  expect(within(paper).queryByRole('heading', { name: 'Experience' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use this resume' }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(onComplete.mock.calls[0][0].sourceText).toContain('Customer service, French');
  expect(onComplete.mock.calls[0][0].generatedResume.preview.sections).toHaveLength(1);
});

test('rehydrated controlled answers remain editable without losing optional history', async () => {
  const onComplete = jest.fn();
  const initial = { ...createStarterResumeAnswers('Jordan Lee'), phone: '555-0101', skills: 'Writing', experience: [{ role: 'Volunteer', organization: 'Community centre', dates: '', highlights: 'Welcomed visitors' }] };
  render(<Builder initial={JSON.parse(JSON.stringify(initial))} onComplete={onComplete} />);
  expect(screen.getByLabelText('Full name')).toHaveValue('Jordan Lee');
  fireEvent.click(screen.getByRole('button', { name: 'Experience' }));
  expect(screen.getByLabelText('Organization or setting')).toHaveValue('Community centre');
  fireEvent.change(screen.getByLabelText('What did you do or achieve?'), { target: { value: 'Helped visitors find the right program' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(screen.getByText('Helped visitors find the right program')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Use this resume' }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(onComplete.mock.calls[0][0].answers.experience[0]).toEqual({ ...initial.experience[0], highlights: 'Helped visitors find the right program' });
});

test('invalid basics and incomplete named sections show actionable errors before completion', () => {
  render(<Builder />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add your name.');
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex Rivera' } });
  fireEvent.change(screen.getByLabelText('Phone (optional)'), { target: { value: '555-0101' } });
  fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
  fireEvent.change(screen.getByLabelText('What was your contribution?'), { target: { value: 'Organized the planting schedule' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review resume' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Give this project a name.');
  expect(screen.queryByRole('button', { name: 'Use this resume' })).not.toBeInTheDocument();
});

test('completion failure preserves the resume and permits retry', async () => {
  const onComplete = jest.fn().mockRejectedValueOnce(new Error('Could not save. Try again.')).mockResolvedValueOnce(undefined);
  render(<Builder initial={{ ...createStarterResumeAnswers('Alex Rivera'), phone: '555-0101', skills: 'Writing' }} onComplete={onComplete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use this resume' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Use this resume' }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
  expect(onComplete.mock.calls[0][0]).toEqual(onComplete.mock.calls[1][0]);
});
