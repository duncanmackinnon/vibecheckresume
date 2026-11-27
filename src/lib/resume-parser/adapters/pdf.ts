import { buildCanonicalText, reconstructLayoutFromSpans } from '../layoutOrder';
import type { LayoutDocument, RawPositionedSpan } from '../types';
import { parsePlainTextToLayout } from './text';
import { sanitizeHref } from './utils';

interface PdfLinkRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  url: string;
}

function rectsOverlap(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): boolean {
  const pad = 2.5;
  return ax0 <= bx1 + pad && ax1 >= bx0 - pad && ay0 <= by1 + pad && ay1 >= by0 - pad;
}

/**
 * Extracts spatial text items, font hierarchy, and clickable PDF link annotations using pdfjs-dist.
 */
export async function extractPdfDocument(file: File): Promise<{ layout: LayoutDocument; canonicalText: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
    stopAtErrors: true,
  });

  try {
    const document = await task.promise;
    if (document.numPages > 100) throw new Error('Too many pages');

    const pagesSpans: RawPositionedSpan[][] = [];
    const fallbackPagesText: string[] = [];
    let totalChars = 0;
    let totalLinkAnnotations = 0;
    let pageWidth = 612;
    let pageHeight = 792;
    let usedSpatialLayout = false;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      if (typeof page.getViewport !== 'function') {
        const text = content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('');
        totalChars += text.length;
        if (totalChars > 250_000) throw new Error('Too much text');
        fallbackPagesText.push(text.trim());
        page.cleanup?.();
        continue;
      }

      usedSpatialLayout = true;
      const viewport = page.getViewport({ scale: 1 });
      const viewBox = viewport.viewBox || [0, 0, viewport.width || 612, viewport.height || 792];
      const [vx0, _vy0, vx1, vy1] = viewBox;
      pageWidth = Math.max(pageWidth, viewport.width || vx1 - vx0 || 612);
      pageHeight = Math.max(pageHeight, viewport.height || vy1 - _vy0 || 792);

      const linkRects: PdfLinkRect[] = [];
      if (typeof page.getAnnotations === 'function') {
        const annotations = await page.getAnnotations({ intent: 'display' }).catch(() => []);
        for (const ann of annotations) {
          if (!ann || ann.subtype !== 'Link') continue;
          const rawUrl = typeof ann.url === 'string' ? ann.url : typeof ann.unsafeUrl === 'string' ? ann.unsafeUrl : '';
          const safeUrl = rawUrl ? sanitizeHref(rawUrl) : null;
          if (!safeUrl || !Array.isArray(ann.rect) || ann.rect.length < 4) continue;
          const [rx1, ry1, rx2, ry2] = ann.rect.map(Number);
          if (![rx1, ry1, rx2, ry2].every(Number.isFinite)) continue;
          linkRects.push({
            x0: Math.min(rx1, rx2) - vx0,
            y0: vy1 - Math.max(ry1, ry2),
            x1: Math.max(rx1, rx2) - vx0,
            y1: vy1 - Math.min(ry1, ry2),
            url: safeUrl,
          });
        }
      }
      totalLinkAnnotations += linkRects.length;

      const styles = (content.styles || {}) as Record<string, { fontFamily?: string } | undefined>;
      const pageSpans: RawPositionedSpan[] = [];

      for (const item of content.items) {
        if (!('str' in item)) continue;
        totalChars += item.str.length;
        if (totalChars > 250_000) throw new Error('Too much text');

        const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 10, 0, 0];
        const fontSize = Math.max(6, Math.hypot(Number(transform[2]) || 0, Number(transform[3]) || 0) || item.height || 10);
        const spanHeight = item.height > 0 ? item.height : fontSize;
        const x = Number(transform[4]) - vx0;
        const baselineY = vy1 - Number(transform[5]);
        const spanTopY = baselineY - spanHeight * 0.85;
        const spanBottomY = baselineY + spanHeight * 0.2;
        const spanWidth = item.width > 0 ? item.width : Math.max(2, item.str.length * fontSize * 0.45);

        const fontFamily = styles[item.fontName]?.fontFamily || '';
        const fontSignal = `${item.fontName || ''} ${fontFamily}`;
        const isBold = /\b(?:bold|black|heavy|semibold|demi)\b|cmbx|ptmb|NimbusSanL-Bold/i.test(fontSignal);
        const isItalic = /\b(?:italic|oblique|slanted)\b|cmti|cmsl/i.test(fontSignal);

        const matchedLink = linkRects.find((link) =>
          rectsOverlap(x, spanTopY, x + spanWidth, spanBottomY, link.x0, link.y0, link.x1, link.y1),
        );

        pageSpans.push({
          page: pageNumber,
          text: item.str,
          x,
          y: baselineY,
          width: spanWidth,
          height: spanHeight,
          fontSize,
          isBold,
          isItalic,
          hasEOL: item.hasEOL,
          href: matchedLink?.url,
        });
      }

      pagesSpans.push(pageSpans);
      page.cleanup();
    }

    if (!usedSpatialLayout) {
      const plainText = fallbackPagesText.join('\n\n').trim();
      if (!plainText) throw new Error('No text layer');
      const layout = parsePlainTextToLayout(plainText);
      return { layout, canonicalText: plainText };
    }

    const layout = reconstructLayoutFromSpans(
      pagesSpans,
      { width: pageWidth, height: pageHeight },
      totalLinkAnnotations,
    );
    const canonicalText = buildCanonicalText(layout);
    if (!canonicalText) throw new Error('No text layer');

    return { layout, canonicalText };
  } catch {
    throw new Error(
      'Could not read this PDF. Use an unencrypted PDF with a text layer (up to 100 pages), or upload a text file.',
    );
  } finally {
    await task.destroy();
  }
}
