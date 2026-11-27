import type { LayoutDocument, LayoutLine, LayoutLink } from '../types';
import {
  decodeHtmlEntities,
  makeLayoutLine,
  mergeLayoutLinks,
  normalizeWhitespace,
  sanitizeHref,
  stripBulletPrefix,
} from './utils';

interface ExtractedHtmlBlock {
  tag: string;
  innerHtml: string;
  headingLevel?: number;
  hasBullet?: boolean;
}

function parseAnchorLinksAndStripHtml(html: string): {
  text: string;
  links: LayoutLink[];
  isBold: boolean;
  isItalic: boolean;
} {
  const links: LayoutLink[] = [];
  const withoutScripts = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  const isBold = /<(?:strong|b|h[1-6])\b/i.test(withoutScripts) &&
    !/<\/(?:strong|b)>[^<]{20,}/i.test(withoutScripts);
  const isItalic = /<(?:em|i)\b/i.test(withoutScripts) &&
    normalizeWhitespace(withoutScripts.replace(/<[^>]+>/g, '')).length > 0 &&
    /^[^<]*<(?:em|i)\b[^>]*>[\s\S]*<\/(?:em|i)>[^<]*$/i.test(withoutScripts.trim());

  const withLinks = withoutScripts.replace(
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, dq, sq, labelHtml) => {
      const href = decodeHtmlEntities(String(dq ?? sq ?? '')).trim();
      const safe = sanitizeHref(href);
      const label = normalizeWhitespace(decodeHtmlEntities(String(labelHtml).replace(/<[^>]+>/g, '')));
      if (safe) {
        links.push({ label: label || safe, url: safe });
      }
      return label || href;
    },
  );

  const lineBroken = withLinks.replace(/<br\s*\/?>/gi, '\n');
  const text = normalizeWhitespace(decodeHtmlEntities(lineBroken.replace(/<[^>]+>/g, ' ')));
  return { text, links: mergeLayoutLinks(links), isBold, isItalic };
}

function splitTopLevelTableRows(tableHtml: string): string[] {
  return Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (m) => m[1]);
}

function splitTableCells(rowHtml: string): string[] {
  return Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), (m) => m[1]);
}

function htmlParagraphsToLines(
  htmlFragment: string,
  column: 'main' | 'sidebar',
  startY: number,
): { lines: LayoutLine[]; nextY: number } {
  const blocks: ExtractedHtmlBlock[] = [];
  const blockRe = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of htmlFragment.matchAll(blockRe)) {
    const tag = match[1].toLowerCase();
    const headingLevel = tag.startsWith('h') ? Number.parseInt(tag.slice(1), 10) : undefined;
    blocks.push({
      tag,
      innerHtml: match[2],
      headingLevel,
      hasBullet: tag === 'li',
    });
  }

  if (!blocks.length) {
    const fallback = parseAnchorLinksAndStripHtml(htmlFragment);
    if (!fallback.text) return { lines: [], nextY: startY };
    return {
      lines: [
        makeLayoutLine({
          text: fallback.text,
          x: column === 'sidebar' ? 420 : 40,
          y: startY + 14,
          column,
          isBold: fallback.isBold,
          isItalic: fallback.isItalic,
          links: fallback.links,
        }),
      ],
      nextY: startY + 18,
    };
  }

  const lines: LayoutLine[] = [];
  let cursorY = startY;
  for (const block of blocks) {
    const splitParts = block.innerHtml.split(/<br\s*\/?>/gi);
    for (let idx = 0; idx < splitParts.length; idx += 1) {
      const parsed = parseAnchorLinksAndStripHtml(splitParts[idx]);
      if (!parsed.text) continue;
      const gapAbove = block.headingLevel || idx === 0 ? 12 : 4;
      cursorY += gapAbove + 14;
      const bulletCheck = block.hasBullet ? { hasBullet: true, cleaned: parsed.text } : stripBulletPrefix(parsed.text);
      lines.push(
        makeLayoutLine({
          text: bulletCheck.cleaned,
          x: (column === 'sidebar' ? 420 : 40) + (bulletCheck.hasBullet ? 16 : 0),
          y: cursorY,
          fontSize: block.headingLevel === 1 ? 18 : block.headingLevel === 2 ? 14 : block.headingLevel ? 12 : 11,
          isBold: Boolean(block.headingLevel) || parsed.isBold,
          isItalic: parsed.isItalic,
          hasBullet: bulletCheck.hasBullet,
          indent: bulletCheck.hasBullet ? 16 : 0,
          gapAbove,
          column,
          headingLevel: block.headingLevel,
          links: parsed.links,
        }),
      );
    }
  }
  return { lines, nextY: cursorY };
}

/**
 * Extracts structured HTML via mammoth from DOCX bytes (checking ZIP magic header first)
 * and maps headings, emphasis, hyperlinks, lists, split table headers, and 2-column layout tables
 * into a unified LayoutDocument.
 */
export async function extractDocxDocument(bytes: ArrayBuffer): Promise<LayoutDocument> {
  if (bytes.byteLength < 4) {
    throw new Error('This file does not contain a valid DOCX document.');
  }
  const view = new Uint8Array(bytes, 0, 4);
  if (view[0] !== 0x50 || view[1] !== 0x4b) {
    throw new Error('This file does not contain a valid DOCX document.');
  }

  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    const html = result.value || '';
    const lines: LayoutLine[] = [];
    const sidebarLines: LayoutLine[] = [];
    let cursorY = 48;
    let hasLayoutTable = false;

    const topBlockRe = /<(h[1-6]|p|li|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let lastEnd = 0;

    // Match top-level structural elements cleanly without swallowing inner paragraphs when matching tables
    const matches = Array.from(html.matchAll(topBlockRe)).filter((match) => {
      const start = match.index ?? 0;
      if (start < lastEnd) return false;
      lastEnd = start + match[0].length;
      return true;
    });

    for (const match of matches) {
      const tag = match[1].toLowerCase();
      const inner = match[2];

      if (tag === 'table') {
        const rows = splitTopLevelTableRows(inner);
        for (const row of rows) {
          const cells = splitTableCells(row);
          if (cells.length === 2) {
            const leftParagraphCount = (cells[0].match(/<(?:p|li|h[1-6])\b/gi) || []).length;
            const rightParagraphCount = (cells[1].match(/<(?:p|li|h[1-6])\b/gi) || []).length;

            if (leftParagraphCount >= 3 || rightParagraphCount >= 3) {
              hasLayoutTable = true;
              const leftPlainLen = parseAnchorLinksAndStripHtml(cells[0]).text.length;
              const rightPlainLen = parseAnchorLinksAndStripHtml(cells[1]).text.length;
              const leftIsMain = leftPlainLen >= rightPlainLen * 0.9;
              const mainHtml = leftIsMain ? cells[0] : cells[1];
              const sideHtml = leftIsMain ? cells[1] : cells[0];
              const mainOut = htmlParagraphsToLines(mainHtml, 'main', cursorY);
              lines.push(...mainOut.lines);
              cursorY = mainOut.nextY;
              const sideOut = htmlParagraphsToLines(sideHtml, 'sidebar', 48);
              sidebarLines.push(...sideOut.lines);
            } else {
              const leftParsed = parseAnchorLinksAndStripHtml(cells[0]);
              const rightParsed = parseAnchorLinksAndStripHtml(cells[1]);
              if (leftParsed.text || rightParsed.text) {
                cursorY += 18;
                lines.push(
                  makeLayoutLine({
                    text: rightParsed.text && leftParsed.text ? `${leftParsed.text} | ${rightParsed.text}` : leftParsed.text || rightParsed.text,
                    leftText: leftParsed.text || rightParsed.text,
                    rightText: leftParsed.text && rightParsed.text ? rightParsed.text : undefined,
                    x: 40,
                    y: cursorY,
                    fontSize: lines.length === 0 ? 16 : 11,
                    isBold: leftParsed.isBold || lines.length === 0,
                    isItalic: leftParsed.isItalic,
                    gapAbove: 8,
                    links: mergeLayoutLinks(leftParsed.links, rightParsed.links),
                  }),
                );
              }
            }
          } else {
            for (const cell of cells) {
              const out = htmlParagraphsToLines(cell, 'main', cursorY);
              lines.push(...out.lines);
              cursorY = out.nextY;
            }
          }
        }
        continue;
      }

      const headingLevel = tag.startsWith('h') ? Number.parseInt(tag.slice(1), 10) : undefined;
      const splitLines = inner.split(/<br\s*\/?>/gi);
      for (let i = 0; i < splitLines.length; i += 1) {
        const parsed = parseAnchorLinksAndStripHtml(splitLines[i]);
        if (!parsed.text) continue;
        const gapAbove = lines.length === 0 ? 0 : headingLevel || i === 0 ? 12 : 4;
        cursorY += gapAbove + 14;
        const bullet = tag === 'li' ? { hasBullet: true, cleaned: parsed.text } : stripBulletPrefix(parsed.text);
        lines.push(
          makeLayoutLine({
            text: bullet.cleaned,
            x: 40 + (bullet.hasBullet ? 16 : 0),
            y: cursorY,
            fontSize:
              headingLevel === 1 || lines.length === 0
                ? 18
                : headingLevel === 2
                  ? 14
                  : headingLevel
                    ? 12
                    : 11,
            isBold: Boolean(headingLevel) || parsed.isBold || lines.length === 0,
            isItalic: parsed.isItalic,
            hasBullet: bullet.hasBullet,
            indent: bullet.hasBullet ? 16 : 0,
            gapAbove,
            headingLevel,
            links: parsed.links,
          }),
        );
      }
    }

    const ordered = [...lines, ...sidebarLines];
    return {
      lines: ordered,
      pageWidth: 612,
      pageHeight: Math.max(792, cursorY + 48),
      layoutType: hasLayoutTable ? 'two-column' : 'structured-markup',
      extractedLinkAnnotations: ordered.reduce((sum, line) => sum + line.links.length, 0),
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('valid DOCX')) {
      throw err;
    }
    throw new Error('Could not read this DOCX file. Upload an uncorrupted .docx, .pdf, or text-based resume.');
  }
}
