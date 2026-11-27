import type { LayoutDocument, LayoutLine, LayoutLink, LayoutTopology, RawPositionedSpan } from './types';
import { isUpperCaseLine, mergeLayoutLinks, normalizeWhitespace, sanitizeHref, stripBulletPrefix } from './adapters/utils';

interface RowSegment {
  text: string;
  minX: number;
  maxX: number;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  hasBullet: boolean;
  links: LayoutLink[];
}

interface PositionedRow {
  page: number;
  y: number;
  fontSize: number;
  segments: RowSegment[];
}

const DATE_OR_META_ONLY_RE =
  /^(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}|(?:19|20)\d{2}|present|current|ongoing|remote|hybrid|gpa\s*:?\s*[\d.\/]+)(?:\s*[-–—to]+\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}|(?:19|20)\d{2}|present|current|ongoing))?$/i;

function computeMedian(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildRowSegments(spans: RawPositionedSpan[]): RowSegment[] {
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  const segments: RowSegment[] = [];

  let activeAnchorUrl = '';
  let activeAnchorLabel = '';

  const flushAnchor = (seg: RowSegment | undefined) => {
    if (seg && activeAnchorUrl) {
      const safe = sanitizeHref(activeAnchorUrl);
      const label = normalizeWhitespace(activeAnchorLabel);
      if (safe) {
        seg.links.push({ label: label || safe, url: safe });
      }
    }
    activeAnchorUrl = '';
    activeAnchorLabel = '';
  };

  let cur: RowSegment | null = null;
  let curTrailingSpace = false;
  let prevEnd = 0;

  for (const span of sorted) {
    const rawStr = span.text.replace(/\0/g, '').replace(/\u00a0/g, ' ');
    const spanWidth = span.width > 0 ? span.width : rawStr.length * span.fontSize * 0.45;
    if (!rawStr.trim() && !span.href) {
      if (cur && rawStr.length > 0) curTrailingSpace = true;
      prevEnd = Math.max(prevEnd, span.x + spanWidth);
      continue;
    }

    const gap = cur ? span.x - prevEnd : 0;
    const fontScale = cur ? Math.max(cur.fontSize, span.fontSize) : span.fontSize;
    const isColumnJump = cur !== null && gap > Math.max(18, 2.35 * fontScale);

    if (!cur || isColumnJump) {
      flushAnchor(cur ?? undefined);
      const cleaned = rawStr.trim();
      const bulletInfo = stripBulletPrefix(cleaned);
      cur = {
        text: cleaned,
        minX: span.x,
        maxX: span.x + spanWidth,
        fontSize: span.fontSize,
        isBold: span.isBold,
        isItalic: span.isItalic,
        hasBullet: bulletInfo.hasBullet,
        links: [],
      };
      segments.push(cur);
      curTrailingSpace = /\s$/.test(rawStr);
      if (span.href) {
        activeAnchorUrl = span.href;
        activeAnchorLabel = cleaned;
      }
    } else {
      const trimmedLeft = rawStr.trimStart();
      const hasLeadingSpace = /^\s/.test(rawStr);
      const needsSpace =
        curTrailingSpace ||
        hasLeadingSpace ||
        gap > 0.14 * fontScale;
      const addition = trimmedLeft.trimEnd();
      if (addition) {
        cur.text += (needsSpace && cur.text ? ' ' : '') + addition;
      }
      cur.maxX = Math.max(cur.maxX, span.x + spanWidth);
      cur.fontSize = Math.max(cur.fontSize, span.fontSize);
      cur.isBold = cur.isBold || span.isBold;
      cur.isItalic = cur.isItalic || span.isItalic;
      curTrailingSpace = /\s$/.test(rawStr);

      if (span.href) {
        if (activeAnchorUrl === span.href) {
          if (addition) activeAnchorLabel += (needsSpace && activeAnchorLabel ? ' ' : '') + addition;
        } else {
          flushAnchor(cur);
          activeAnchorUrl = span.href;
          activeAnchorLabel = addition;
        }
      } else if (activeAnchorUrl) {
        flushAnchor(cur);
      }
    }

    prevEnd = Math.max(prevEnd, span.x + spanWidth);
  }

  flushAnchor(cur ?? undefined);

  for (const seg of segments) {
    seg.text = normalizeWhitespace(seg.text);
  }
  return segments.filter((seg) => Boolean(seg.text));
}

function clusterSpansIntoRows(pageSpans: RawPositionedSpan[]): PositionedRow[] {
  if (!pageSpans.length) return [];
  const sorted = [...pageSpans].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: Array<{ anchorY: number; fontSize: number; spans: RawPositionedSpan[] }> = [];

  for (const span of sorted) {
    const last = groups[groups.length - 1];
    const tolerance = last ? Math.max(2.5, 0.38 * Math.max(last.fontSize, span.fontSize)) : 0;
    if (last && Math.abs(span.y - last.anchorY) <= tolerance) {
      last.spans.push(span);
      last.fontSize = Math.max(last.fontSize, span.fontSize);
    } else {
      groups.push({ anchorY: span.y, fontSize: span.fontSize, spans: [span] });
    }
  }

  const rows: PositionedRow[] = [];
  for (const group of groups) {
    const segments = buildRowSegments(group.spans);
    if (!segments.length) continue;
    rows.push({
      page: group.spans[0].page,
      y: group.anchorY,
      fontSize: computeMedian(segments.map((s) => s.fontSize), group.fontSize),
      segments,
    });
  }
  return rows;
}

interface TwoColumnSplit {
  gutterX: number;
  headerCutoffY: number;
  sidebarSide: 'left' | 'right';
}

function detectTwoColumnSplit(rows: PositionedRow[], pageWidth: number, pageHeight: number): TwoColumnSplit | null {
  if (rows.length < 6) return null;

  const headerCutoffY = pageHeight * 0.22;
  const candidateRows = rows.filter((row) => row.y > headerCutoffY * 0.65);
  if (candidateRows.length < 5) return null;

  let best: { gutterX: number; score: number; sidebarSide: 'left' | 'right' } | null = null;

  for (let gx = Math.round(pageWidth * 0.26); gx <= Math.round(pageWidth * 0.68); gx += 10) {
    let leftMultiWord = 0;
    let rightMultiWord = 0;
    let leftWidthSum = 0;
    let rightWidthSum = 0;
    let crossingCount = 0;

    for (const row of candidateRows) {
      let rowCrossed = false;
      let hasLeft = false;
      let hasRight = false;
      const leftTexts: string[] = [];
      const rightTexts: string[] = [];

      for (const seg of row.segments) {
        if (seg.minX < gx - 4 && seg.maxX > gx + 4) {
          rowCrossed = true;
        } else if (seg.maxX <= gx + 4) {
          hasLeft = true;
          leftTexts.push(seg.text);
          leftWidthSum += seg.maxX - seg.minX;
        } else if (seg.minX >= gx - 4) {
          hasRight = true;
          rightTexts.push(seg.text);
          rightWidthSum += seg.maxX - seg.minX;
        }
      }

      if (rowCrossed && row.y > headerCutoffY) {
        crossingCount += 1;
      } else {
        const lJoined = leftTexts.join(' ').trim();
        const rJoined = rightTexts.join(' ').trim();
        const isContentCell = (cell: string) =>
          (cell.split(/\s+/).length >= 2 || /[@|]/.test(cell)) && !DATE_OR_META_ONLY_RE.test(cell);
        if (hasLeft && isContentCell(lJoined)) {
          leftMultiWord += 1;
        }
        if (hasRight && isContentCell(rJoined)) {
          rightMultiWord += 1;
        }
      }
    }

    if (leftMultiWord < 3 || rightMultiWord < 3) continue;
    if (crossingCount > Math.max(2, Math.floor(candidateRows.length * 0.16))) continue;

    const score = leftMultiWord + rightMultiWord - crossingCount * 3;
    const sidebarSide: 'left' | 'right' = leftWidthSum < rightWidthSum * 0.85 ? 'left' : 'right';
    if (!best || score > best.score) {
      best = { gutterX: gx, score, sidebarSide };
    }
  }

  if (!best) return null;

  // Determine exact first row where non-date split body begins.
  const firstSplitRow = rows.find((row) =>
    row.segments.some((seg) => seg.minX >= best!.gutterX && !DATE_OR_META_ONLY_RE.test(seg.text)) &&
    row.segments.some((seg) => seg.maxX <= best!.gutterX),
  );
  const splitY = firstSplitRow ? Math.min(headerCutoffY, firstSplitRow.y - 2) : headerCutoffY * 0.72;

  return {
    gutterX: best.gutterX,
    headerCutoffY: splitY,
    sidebarSide: best.sidebarSide,
  };
}

function segmentsToLayoutLine(
  segments: RowSegment[],
  page: number,
  y: number,
  gapAbove: number,
  column: 'header' | 'main' | 'sidebar',
): LayoutLine {
  const first = segments[0];
  const links = mergeLayoutLinks(...segments.map((s) => s.links));

  if (segments.length === 2 && segments[1].text.length <= 55 && column !== 'header') {
    const bulletLeft = stripBulletPrefix(first.text);
    return {
      text: `${bulletLeft.cleaned} | ${segments[1].text}`,
      leftText: bulletLeft.cleaned,
      rightText: segments[1].text,
      x: first.minX,
      y,
      page,
      fontSize: first.fontSize,
      isBold: first.isBold,
      isItalic: first.isItalic,
      isUpperCase: isUpperCaseLine(bulletLeft.cleaned),
      hasBullet: bulletLeft.hasBullet,
      indent: Math.round(first.minX),
      gapAbove,
      column,
      links,
    };
  }

  const joined = segments.map((s) => s.text).join(' ').trim();
  const bulletInfo = stripBulletPrefix(joined);
  return {
    text: bulletInfo.cleaned,
    leftText: bulletInfo.cleaned,
    x: first.minX,
    y,
    page,
    fontSize: computeMedian(segments.map((s) => s.fontSize), first.fontSize),
    isBold: segments.every((s) => s.isBold) || first.isBold,
    isItalic: segments.every((s) => s.isItalic),
    isUpperCase: isUpperCaseLine(bulletInfo.cleaned),
    hasBullet: bulletInfo.hasBullet,
    indent: Math.round(first.minX),
    gapAbove,
    column,
    links,
  };
}

function mergeWrappedBullets(lines: LayoutLine[]): LayoutLine[] {
  const merged: LayoutLine[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    const isContinuation =
      prev &&
      prev.column === line.column &&
      prev.page === line.page &&
      prev.hasBullet &&
      !line.hasBullet &&
      !line.isBold &&
      !line.isUpperCase &&
      !line.headingLevel &&
      !line.rightText &&
      line.gapAbove < 10 &&
      line.x >= prev.x - 4 &&
      line.text.length > 0 &&
      !/^[-*•▪◦]/.test(line.text) &&
      !DATE_OR_META_ONLY_RE.test(line.text);

    if (isContinuation) {
      prev.text = `${prev.text} ${line.text}`.trim();
      prev.leftText = `${prev.leftText} ${line.leftText}`.trim();
      prev.links = mergeLayoutLinks(prev.links, line.links);
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

/**
 * Reconstructs visual reading order, kerning splits, split-row headings/dates,
 * and 1-column vs 2-column page topology from raw PDF spans.
 */
export function reconstructLayoutFromSpans(
  pagesSpans: RawPositionedSpan[][],
  pageSize: { width: number; height: number },
  extractedLinkAnnotations: number,
): LayoutDocument {
  const allHeader: LayoutLine[] = [];
  const allMain: LayoutLine[] = [];
  const allSidebar: LayoutLine[] = [];
  let hasAnyTwoColumn = false;

  pagesSpans.forEach((pageSpans, pageIdx) => {
    const pageNum = pageIdx + 1;
    const rows = clusterSpansIntoRows(pageSpans);
    if (!rows.length) return;

    const lineSteps: number[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const dy = rows[i].y - rows[i - 1].y;
      if (dy > 2 && dy < 40) lineSteps.push(dy);
    }
    const medianStep = computeMedian(lineSteps, 14);

    const split = detectTwoColumnSplit(rows, pageSize.width, pageSize.height);
    if (!split) {
      let prevY: number | null = null;
      let seenBodySection = false;
      const headingStopRe = /^(?:summary|professional\s+summary|executive\s+summary|objective|profile|experience|work\s+experience|professional\s+experience|relevant\s+experience|employment|projects|education|skills|technical\s+skills|certifications?|awards?)\s*:?$/i;
      for (const row of rows) {
        const dy = prevY === null ? 0 : row.y - prevY;
        const gapAbove = prevY === null ? 0 : dy > medianStep * 1.35 ? Math.round(dy) : 4;
        prevY = row.y;
        const rowJoined = row.segments.map((s) => s.text).join(' ').trim();
        if (pageIdx > 0 || headingStopRe.test(rowJoined) || row.y > pageSize.height * 0.22) {
          seenBodySection = true;
        }
        const column: 'header' | 'main' = !seenBodySection && pageIdx === 0 ? 'header' : 'main';
        const line = segmentsToLayoutLine(row.segments, pageNum, row.y, gapAbove, column);
        if (column === 'header') allHeader.push(line);
        else allMain.push(line);
      }
      return;
    }

    hasAnyTwoColumn = true;
    const mainRows: PositionedRow[] = [];
    const sidebarRows: PositionedRow[] = [];
    let prevHeaderY: number | null = null;

    for (const row of rows) {
      if (pageIdx === 0 && row.y <= split.headerCutoffY) {
        const dy = prevHeaderY === null ? 0 : row.y - prevHeaderY;
        const gapAbove = prevHeaderY === null ? 0 : dy > medianStep * 1.35 ? Math.round(dy) : 4;
        prevHeaderY = row.y;
        allHeader.push(segmentsToLayoutLine(row.segments, pageNum, row.y, gapAbove, 'header'));
        continue;
      }

      const leftSegs = row.segments.filter((seg) => seg.maxX <= split.gutterX + 4);
      const rightSegs = row.segments.filter((seg) => seg.minX >= split.gutterX - 4 && seg.maxX > split.gutterX + 4);
      const crossSegs = row.segments.filter((seg) => seg.minX < split.gutterX - 4 && seg.maxX > split.gutterX + 4);

      if (crossSegs.length && !leftSegs.length && !rightSegs.length) {
        mainRows.push(row);
        continue;
      }

      const mainSegs = split.sidebarSide === 'left' ? [...crossSegs, ...rightSegs] : [...crossSegs, ...leftSegs];
      const sideSegs = split.sidebarSide === 'left' ? leftSegs : rightSegs;

      if (mainSegs.length) {
        mainRows.push({ page: row.page, y: row.y, fontSize: row.fontSize, segments: mainSegs });
      }
      if (sideSegs.length) {
        sidebarRows.push({ page: row.page, y: row.y, fontSize: row.fontSize, segments: sideSegs });
      }
    }

    const pushColumnRows = (colRows: PositionedRow[], col: 'main' | 'sidebar', target: LayoutLine[]) => {
      let prevY: number | null = null;
      for (const r of colRows) {
        const dy = prevY === null ? 0 : r.y - prevY;
        const gapAbove = prevY === null ? 16 : dy > medianStep * 1.35 ? Math.round(dy) : 4;
        prevY = r.y;
        target.push(segmentsToLayoutLine(r.segments, pageNum, r.y, gapAbove, col));
      }
    };

    pushColumnRows(mainRows, 'main', allMain);
    pushColumnRows(sidebarRows, 'sidebar', allSidebar);
  });

  const combined = mergeWrappedBullets([...allHeader, ...allMain, ...allSidebar]);
  const layoutType: LayoutTopology = hasAnyTwoColumn ? 'two-column' : 'single-column';

  return {
    lines: combined,
    pageWidth: pageSize.width,
    pageHeight: pageSize.height,
    layoutType,
    extractedLinkAnnotations,
  };
}

function formatLineForCanonicalText(line: LayoutLine): string {
  let rendered = line.hasBullet ? `- ${line.text}` : line.text;
  if (!line.links.length) return rendered;

  const extraUrls: string[] = [];
  const lowerLine = rendered.toLowerCase();
  for (const link of line.links) {
    const cleanTarget = link.url.replace(/^mailto:/i, '').replace(/^tel:/i, '').replace(/\/$/, '');
    const hostPath = cleanTarget.replace(/^https?:\/\/(?:www\.)?/i, '').toLowerCase();
    if (!lowerLine.includes(cleanTarget.toLowerCase()) && (!hostPath || !lowerLine.includes(hostPath))) {
      extraUrls.push(`${link.label} (${cleanTarget})`);
    }
  }

  if (extraUrls.length > 0 && line.column !== 'main') {
    const lineWords = line.text.split(/\s*[|•·]\s*/).filter(Boolean);
    if (lineWords.length <= extraUrls.length + 1) {
      return extraUrls.join(' | ');
    }
    rendered = `${rendered} | ${extraUrls.join(' | ')}`;
  }

  return rendered;
}

/**
 * Emits clean reading-order plain text while preserving extracted PDF/DOCX/LaTeX/RTF hyperlink URLs.
 */
export function buildCanonicalText(doc: LayoutDocument): string {
  const chunks: string[] = [];
  let prevCol: LayoutLine['column'] | null = null;

  for (const line of doc.lines) {
    const formatted = formatLineForCanonicalText(line);
    if (!formatted) continue;
    const isParagraphBreak =
      chunks.length > 0 &&
      (line.gapAbove >= 14 || Boolean(line.headingLevel) || (prevCol !== null && prevCol !== line.column));
    if (isParagraphBreak) {
      chunks.push(`\n${formatted}`);
    } else {
      chunks.push(formatted);
    }
    prevCol = line.column;
  }

  return chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
