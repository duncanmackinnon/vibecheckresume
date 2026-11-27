import type { LayoutDocument, LayoutLine, LayoutLink } from '../types';
import { makeLayoutLine, mergeLayoutLinks, normalizeWhitespace, sanitizeHref, stripBulletPrefix } from './utils';

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
const MD_AUTO_LINK_RE = /<(https?:\/\/[^>]+|mailto:[^>]+)>/gi;

function extractMarkdownLinksAndText(input: string): { text: string; links: LayoutLink[]; isBold: boolean; isItalic: boolean } {
  const links: LayoutLink[] = [];
  let working = input.replace(MD_AUTO_LINK_RE, (_match, url) => {
    const cleanUrl = String(url).trim();
    const safe = sanitizeHref(cleanUrl);
    if (safe) links.push({ label: cleanUrl, url: safe });
    return cleanUrl;
  });

  working = working.replace(MD_LINK_RE, (_match, label, rawTarget) => {
    const cleanTarget = String(rawTarget).replace(/\s+"[^"]*"$/, '').trim();
    const safe = sanitizeHref(cleanTarget);
    const cleanLabel = String(label).replace(/[*_`]/g, '').trim();
    if (safe) links.push({ label: cleanLabel || safe, url: safe });
    return cleanLabel || cleanTarget;
  });

  const stripped = working.trim();
  const isBold = /^\*\*[^*]+\*\*$/.test(stripped) || /^__[^_]+__$/.test(stripped) || /\*\*[^*]{2,}\*\*/.test(stripped);
  const isItalic = /^\*[^*]+\*$/.test(stripped) || /^_[^_]+_$/.test(stripped);

  const plain = working
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(?:^|\s)_([^_]+)_(?=$|\s|[.,;:])/g, ' $1')
    .replace(/`([^`]+)`/g, '$1');

  return { text: normalizeWhitespace(plain), links, isBold, isItalic };
}

/**
 * Parses Markdown resumes into a LayoutDocument preserving heading levels, emphasis,
 * [label](url) links, bullet lists, and 2-column table rows.
 */
export function parseMarkdownToLayout(raw: string): LayoutDocument {
  const normalized = raw.replace(/\r\n?/g, '\n').replace(/\0/g, '');
  const rawLines = normalized.split('\n');
  const lines: LayoutLine[] = [];

  let inCodeFence = false;
  let blankRun = 0;
  let cursorY = 48;

  for (const rawLine of rawLines) {
    const trimmedRight = rawLine.replace(/\s+$/, '');
    if (/^```/.test(trimmedRight.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (!trimmedRight.trim()) {
      blankRun += 1;
      continue;
    }
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmedRight.trim())) {
      blankRun += 1;
      continue;
    }
    if (/^\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmedRight.trim())) {
      continue;
    }

    const leadingMatch = trimmedRight.match(/^([ \t]*)/);
    const indent = leadingMatch ? Math.min(72, leadingMatch[1].replace(/\t/g, '    ').length * 4) : 0;
    const gapAbove = lines.length === 0 ? 0 : blankRun > 0 ? Math.min(32, 12 + blankRun * 4) : 4;
    blankRun = 0;
    cursorY += gapAbove + 14;

    const trimmed = trimmedRight.trim();

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const body = headingMatch[2].replace(/\s+#+\s*$/, '').trim();
      const extracted = extractMarkdownLinksAndText(body);
      if (extracted.text) {
        lines.push(
          makeLayoutLine({
            text: extracted.text,
            x: 40,
            y: cursorY,
            fontSize: level === 1 ? 18 : level === 2 ? 14 : 12,
            isBold: true,
            headingLevel: level,
            gapAbove: Math.max(gapAbove, 14),
            links: extracted.links,
          }),
        );
      }
      continue;
    }

    const { hasBullet, cleaned } = stripBulletPrefix(trimmed);

    if (!hasBullet && cleaned.startsWith('|') && cleaned.endsWith('|')) {
      const cells = cleaned
        .slice(1, -1)
        .split('|')
        .map((cell) => extractMarkdownLinksAndText(cell))
        .filter((cell) => cell.text);
      if (cells.length === 2) {
        lines.push(
          makeLayoutLine({
            text: `${cells[0].text} | ${cells[1].text}`,
            leftText: cells[0].text,
            rightText: cells[1].text,
            x: 40 + indent,
            y: cursorY,
            isBold: cells[0].isBold,
            isItalic: cells[0].isItalic,
            indent,
            gapAbove,
            links: mergeLayoutLinks(cells[0].links, cells[1].links),
          }),
        );
        continue;
      }
    }

    const extracted = extractMarkdownLinksAndText(cleaned);
    if (!extracted.text) continue;

    lines.push(
      makeLayoutLine({
        text: extracted.text,
        x: 40 + indent,
        y: cursorY,
        fontSize: lines.length === 0 ? 17 : 11,
        isBold: extracted.isBold || lines.length === 0,
        isItalic: extracted.isItalic,
        hasBullet,
        indent,
        gapAbove,
        links: extracted.links,
      }),
    );
  }

  return {
    lines,
    pageWidth: 612,
    pageHeight: Math.max(792, cursorY + 48),
    layoutType: 'structured-markup',
    extractedLinkAnnotations: lines.reduce((sum, line) => sum + line.links.length, 0),
  };
}
