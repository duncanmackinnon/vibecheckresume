import type { LayoutDocument, LayoutLine } from '../types';
import { makeLayoutLine, normalizeWhitespace, stripBulletPrefix } from './utils';

const TABULAR_RIGHT_HINT_RE =
  /(?:19|20)\d{2}|present|current|gpa|remote|hybrid|,\s*[A-Z]{2}\b|\.(?:com|dev|io|xyz|org|net)\b/i;

function splitTabularPlainLine(trimmed: string): { left: string; right?: string } {
  if (trimmed.includes('\t')) {
    const parts = trimmed
      .split(/\t+/)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
    if (parts.length === 2 && parts[1].length <= 55) {
      return { left: parts[0], right: parts[1] };
    }
  }

  const gapParts = trimmed
    .split(/\s{3,}/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
  if (
    gapParts.length === 2 &&
    gapParts[1].length <= 50 &&
    !/[.!?]$/.test(gapParts[1]) &&
    TABULAR_RIGHT_HINT_RE.test(gapParts[1])
  ) {
    return { left: gapParts[0], right: gapParts[1] };
  }

  return { left: normalizeWhitespace(trimmed) };
}

/**
 * Converts plain text or pasted resume text into a normalized LayoutDocument while preserving
 * vertical spacing, indentation, bullet structure, and tab/multi-space column splits.
 */
export function parsePlainTextToLayout(raw: string): LayoutDocument {
  const normalized = raw.replace(/\r\n?/g, '\n').replace(/\0/g, '');
  const rawLines = normalized.split('\n');
  const lines: LayoutLine[] = [];

  let blankRun = 0;
  let cursorY = 48;

  for (const rawLine of rawLines) {
    const trimmedRight = rawLine.replace(/\s+$/, '');
    if (!trimmedRight.trim()) {
      blankRun += 1;
      continue;
    }

    const leadingMatch = trimmedRight.match(/^([ \t]*)/);
    const leadingChars = leadingMatch ? leadingMatch[1].replace(/\t/g, '    ').length : 0;
    const indent = Math.min(72, leadingChars * 4);
    const gapAbove = lines.length === 0 ? 0 : blankRun > 0 ? Math.min(32, 12 + blankRun * 4) : 4;
    cursorY += gapAbove + 14;
    blankRun = 0;

    const afterIndent = trimmedRight.trimStart();
    const { hasBullet, cleaned } = stripBulletPrefix(afterIndent);
    if (!cleaned) continue;

    const { left, right } = splitTabularPlainLine(cleaned);
    const combinedText = right ? `${left} | ${right}` : left;

    lines.push(
      makeLayoutLine({
        text: combinedText,
        leftText: left,
        rightText: right,
        x: 40 + indent,
        y: cursorY,
        page: 1,
        fontSize: lines.length === 0 ? 16 : 11,
        isBold: lines.length === 0,
        hasBullet,
        indent,
        gapAbove,
      }),
    );
  }

  return {
    lines,
    pageWidth: 612,
    pageHeight: Math.max(792, cursorY + 48),
    layoutType: 'plain-text',
    extractedLinkAnnotations: 0,
  };
}
