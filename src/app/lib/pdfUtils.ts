/**
 * Extracts text content from a PDF file
 */
export async function extractPdfText(file: File): Promise<string> {
  try {
    // Dynamically import both pdf-parse and buffer
    const [{ default: pdfParse }, { Buffer }] = await Promise.all([
      import('pdf-parse/lib/pdf-parse.js'),
      import('buffer')
    ]);

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF
    const data = await pdfParse(buffer, {
      max: 0, // No page limit
      version: 'v2.0.550'
    });

    if (!data.text || typeof data.text !== 'string') {
      throw new Error('PDF text extraction failed');
    }

    return data.text.trim();
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    const message = error instanceof Error ? error.message : 'Unknown PDF parsing error';
    throw new Error(`Failed to extract text from PDF: ${message}`);
  }
}
