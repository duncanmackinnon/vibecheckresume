import type { LayoutLine, LayoutLink } from '../types';

const EXPLICIT_URL_IN_TEXT_RE =
  /\b(?:https?:\/\/[^\s|,;<>()]+|mailto:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\/[^\s|,;<>()]*|(?:linkedin\.com\/in|github\.com)\/[^\s|,;<>()]+)/gi;

export function sanitizeHref(raw: string): string | null {
  const trimmed = raw.trim().replace(/^<|>$/g, '');
  if (!trimmed) return null;
  if (/^(?:javascript|data|vbscript|file):/i.test(trimmed)) return null;
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^(?:www\.)?(?:linkedin\.com|github\.com|[a-z0-9.-]+\.[a-z]{2,}\/)/i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/\//, '')}`;
  }
  return null;
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '-')
    .replace(/&mdash;/gi, '-')
    .replace(/&bull;/gi, '•')
    .replace(/&#(\d+);/g, (_match, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function stripBulletPrefix(text: string): { hasBullet: boolean; cleaned: string } {
  const trimmed = text.trim();
  const bulletMatch = trimmed.match(/^(?:[-*+]\s+|[•▪◦‣●∙]+\s*|\d+[.)]\s+)(.*)$/);
  if (bulletMatch) {
    return { hasBullet: true, cleaned: bulletMatch[1].trim() };
  }
  return { hasBullet: false, cleaned: trimmed };
}

export function isUpperCaseLine(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  return letters.length >= 2 && text === text.toUpperCase() && text !== text.toLowerCase();
}

export function extractInlineLinks(text: string): LayoutLink[] {
  const seen = new Set<string>();
  const results: LayoutLink[] = [];
  for (const match of text.matchAll(EXPLICIT_URL_IN_TEXT_RE)) {
    const raw = match[0].replace(/[).,;]+$/, '').trim();
    const safeUrl = sanitizeHref(raw);
    if (!safeUrl) continue;
    const key = safeUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ label: raw, url: safeUrl });
  }
  return results;
}

export function mergeLayoutLinks(...groups: Array<LayoutLink[] | undefined>): LayoutLink[] {
  const seen = new Set<string>();
  const merged: LayoutLink[] = [];
  for (const group of groups) {
    if (!group) continue;
    for (const item of group) {
      const safe = sanitizeHref(item.url);
      if (!safe) continue;
      const key = `${item.label.toLowerCase()}|${safe.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ label: normalizeWhitespace(item.label) || safe, url: safe });
    }
  }
  return merged;
}

export function makeLayoutLine(partial: {
  text: string;
  leftText?: string;
  rightText?: string;
  x?: number;
  y?: number;
  page?: number;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  hasBullet?: boolean;
  indent?: number;
  gapAbove?: number;
  column?: 'header' | 'main' | 'sidebar';
  links?: LayoutLink[];
  headingLevel?: number;
}): LayoutLine {
  const cleanText = normalizeWhitespace(partial.text);
  const cleanLeft = normalizeWhitespace(partial.leftText ?? cleanText);
  const cleanRight = partial.rightText ? normalizeWhitespace(partial.rightText) : undefined;
  const links = mergeLayoutLinks(partial.links, extractInlineLinks(cleanText));
  return {
    text: cleanText,
    leftText: cleanLeft,
    ...(cleanRight ? { rightText: cleanRight } : {}),
    x: partial.x ?? partial.indent ?? 0,
    y: partial.y ?? 0,
    page: partial.page ?? 1,
    fontSize: partial.fontSize ?? 11,
    isBold: Boolean(partial.isBold),
    isItalic: Boolean(partial.isItalic),
    isUpperCase: isUpperCaseLine(cleanLeft),
    hasBullet: Boolean(partial.hasBullet),
    indent: partial.indent ?? 0,
    gapAbove: partial.gapAbove ?? 0,
    column: partial.column ?? 'main',
    links,
    ...(partial.headingLevel ? { headingLevel: partial.headingLevel } : {}),
  };
}
