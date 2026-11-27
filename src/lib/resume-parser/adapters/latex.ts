import type { LayoutDocument, LayoutLine, LayoutLink } from '../types';
import { makeLayoutLine, mergeLayoutLinks, normalizeWhitespace, sanitizeHref } from './utils';

function readBracedArg(source: string, startIdx: number): { content: string; nextIdx: number } | null {
  let idx = startIdx;
  while (idx < source.length && /\s/.test(source[idx])) idx += 1;
  if (source[idx] !== '{') return null;

  let depth = 0;
  let content = '';
  for (let i = idx; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length) {
      content += ch + source[i + 1];
      i += 1;
      continue;
    }
    if (ch === '{') {
      if (depth > 0) content += ch;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { content, nextIdx: i + 1 };
      }
      content += ch;
    } else {
      content += ch;
    }
  }
  return null;
}

function stripLatexComments(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      let escaped = false;
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === '\\') {
          escaped = !escaped;
          continue;
        }
        if (line[i] === '%' && !escaped) {
          return line.slice(0, i);
        }
        escaped = false;
      }
      return line;
    })
    .join('\n');
}

function unescapeLatex(input: string): string {
  return input
    .replace(/\$\|\$/g, ' | ')
    .replace(/\$\\cdot\$/g, ' | ')
    .replace(/\$\\bullet\$/g, ' ')
    .replace(/\\textbar\b/g, ' | ')
    .replace(/\\textbullet\b/g, ' ')
    .replace(/\\fa[A-Za-z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/---/g, '-')
    .replace(/--/g, '-')
    .replace(/~/g, ' ')
    .replace(/\\(?:small|large|Large|LARGE|huge|Huge|scshape|normalfont|raggedright|centering|hfill|vfill|newpage|clearpage|smallskip|medskip|bigskip|noident|noindent)\b/g, ' ');
}

function cleanLatexInline(input: string): {
  text: string;
  links: LayoutLink[];
  isBold: boolean;
  isItalic: boolean;
  fontSize: number;
} {
  const links: LayoutLink[] = [];
  let isBold = /\\(?:textbf|bfseries)\b/.test(input);
  const isItalic = /\\(?:textit|emph)\b/.test(input);
  let fontSize = 11;
  if (/\\(?:Huge|huge)\b/.test(input)) {
    fontSize = 18;
    isBold = true;
  } else if (/\\(?:LARGE|Large|large)\b/.test(input)) {
    fontSize = 14;
    isBold = true;
  }

  let working = '';
  let idx = 0;
  while (idx < input.length) {
    if (input.startsWith('\\href', idx)) {
      const first = readBracedArg(input, idx + 5);
      const second = first ? readBracedArg(input, first.nextIdx) : null;
      if (first && second) {
        const safe = sanitizeHref(unescapeLatex(first.content));
        const label = cleanLatexInline(second.content).text;
        if (safe) links.push({ label: label || safe, url: safe });
        working += label || first.content;
        idx = second.nextIdx;
        continue;
      }
    }

    if (input.startsWith('\\url', idx)) {
      const arg = readBracedArg(input, idx + 4);
      if (arg) {
        const cleanUrl = unescapeLatex(arg.content).trim();
        const safe = sanitizeHref(cleanUrl);
        if (safe) links.push({ label: cleanUrl, url: safe });
        working += cleanUrl;
        idx = arg.nextIdx;
        continue;
      }
    }

    const styleCmd = input.slice(idx).match(/^\\(textbf|textit|emph|underline|textsc|textsf|texttt|mbox|text)\b/);
    if (styleCmd) {
      const arg = readBracedArg(input, idx + styleCmd[0].length);
      if (arg) {
        const nested = cleanLatexInline(arg.content);
        links.push(...nested.links);
        working += nested.text;
        idx = arg.nextIdx;
        continue;
      }
    }

    working += input[idx];
    idx += 1;
  }

  const stripped = unescapeLatex(working)
    .replace(/\\vspace\*?\{[^}]*\}|\\hspace\*?\{[^}]*\}/g, ' ')
    .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ');

  return {
    text: normalizeWhitespace(stripped),
    links: mergeLayoutLinks(links),
    isBold,
    isItalic,
    fontSize,
  };
}

function readMacroCalls(source: string, macroName: string, argCount: number): Array<{ args: string[]; start: number; end: number }> {
  const token = `\\${macroName}`;
  const matches: Array<{ args: string[]; start: number; end: number }> = [];
  let pos = 0;
  while (pos < source.length) {
    const found = source.indexOf(token, pos);
    if (found === -1) break;
    const nextChar = source[found + token.length];
    if (nextChar && /[A-Za-z]/.test(nextChar)) {
      pos = found + token.length;
      continue;
    }
    let cursor = found + token.length;
    if (source[cursor] === '*') cursor += 1;
    const args: string[] = [];
    let valid = true;
    for (let a = 0; a < argCount; a += 1) {
      const arg = readBracedArg(source, cursor);
      if (!arg) {
        valid = false;
        break;
      }
      args.push(arg.content);
      cursor = arg.nextIdx;
    }
    if (valid) {
      matches.push({ args, start: found, end: cursor });
      pos = cursor;
    } else {
      pos = found + token.length;
    }
  }
  return matches;
}

/**
 * Parses LaTeX (.tex) resume source into a LayoutDocument supporting Jake's resume macros,
 * \href{url}{label}, \section{...}, \resumeSubheading, \resumeProjectHeading, and \item bullets.
 */
export function parseLatexToLayout(raw: string): LayoutDocument {
  const uncommented = stripLatexComments(raw.replace(/\r\n?/g, '\n').replace(/\0/g, ''));
  const docStart = uncommented.indexOf('\\begin{document}');
  const docEnd = uncommented.indexOf('\\end{document}');
  const body =
    docStart !== -1
      ? uncommented.slice(docStart + '\\begin{document}'.length, docEnd > docStart ? docEnd : undefined)
      : uncommented;

  let transformed = body
    .replace(/\\resumeSubHeadingListStart|\\resumeSubHeadingListEnd|\\resumeItemListStart|\\resumeItemListEnd/g, '\n')
    .replace(/\\begin\{(?:itemize|enumerate|tabular\*?|center)\}(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, '\n')
    .replace(/\\end\{(?:itemize|enumerate|tabular\*?|center)\}/g, '\n')
    .replace(/\\\\(?:\[[^\]]*\])?/g, '\n');

  // Replace structured 4-arg and 2-arg macros with marker lines so order is preserved.
  const applyMacro = (macro: string, argc: number, render: (args: string[]) => string) => {
    const calls = readMacroCalls(transformed, macro, argc);
    if (!calls.length) return;
    let out = '';
    let prev = 0;
    for (const call of calls) {
      out += transformed.slice(prev, call.start);
      out += render(call.args);
      prev = call.end;
    }
    out += transformed.slice(prev);
    transformed = out;
  };

  applyMacro('section', 1, ([title]) => `\n@@SECTION@@${title}@@END@@\n`);
  applyMacro('subsection', 1, ([title]) => `\n@@BOLD@@${title}@@END@@\n`);
  applyMacro('resumeSubheading', 4, ([a, b, c, d]) =>
    `\n@@SPLITBOLD@@${a}@@COL@@${b}@@END@@\n@@SPLITITALIC@@${c}@@COL@@${d}@@END@@\n`,
  );
  applyMacro('resumeProjectHeading', 2, ([a, b]) => `\n@@SPLITBOLD@@${a}@@COL@@${b}@@END@@\n`);
  applyMacro('resumeSubItem', 1, ([text]) => `\n@@BULLET@@${text}@@END@@\n`);
  applyMacro('resumeItem', 1, ([text]) => `\n@@BULLET@@${text}@@END@@\n`);

  transformed = transformed.replace(/\\item\b(?:\[[^\]]*\])?\s*/g, '\n@@BULLET@@');

  const lines: LayoutLine[] = [];
  let cursorY = 48;
  let blankRun = 0;

  for (const rawLine of transformed.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      blankRun += 1;
      continue;
    }

    const gapAbove = lines.length === 0 ? 0 : blankRun > 0 ? Math.min(30, 12 + blankRun * 4) : 4;
    blankRun = 0;
    cursorY += gapAbove + 14;

    const sectionMatch = trimmed.match(/^@@SECTION@@([\s\S]*?)@@END@@$/);
    if (sectionMatch) {
      const cleaned = cleanLatexInline(sectionMatch[1]);
      if (cleaned.text) {
        lines.push(
          makeLayoutLine({
            text: cleaned.text,
            x: 40,
            y: cursorY,
            fontSize: 13,
            isBold: true,
            headingLevel: 2,
            gapAbove: Math.max(gapAbove, 14),
            links: cleaned.links,
          }),
        );
      }
      continue;
    }

    const splitMatch = trimmed.match(/^@@(SPLITBOLD|SPLITITALIC)@@([\s\S]*?)@@COL@@([\s\S]*?)@@END@@$/);
    if (splitMatch) {
      const left = cleanLatexInline(splitMatch[2]);
      const right = cleanLatexInline(splitMatch[3]);
      if (left.text || right.text) {
        lines.push(
          makeLayoutLine({
            text: right.text ? `${left.text} | ${right.text}` : left.text,
            leftText: left.text || right.text,
            rightText: left.text ? right.text : undefined,
            x: 40,
            y: cursorY,
            fontSize: 11,
            isBold: splitMatch[1] === 'SPLITBOLD' || left.isBold,
            isItalic: splitMatch[1] === 'SPLITITALIC' || left.isItalic,
            gapAbove,
            links: mergeLayoutLinks(left.links, right.links),
          }),
        );
      }
      continue;
    }

    const bulletMatch = trimmed.match(/^@@BULLET@@([\s\S]*?)(?:@@END@@)?$/);
    if (bulletMatch) {
      const cleaned = cleanLatexInline(bulletMatch[1]);
      if (cleaned.text) {
        lines.push(
          makeLayoutLine({
            text: cleaned.text,
            x: 56,
            y: cursorY,
            fontSize: 11,
            hasBullet: true,
            indent: 16,
            gapAbove,
            links: cleaned.links,
          }),
        );
      }
      continue;
    }

    const boldMatch = trimmed.match(/^@@BOLD@@([\s\S]*?)@@END@@$/);
    const cleaned = cleanLatexInline(boldMatch ? boldMatch[1] : trimmed);
    if (!cleaned.text) continue;

    lines.push(
      makeLayoutLine({
        text: cleaned.text,
        x: 40,
        y: cursorY,
        fontSize: lines.length === 0 ? Math.max(16, cleaned.fontSize) : cleaned.fontSize,
        isBold: Boolean(boldMatch) || cleaned.isBold || lines.length === 0,
        isItalic: cleaned.isItalic,
        gapAbove,
        links: cleaned.links,
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
