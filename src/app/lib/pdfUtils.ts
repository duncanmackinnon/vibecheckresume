import { extractPdfDocument } from '@/lib/resume-parser/adapters/pdf';

/** Parse only the text layer and link annotations. Disable executable PDF features and bound resource use. */
export async function extractPdfText(file: File): Promise<string> {
  const { canonicalText } = await extractPdfDocument(file);
  return canonicalText;
}
