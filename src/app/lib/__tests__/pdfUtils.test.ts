/** @jest-environment node */
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: jest.fn() }));
import { extractPdfText } from '../pdfUtils';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const destroy = jest.fn();
const mockDocument = jest.mocked(getDocument);
test('rejects encrypted or unreadable PDFs without exposing parser input', async () => {
  mockDocument.mockReturnValue({ promise: Promise.reject(new Error('private-document-content')), destroy } as never);
  await expect(extractPdfText(new File(['%PDF'], 'resume.pdf'))).rejects.toThrow('Could not read this PDF');
  expect(destroy).toHaveBeenCalled();
});
test('bounds documents before extracting their pages', async () => {
  const getPage = jest.fn();
  mockDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 101, getPage }), destroy } as never);
  await expect(extractPdfText(new File(['%PDF'], 'resume.pdf'))).rejects.toThrow('up to 100 pages');
  expect(getPage).not.toHaveBeenCalled();
});
