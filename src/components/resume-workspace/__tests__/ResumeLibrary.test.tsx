import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResumeLibrary from '../ResumeLibrary';
import { fetchResumeLibrary, resumeRequest } from '../client';
import { buildStarterResume, createStarterResumeAnswers } from '@/lib/onboarding/starter-resume';
import type { ResumeWorkspaceSummaryData } from '@/lib/resume-workspace/types';

jest.mock('../client', () => ({ ...jest.requireActual('../client'), fetchResumeLibrary: jest.fn(), resumeRequest: jest.fn() }));

const starter = buildStarterResume({ ...createStarterResumeAnswers('Alex Rivera'), email: 'alex@example.test', skills: 'Customer service, French' });
const source = { id: 'starter-123', ownerId: 'owner-1', kind: 'source_resume' as const, applicationId: null, version: 1, createdAt: '2026-09-13T12:00:00.000Z', updatedAt: '2026-09-13T12:00:00.000Z', data: { filename: starter.filename, origin: 'builder' as const, mimeType: 'text/plain' as const, size: 100, storagePath: '', text: starter.sourceText, generatedResume: starter.generatedResume, starterAnswers: starter.answers } };
const library: ResumeWorkspaceSummaryData = { summariesOnly: true, sources: [{ ...source, data: { filename: source.data.filename, mimeType: source.data.mimeType, origin: 'builder', size: 100 } }], versions: [], analyses: [], drafts: [], jobs: [] };

beforeEach(() => { jest.mocked(fetchResumeLibrary).mockResolvedValue(library); jest.mocked(resumeRequest).mockResolvedValue(source); });

test('saved builder resumes reopen through the owned record operation with editing and exports', async () => {
  render(<ResumeLibrary />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review resume' }));
  expect(await screen.findByRole('heading', { name: 'Alex Rivera' })).toBeVisible();
  expect(resumeRequest).toHaveBeenCalledWith('get_resume', { id: source.id, kind: 'source_resume' });
  expect(screen.getByRole('link', { name: 'Edit answers' })).toHaveAttribute('href', '/onboarding?editResume=starter-123');
  expect(screen.getByRole('link', { name: 'Download text' })).toHaveAttribute('href', '/api/resumes/starter-123?download=1');
  const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
  expect(print).toHaveBeenCalledTimes(1);
  let downloadedFilename = '';
  const download = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedFilename = this.download; });
  fireEvent.click(screen.getByRole('button', { name: 'Download .tex' }));
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(download).toHaveBeenCalledTimes(1);
  expect(downloadedFilename).toBe('alex-rivera-resume.tex');
  fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(screen.queryByRole('heading', { name: 'Alex Rivera' })).not.toBeInTheDocument();
  print.mockRestore(); download.mockRestore();
});

test('a denied owned record fetch reports the error without revealing a preview and can retry', async () => {
  jest.mocked(resumeRequest).mockRejectedValueOnce(new Error('This resume could not be found.'));
  render(<ResumeLibrary />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review resume' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This resume could not be found.');
  expect(screen.queryByRole('heading', { name: 'Alex Rivera' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review resume' }));
  expect(await screen.findByRole('heading', { name: 'Alex Rivera' })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('ordinary uploaded sources continue to provide their original download without a builder preview', async () => {
  jest.mocked(fetchResumeLibrary).mockResolvedValue({ ...library, sources: [{ ...library.sources[0], data: { filename: 'resume.pdf', mimeType: 'application/pdf', size: 2000 } }] });
  render(<ResumeLibrary />);
  expect(await screen.findByRole('link', { name: 'Download original' })).toHaveAttribute('href', '/api/resumes/starter-123?download=1');
  expect(screen.queryByRole('button', { name: 'Review resume' })).not.toBeInTheDocument();
  expect(resumeRequest).not.toHaveBeenCalled();
});
