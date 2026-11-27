import type { LayoutDocument, LayoutLine, LayoutLink } from '../types';
import { makeLayoutLine, normalizeWhitespace, sanitizeHref, stripBulletPrefix } from './utils';

const SKIP_GROUPS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'header',
  'footer',
  'headerl',
  'headerr',
  'headerf',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'fldinst',
  'listtable',
  'listoverridetable',
  'revtbl',
  'rsidtbl',
  'xmlopen',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
]);

interface RtfState {
  bold: boolean;
  italic: boolean;
  fontSize: number;
  ucSkip: number;
  skip: boolean;
  inField: boolean;
  inFldinst: boolean;
  inFldrslt: boolean;
  fldinstBuffer: string;
  fldrsltLabel: string;
  fieldUrl: string;
}

/**
 * Streaming RTF parser preserving bold/italic emphasis, paragraph breaks, tabs, Unicode escapes,
 * and HYPERLINK field anchors.
 */
export function parseRtfToLayout(raw: string): LayoutDocument {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('{\\rtf')) {
    throw new Error('This file does not contain a valid RTF document.');
  }

  const lines: LayoutLine[] = [];
  const stack: RtfState[] = [];
  let state: RtfState = {
    bold: false,
    italic: false,
    fontSize: 11,
    ucSkip: 1,
    skip: false,
    inField: false,
    inFldinst: false,
    inFldrslt: false,
    fldinstBuffer: '',
    fldrsltLabel: '',
    fieldUrl: '',
  };

  let curLeft = '';
  let curRight = '';
  let inRightTab = false;
  let curBold = false;
  let curItalic = false;
  let curFontSize = 11;
  let curLinks: LayoutLink[] = [];
  let cursorY = 48;
  let emptyRowCount = 0;

  const appendChar = (ch: string) => {
    if (state.inFldinst) {
      state.fldinstBuffer += ch;
      return;
    }
    if (state.skip) return;
    if (state.inFldrslt) state.fldrsltLabel += ch;
    if (inRightTab) {
      curRight += ch;
    } else {
      curLeft += ch;
    }
    if (state.bold) curBold = true;
    if (state.italic) curItalic = true;
    curFontSize = Math.max(curFontSize, state.fontSize);
  };

  const flushLine = () => {
    const leftClean = normalizeWhitespace(curLeft);
    const rightClean = normalizeWhitespace(curRight);
    const linksToAttach = [...curLinks];
    curLeft = '';
    curRight = '';
    inRightTab = false;
    curBold = false;
    curItalic = false;
    curFontSize = 11;
    curLinks = [];

    if (!leftClean && !rightClean) {
      emptyRowCount += 1;
      return;
    }

    const gapAbove = lines.length === 0 ? 0 : emptyRowCount > 0 ? Math.min(30, 12 + emptyRowCount * 4) : 4;
    emptyRowCount = 0;
    cursorY += gapAbove + 14;

    const { hasBullet, cleaned } = stripBulletPrefix(leftClean || rightClean);
    const finalLeft = leftClean ? cleaned : '';
    const text = rightClean && finalLeft ? `${finalLeft} | ${rightClean}` : finalLeft || rightClean;

    if (!text) return;

    lines.push(
      makeLayoutLine({
        text,
        leftText: finalLeft || rightClean,
        rightText: finalLeft && rightClean ? rightClean : undefined,
        x: hasBullet ? 56 : 40,
        y: cursorY,
        fontSize: lines.length === 0 ? Math.max(15, curFontSize) : curFontSize,
        isBold: curBold || lines.length === 0,
        isItalic: curItalic,
        hasBullet,
        indent: hasBullet ? 16 : 0,
        gapAbove,
        links: linksToAttach,
      }),
    );
  };

  let i = 0;
  let pendingSkipChars = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];

    if (pendingSkipChars > 0 && ch !== '{' && ch !== '}' && ch !== '\\') {
      pendingSkipChars -= 1;
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      i += 1;
      continue;
    }

    if (ch === '{') {
      stack.push({ ...state });
      i += 1;
      continue;
    }

    if (ch === '}') {
      const closing = state;
      const parent = stack.pop();
      if (parent) {
        if (closing.inFldinst) {
          const urlMatch = closing.fldinstBuffer.match(/HYPERLINK\s+"([^"]+)"/i);
          if (urlMatch) {
            const safe = sanitizeHref(urlMatch[1]);
            if (safe) parent.fieldUrl = safe;
          }
        } else if (closing.inFldrslt) {
          const safe = sanitizeHref(closing.fieldUrl || parent.fieldUrl);
          const label = normalizeWhitespace(closing.fldrsltLabel);
          if (safe) {
            curLinks.push({ label: label || safe, url: safe });
          }
        }
        state = parent;
      }
      i += 1;
      continue;
    }

    if (ch === '\\') {
      i += 1;
      if (i >= trimmed.length) break;
      const next = trimmed[i];

      if (next === '*' && i + 1 < trimmed.length && trimmed[i + 1] === '\\') {
        // Ignore ignorable destination unless it's \*\fldinst
        const lookahead = trimmed.slice(i + 2, i + 12);
        if (!lookahead.startsWith('fldinst')) {
          state.skip = true;
        }
        i += 1;
        continue;
      }

      if (next === "'" && i + 2 < trimmed.length) {
        const hex = trimmed.slice(i + 1, i + 3);
        const code = Number.parseInt(hex, 16);
        if (Number.isFinite(code)) {
          appendChar(String.fromCharCode(code));
        }
        i += 3;
        continue;
      }

      if (next === '\\' || next === '{' || next === '}') {
        appendChar(next);
        i += 1;
        continue;
      }

      if (next === '~') {
        appendChar(' ');
        i += 1;
        continue;
      }

      if (next === '-' || next === '_') {
        appendChar('-');
        i += 1;
        continue;
      }

      const ctrlMatch = trimmed.slice(i).match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if (ctrlMatch) {
        const word = ctrlMatch[1];
        const param = ctrlMatch[2] !== undefined ? Number.parseInt(ctrlMatch[2], 10) : undefined;
        i += ctrlMatch[0].length;

        if (word === 'field') {
          state.inField = true;
          continue;
        }
        if (word === 'fldinst') {
          state.inFldinst = true;
          state.skip = false;
          state.fldinstBuffer = '';
          continue;
        }
        if (word === 'fldrslt') {
          state.inFldrslt = true;
          state.fldrsltLabel = '';
          continue;
        }
        if (SKIP_GROUPS.has(word)) {
          state.skip = true;
          continue;
        }
        if (state.skip) continue;

        if (word === 'par' || word === 'line') {
          flushLine();
        } else if (word === 'tab') {
          if (curLeft.trim() && !inRightTab) {
            inRightTab = true;
          } else {
            appendChar(' ');
          }
        } else if (word === 'bullet') {
          appendChar('• ');
        } else if (word === 'emdash' || word === 'endash') {
          appendChar('-');
        } else if (word === 'lquote' || word === 'rquote') {
          appendChar("'");
        } else if (word === 'ldblquote' || word === 'rdblquote') {
          appendChar('"');
        } else if (word === 'b') {
          state.bold = param !== 0;
        } else if (word === 'i') {
          state.italic = param !== 0;
        } else if (word === 'fs' && param !== undefined && param > 0) {
          state.fontSize = Math.round(param / 2);
        } else if (word === 'uc' && param !== undefined) {
          state.ucSkip = Math.max(0, param);
        } else if (word === 'u' && param !== undefined) {
          const cp = param < 0 ? 65536 + param : param;
          appendChar(String.fromCodePoint(cp));
          pendingSkipChars = state.ucSkip;
        }
        continue;
      }

      i += 1;
      continue;
    }

    appendChar(ch);
    i += 1;
  }

  flushLine();

  return {
    lines,
    pageWidth: 612,
    pageHeight: Math.max(792, cursorY + 48),
    layoutType: 'structured-markup',
    extractedLinkAnnotations: lines.reduce((sum, line) => sum + line.links.length, 0),
  };
}
