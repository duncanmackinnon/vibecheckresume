import type { DocumentSection, LayoutDocument, LayoutLine, SectionKind } from './types';
import { makeLayoutLine, normalizeWhitespace } from './adapters/utils';
import {
  analyzeLineSignals,
  isContactOrLinkLine,
  isLinkLabelSegment,
  SECTION_HEADING_VOCAB_RE,
} from './nlp/signals';

type HeadingClassification = SectionKind | 'sidebar_contact';

function classifyKnownHeading(rawHeading: string): HeadingClassification | null {
  const normalized = normalizeWhitespace(rawHeading)
    .replace(/[:\-–—]+$/, '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized.length > 55) return null;

  if (/^(?:contact(?:\s+info(?:rmation)?|\s+details)?|links|social(?:\s+links)?|connect)$/.test(normalized)) {
    return 'sidebar_contact';
  }
  if (/^(?:(?:professional|executive|career|personal)\s+)?(?:summary|profile|objective|about(?:\s+me)?|overview)$/.test(normalized)) {
    return 'summary';
  }
  if (
    /^(?:(?:professional|work|relevant|industry|clinical|research|teaching|career)\s+)?(?:experience|history|employment(?:\s+history)?)$/.test(normalized) ||
    /^where\s+i(?:'ve|\s+have)\s+worked$/.test(normalized)
  ) {
    return 'experience';
  }
  if (
    /^(?:(?:selected|technical|key|personal|academic|open[- ]source)\s+)?projects?$/.test(normalized) ||
    /^selected\s+work$/.test(normalized)
  ) {
    return 'projects';
  }
  if (/^(?:academic\s+)?(?:education|academics|education\s*(?:&|and)\s*training)$/.test(normalized)) {
    return 'education';
  }
  if (
    /^(?:(?:technical|core|key|relevant)\s+)?(?:skills|competencies|technologies|toolkit|tech\s+stack)$/.test(normalized) ||
    /^(?:languages|tools|frameworks)\s*(?:&|and)\s*(?:technologies|tools|frameworks)$/.test(normalized)
  ) {
    return 'skills';
  }
  if (/^(?:licenses?\s*(?:&|and)\s*)?certifications?(?:\s*(?:&|and)\s*licenses?)?$|^credentials$/.test(normalized)) {
    return 'certifications';
  }
  if (/^(?:awards?|honors?|achievements?)(?:\s*(?:&|and)\s*(?:honors?|awards?|certifications?|achievements?))?$/.test(normalized)) {
    return 'awards';
  }
  if (/^(?:publications?|papers?|research\s+output)$/.test(normalized)) {
    return 'publications';
  }
  if (/^(?:volunteer(?:ing)?(?:\s+experience)?|community\s+leadership|leadership(?:\s+experience)?|extracurriculars?)$/.test(normalized)) {
    return 'volunteering';
  }
  return null;
}

function matchHeadingWithInline(line: LayoutLine): {
  kind: HeadingClassification;
  title: string;
  inlineValue?: string;
} | null {
  if (line.hasBullet) return null;

  const clean = normalizeWhitespace(line.leftText || line.text);
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 1 && colonIdx < 42) {
    const prefix = clean.slice(0, colonIdx).trim();
    const afterColon = clean.slice(colonIdx + 1).trim();
    const kind = classifyKnownHeading(prefix);
    if (kind && !line.rightText) {
      return { kind, title: prefix, inlineValue: afterColon || undefined };
    }
  }

  const directKind = classifyKnownHeading(clean);
  if (directKind && !line.rightText) {
    return { kind: directKind, title: clean.replace(/:\s*$/, '') };
  }

  return null;
}

function isStructuralCustomHeading(line: LayoutLine, medianFontSize: number, lineIdx: number): boolean {
  if (lineIdx === 0 || line.column === 'header' || line.hasBullet || line.rightText) return false;
  const text = normalizeWhitespace(line.leftText || line.text).replace(/:\s*$/, '');
  if (!text || text.length > 48) return false;
  if (/[.!?]$/.test(text)) return false;
  if (isContactOrLinkLine(text) || isLinkLabelSegment(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;

  const signals = analyzeLineSignals(text);
  if (signals.hasDate || signals.hasEmail || signals.hasPhone || signals.hasActionVerb || signals.hasDegree) return false;
  if (signals.orgScore >= 0.75 || signals.roleScore >= 0.72) return false;

  if (SECTION_HEADING_VOCAB_RE.test(text)) return true;
  if (line.headingLevel && line.headingLevel >= 2) return true;
  if (line.fontSize >= medianFontSize * 1.15 && (line.isBold || line.isUpperCase)) return true;
  if (line.isUpperCase && text.replace(/[^A-Z]/g, '').length >= 4 && line.gapAbove >= 8) return true;
  if (line.isBold && words.length <= 3 && line.gapAbove >= 12) return true;

  return false;
}

function bottomUpClassifyOtherSection(section: DocumentSection): SectionKind {
  const lines = section.lines;
  if (!lines.length) return 'other';

  let degreeCount = 0;
  let dateCount = 0;
  let bulletOrActionCount = 0;
  let roleOrOrgCount = 0;
  let labeledSkillListCount = 0;
  let urlCount = 0;

  for (const line of lines) {
    const signals = analyzeLineSignals(line.text, line.leftText);
    if (signals.hasDegree) degreeCount += 1;
    if (signals.hasDate) dateCount += 1;
    if (line.hasBullet || signals.hasActionVerb) bulletOrActionCount += 1;
    if (signals.roleScore >= 0.65 || signals.orgScore >= 0.75) roleOrOrgCount += 1;
    if (line.links.length > 0) urlCount += 1;
    if (
      !line.hasBullet &&
      !signals.hasDate &&
      !signals.hasActionVerb &&
      (/^[^:]{2,28}:\s+.+/.test(line.text) || line.text.split(/[,;|•]/).length >= 3)
    ) {
      labeledSkillListCount += 1;
    }
  }

  if (degreeCount >= 1 && bulletOrActionCount <= 2) {
    return 'education';
  }
  if ((dateCount >= 1 || roleOrOrgCount >= 1) && bulletOrActionCount >= 1) {
    return urlCount >= 1 && roleOrOrgCount === 0 ? 'projects' : 'experience';
  }
  if (labeledSkillListCount >= 1 && bulletOrActionCount === 0 && dateCount === 0) {
    return 'skills';
  }
  if (lines.length <= 3 && bulletOrActionCount === 0 && dateCount === 0 && roleOrOrgCount === 0 && lines.some((l) => l.text.length >= 40)) {
    return 'summary';
  }
  return section.kind;
}

/**
 * Segments LayoutDocument into HeaderZone + typed body sections using top-down typography/lexicon
 * headings plus bottom-up grammatical feedback for ambiguous/custom section names.
 */
export function segmentDocumentIntoSections(layout: LayoutDocument): DocumentSection[] {
  const bodySizes = layout.lines.filter((l) => !l.isUpperCase && l.fontSize > 6).map((l) => l.fontSize);
  const sortedSizes = [...bodySizes].sort((a, b) => a - b);
  const medianFontSize = sortedSizes.length ? sortedSizes[Math.floor(sortedSizes.length / 2)] : 11;

  const headerLines: LayoutLine[] = [];
  const bodySections: DocumentSection[] = [];
  let activeSection: DocumentSection | null = null;
  let seenFirstBodySection = false;
  let inSidebarContact = false;

  for (let idx = 0; idx < layout.lines.length; idx += 1) {
    const line = layout.lines[idx];

    const headingMatch = matchHeadingWithInline(line);
    if (headingMatch) {
      inSidebarContact = false;
      if (headingMatch.kind === 'sidebar_contact') {
        inSidebarContact = true;
        activeSection = null;
        if (headingMatch.inlineValue) {
          headerLines.push(makeLayoutLine({ ...line, text: headingMatch.inlineValue, leftText: headingMatch.inlineValue, column: 'header' }));
        }
        continue;
      }

      seenFirstBodySection = true;
      activeSection = {
        kind: headingMatch.kind,
        title: headingMatch.title,
        rawHeading: line.text,
        lines: [],
      };
      bodySections.push(activeSection);
      if (headingMatch.inlineValue) {
        activeSection.lines.push(
          makeLayoutLine({
            text: headingMatch.inlineValue,
            leftText: headingMatch.inlineValue,
            x: line.x,
            y: line.y,
            page: line.page,
            fontSize: medianFontSize,
            column: line.column,
            links: line.links,
          }),
        );
      }
      continue;
    }

    if (inSidebarContact) {
      const customCheck = isStructuralCustomHeading(line, medianFontSize, idx);
      if (!customCheck && (isContactOrLinkLine(line.text) || analyzeLineSignals(line.text).isLocation || line.links.length > 0)) {
        headerLines.push({ ...line, column: 'header' });
        continue;
      }
      inSidebarContact = false;
    }

    if (isStructuralCustomHeading(line, medianFontSize, idx)) {
      seenFirstBodySection = true;
      const title = normalizeWhitespace(line.leftText || line.text).replace(/:\s*$/, '');
      activeSection = {
        kind: classifyKnownHeading(title) as SectionKind || 'other',
        title,
        rawHeading: line.text,
        lines: [],
      };
      bodySections.push(activeSection);
      continue;
    }

    if (!seenFirstBodySection || (layout.layoutType === 'two-column' && line.column === 'header')) {
      headerLines.push({ ...line, column: 'header' });
      continue;
    }

    // If a 2-column sidebar starts with un-headed contact rows before sidebar sections
    if (
      line.column === 'sidebar' &&
      (isContactOrLinkLine(line.text) ||
        (analyzeLineSignals(line.text).isLocation && activeSection?.kind !== 'experience' && activeSection?.kind !== 'education'))
    ) {
      headerLines.push({ ...line, column: 'header' });
      continue;
    }

    if (!activeSection) {
      activeSection = { kind: 'other', title: 'General', lines: [] };
      bodySections.push(activeSection);
    }
    activeSection.lines.push(line);
  }

  for (const section of bodySections) {
    if (section.kind === 'other') {
      section.kind = bottomUpClassifyOtherSection(section);
    }
  }

  const sections: DocumentSection[] = [];
  if (headerLines.length) {
    sections.push({ kind: 'header', title: 'Header', lines: headerLines });
  }
  sections.push(...bodySections);
  return sections;
}
