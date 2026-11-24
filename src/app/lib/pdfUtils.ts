/** Parse only the text layer. Disable executable PDF features and bound resource use. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: false, disableFontFace: true,
    verbosity: 0, stopAtErrors: true,
  });
  try {
    const document = await task.promise;
    if (document.numPages > 100) throw new Error('Too many pages');
    const pages: string[] = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      length += text.length;
      if (length > 250_000) throw new Error('Too much text');
      pages.push(text.trim());
      page.cleanup();
    }
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error('No text layer');
    return text;
  } catch {
    throw new Error('Could not read this PDF. Use an unencrypted PDF with a text layer (up to 100 pages), or upload a text file.');
  } finally {
    await task.destroy();
  }
}
