jest.mock('pdf-parse/lib/pdf-parse.js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { extractPdfText } from '../pdfUtils';

const pdfParse = require('pdf-parse/lib/pdf-parse.js').default as jest.Mock;

function createPdfFile(content: string): File {
  const file = new File([content], 'resume.pdf', { type: 'application/pdf' });
  const buffer = Buffer.from(content);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  Object.defineProperty(file, 'arrayBuffer', {
    value: jest.fn().mockResolvedValue(arrayBuffer),
  });

  return file;
}

describe('pdfUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts trimmed text from a PDF file', async () => {
    pdfParse.mockResolvedValue({ text: '  Resume text from pdf.  ' });
    const file = createPdfFile('pdf bytes');

    await expect(extractPdfText(file)).resolves.toBe('Resume text from pdf.');
    expect(pdfParse).toHaveBeenCalledWith(expect.any(Buffer), {
      max: 0,
      version: 'v2.0.550',
    });
  });

  it('throws a clear error instead of falling back to binary file text', async () => {
    pdfParse.mockRejectedValue(new Error('No readable text layer'));
    const file = createPdfFile('%PDF binary-ish content');

    await expect(extractPdfText(file)).rejects.toThrow(/Failed to extract text from PDF: No readable text layer/);
  });

  it('throws when the PDF parser returns no text', async () => {
    pdfParse.mockResolvedValue({ text: '' });
    const file = createPdfFile('pdf bytes');

    await expect(extractPdfText(file)).rejects.toThrow(/PDF text extraction failed/);
  });
});
