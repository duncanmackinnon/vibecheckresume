export const SUPPORTED_RESUME_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/markdown',
  'application/x-tex',
  'text/plain',
] as const;

export type SupportedResumeMimeType = (typeof SUPPORTED_RESUME_MIMES)[number];

export type ResumeExtension = 'pdf' | 'docx' | 'rtf' | 'md' | 'tex' | 'txt';

export const MAX_RESUME_BYTES = 8 * 1024 * 1024;

export const RESUME_FILE_ACCEPT = [
  '.pdf',
  '.docx',
  '.rtf',
  '.md',
  '.markdown',
  '.tex',
  '.txt',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
  'text/markdown',
  'application/x-tex',
  'text/x-tex',
  'text/plain',
].join(',');

export const RESUME_FORMAT_SUMMARY = 'PDF, DOCX, RTF, Markdown (.md), LaTeX (.tex), or TXT';

const EXTENSION_RULES: Record<
  string,
  { canonicalMime: SupportedResumeMimeType; allowedRawMimes: ReadonlySet<string> }
> = {
  pdf: {
    canonicalMime: 'application/pdf',
    allowedRawMimes: new Set(['', 'application/pdf']),
  },
  docx: {
    canonicalMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    allowedRawMimes: new Set([
      '',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
      'application/zip',
      'application/x-zip-compressed',
    ]),
  },
  rtf: {
    canonicalMime: 'application/rtf',
    allowedRawMimes: new Set([
      '',
      'application/rtf',
      'text/rtf',
      'text/richtext',
      'application/octet-stream',
    ]),
  },
  md: {
    canonicalMime: 'text/markdown',
    allowedRawMimes: new Set([
      '',
      'text/markdown',
      'text/x-markdown',
      'text/plain',
      'application/octet-stream',
    ]),
  },
  markdown: {
    canonicalMime: 'text/markdown',
    allowedRawMimes: new Set([
      '',
      'text/markdown',
      'text/x-markdown',
      'text/plain',
      'application/octet-stream',
    ]),
  },
  tex: {
    canonicalMime: 'application/x-tex',
    allowedRawMimes: new Set([
      '',
      'application/x-tex',
      'text/x-tex',
      'application/x-latex',
      'text/x-latex',
      'text/plain',
      'application/octet-stream',
    ]),
  },
  latex: {
    canonicalMime: 'application/x-tex',
    allowedRawMimes: new Set([
      '',
      'application/x-tex',
      'text/x-tex',
      'application/x-latex',
      'text/x-latex',
      'text/plain',
      'application/octet-stream',
    ]),
  },
  txt: {
    canonicalMime: 'text/plain',
    allowedRawMimes: new Set(['', 'text/plain']),
  },
};

function normalizedRawMime(rawType?: string): string {
  return (rawType || '').split(';')[0].trim().toLowerCase();
}

function fileExtension(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() || '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return base.slice(dotIndex + 1).toLowerCase();
}

/**
 * Validates size, extension, and reported MIME compatibility for uploaded resumes.
 */
export function validateUpload(file: Pick<File, 'name' | 'type' | 'size'>): SupportedResumeMimeType {
  if (!file.size || file.size > MAX_RESUME_BYTES) {
    throw new Error('Upload a nonempty resume up to 8 MB.');
  }
  const ext = fileExtension(file.name);
  if (ext === 'doc') {
    throw new Error('Unsupported legacy .doc file. Save it as .docx or .pdf and upload again.');
  }
  const rule = EXTENSION_RULES[ext];
  const rawMime = normalizedRawMime(file.type);
  if (!rule || !rule.allowedRawMimes.has(rawMime)) {
    throw new Error('Unsupported resume file. Upload a PDF, DOCX, RTF, Markdown (.md), LaTeX (.tex), or TXT file.');
  }
  return rule.canonicalMime;
}

/**
 * Infers a canonical supported MIME type from filename extension and optional raw MIME type.
 */
export function inferResumeMimeType(filename: string, rawType?: string): SupportedResumeMimeType {
  const ext = fileExtension(filename);
  const byExt = EXTENSION_RULES[ext]?.canonicalMime;
  if (byExt) return byExt;

  const rawMime = normalizedRawMime(rawType);
  if (rawMime === 'application/pdf') return 'application/pdf';
  if (rawMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (rawMime === 'application/rtf' || rawMime === 'text/rtf' || rawMime === 'text/richtext') {
    return 'application/rtf';
  }
  if (rawMime === 'text/markdown' || rawMime === 'text/x-markdown') return 'text/markdown';
  if (
    rawMime === 'application/x-tex' ||
    rawMime === 'text/x-tex' ||
    rawMime === 'application/x-latex' ||
    rawMime === 'text/x-latex'
  ) {
    return 'application/x-tex';
  }
  return 'text/plain';
}

/**
 * Maps a canonical MIME type (or filename fallback) to a safe file extension.
 */
export function extensionForMimeType(mimeType: string, filename?: string): ResumeExtension {
  const normalized = normalizedRawMime(mimeType);
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (normalized === 'application/rtf' || normalized === 'text/rtf' || normalized === 'text/richtext') return 'rtf';
  if (normalized === 'text/markdown' || normalized === 'text/x-markdown') return 'md';
  if (
    normalized === 'application/x-tex' ||
    normalized === 'text/x-tex' ||
    normalized === 'application/x-latex' ||
    normalized === 'text/x-latex'
  ) {
    return 'tex';
  }
  if (filename) {
    const ext = fileExtension(filename);
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'rtf') return 'rtf';
    if (ext === 'md' || ext === 'markdown') return 'md';
    if (ext === 'tex' || ext === 'latex') return 'tex';
  }
  return 'txt';
}

export function isBinaryResumeMimeType(mimeType: string): boolean {
  const normalized = normalizedRawMime(mimeType);
  return (
    normalized === 'application/pdf' ||
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export function formatOriginalBadge(mimeType: string, filename?: string): string {
  const ext = extensionForMimeType(mimeType, filename);
  return `${ext.toUpperCase()} original`;
}
