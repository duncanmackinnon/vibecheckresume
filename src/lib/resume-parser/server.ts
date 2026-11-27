import { extractDocxDocument } from './adapters/docx';
import { extractPdfDocument } from './adapters/pdf';
import { validateUpload, type SupportedResumeMimeType } from './formats';
import { parseClientResumeTextByFormat, parseLayoutDocument } from './index';
import type { ParsedResumeDocument } from './types';

export interface ServerParsedUploadResult {
  mimeType: SupportedResumeMimeType;
  bytes: ArrayBuffer;
  text: string;
  parsedResume: ParsedResumeDocument;
}

/**
 * Server-side multi-format upload parser handling PDF, DOCX, RTF, Markdown, LaTeX, and TXT.
 */
export async function parseResumeFile(file: File): Promise<ServerParsedUploadResult> {
  const mimeType = validateUpload(file);
  const bytes = await file.arrayBuffer();

  let parsedResume: ParsedResumeDocument;

  if (mimeType === 'application/pdf') {
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== '%PDF-') {
      throw new Error('This file does not contain a valid PDF.');
    }
    const pdfDoc = await extractPdfDocument(file);
    parsedResume = parseLayoutDocument(pdfDoc.layout, 'application/pdf', pdfDoc.canonicalText);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const docxLayout = await extractDocxDocument(bytes);
    parsedResume = parseLayoutDocument(docxLayout, mimeType);
  } else {
    let rawText: string;
    try {
      rawText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Could not decode this resume as UTF-8 text.');
    }
    parsedResume = parseClientResumeTextByFormat(rawText, mimeType);
  }

  const text = parsedResume.canonicalText.replace(/\0/g, '').trim();
  if (text.length < 25) {
    throw new Error(
      'The resume has too little readable text. Use a text-based PDF, DOCX, RTF, Markdown, LaTeX, or TXT resume.',
    );
  }
  if (text.length > 250_000) {
    throw new Error('The resume text is too long. Upload a shorter resume.');
  }

  return {
    mimeType,
    bytes,
    text,
    parsedResume,
  };
}

export { extractPdfDocument, extractDocxDocument };
