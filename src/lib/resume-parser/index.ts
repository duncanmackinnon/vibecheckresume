import type { GeneratedResumePreview, ResumeBuilderProfile } from '@/app/types';
import {
  extensionForMimeType,
  formatOriginalBadge,
  inferResumeMimeType,
  isBinaryResumeMimeType,
  MAX_RESUME_BYTES,
  RESUME_FILE_ACCEPT,
  RESUME_FORMAT_SUMMARY,
  SUPPORTED_RESUME_MIMES,
  validateUpload,
  type ResumeExtension,
  type SupportedResumeMimeType,
} from './formats';
import { parseLatexToLayout } from './adapters/latex';
import { parseMarkdownToLayout } from './adapters/markdown';
import { parseRtfToLayout } from './adapters/rtf';
import { parsePlainTextToLayout } from './adapters/text';
import { normalizeWhitespace } from './adapters/utils';
import { buildCanonicalText } from './layoutOrder';
import { segmentDocumentIntoSections } from './sectionSegmenter';
import {
  extractEducationEntries,
  extractExperienceEntries,
  extractHeaderFields,
  extractProjectEntries,
  extractSkillCategories,
} from './fieldExtractors';
import { inferSuggestedRoles } from './roleInference';
import type { LayoutDocument, ParsedResumeDocument } from './types';

export * from './types';
export {
  extensionForMimeType,
  formatOriginalBadge,
  inferResumeMimeType,
  isBinaryResumeMimeType,
  MAX_RESUME_BYTES,
  RESUME_FILE_ACCEPT,
  RESUME_FORMAT_SUMMARY,
  SUPPORTED_RESUME_MIMES,
  validateUpload,
  type ResumeExtension,
  type SupportedResumeMimeType,
};

function dedupeStrings(values: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const val of values) {
    const cleaned = normalizeWhitespace(val).slice(0, 300);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Runs Stages 3-5 over any reconstructed LayoutDocument (PDF, DOCX, RTF, MD, TEX, TXT).
 */
export function parseLayoutDocument(
  layout: LayoutDocument,
  sourceFormat: SupportedResumeMimeType,
  canonicalTextOverride?: string,
): ParsedResumeDocument {
  const canonicalText = canonicalTextOverride ?? buildCanonicalText(layout);
  const sections = segmentDocumentIntoSections(layout);
  const headerSection = sections.find((s) => s.kind === 'header');
  const bodySections = sections.filter((s) => s.kind !== 'header');

  const header = extractHeaderFields(headerSection, bodySections);
  const summaryLines = bodySections
    .filter((s) => s.kind === 'summary')
    .flatMap((s) => s.lines.map((l) => l.text));
  const summary = summaryLines.length ? normalizeWhitespace(summaryLines.join(' ')).slice(0, 500) : undefined;

  const experience = bodySections
    .filter((s) => s.kind === 'experience' || s.kind === 'volunteering')
    .flatMap((s) => extractExperienceEntries(s));

  const projects = bodySections
    .filter((s) => s.kind === 'projects')
    .flatMap((s) => extractProjectEntries(s));

  const educationParts = bodySections
    .filter((s) => s.kind === 'education')
    .map((s) => extractEducationEntries(s));
  const education = educationParts.flatMap((part) => part.entries);

  const { categories: skillCategories, flatSkills } = extractSkillCategories(bodySections);
  const certifications = bodySections
    .filter((s) => s.kind === 'certifications')
    .flatMap((s) => s.lines.map((l) => l.text));
  const awards = bodySections
    .filter((s) => s.kind === 'awards' || s.kind === 'publications')
    .flatMap((s) => s.lines.map((l) => l.text));
  const otherSections = bodySections
    .filter((s) => s.kind === 'other')
    .map((s) => ({ title: s.title, lines: s.lines.map((l) => l.text) }));

  const doc: ParsedResumeDocument = {
    schemaVersion: 1,
    sourceFormat,
    layoutType: layout.layoutType,
    extractedLinkAnnotations: layout.extractedLinkAnnotations,
    canonicalText,
    fullName: header.fullName,
    headline: header.headline,
    email: header.email,
    phone: header.phone,
    location: header.location,
    links: header.links,
    summary,
    experience,
    projects,
    education,
    skillCategories,
    flatSkills,
    certifications,
    awards,
    otherSections,
    sections,
    suggestedRoles: { roles: [], formatted: '', source: 'none', confidence: 0 },
  };

  doc.suggestedRoles = inferSuggestedRoles(doc);
  return doc;
}

/**
 * Parses plain text or pasted resume text locally in browser or Node (< 20ms).
 */
export function parseTextResume(rawText: string): ParsedResumeDocument {
  const layout = parsePlainTextToLayout(rawText);
  return parseLayoutDocument(layout, 'text/plain', rawText.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim());
}

/**
 * Parses text-based resume formats locally (RTF, Markdown, LaTeX, Plain Text).
 * Binary formats (.pdf, .docx) require the server entrypoint in `./server`.
 */
export function parseClientResumeTextByFormat(
  rawText: string,
  mimeType: SupportedResumeMimeType,
): ParsedResumeDocument {
  if (mimeType === 'application/rtf') {
    return parseLayoutDocument(parseRtfToLayout(rawText), 'application/rtf');
  }
  if (mimeType === 'text/markdown') {
    return parseLayoutDocument(parseMarkdownToLayout(rawText), 'text/markdown');
  }
  if (mimeType === 'application/x-tex') {
    return parseLayoutDocument(parseLatexToLayout(rawText), 'application/x-tex');
  }
  return parseTextResume(rawText);
}

/**
 * Adapts a structured ParsedResumeDocument to the existing ResumeBuilderProfile shape.
 */
export function toResumeBuilderProfile(doc: ParsedResumeDocument): ResumeBuilderProfile | undefined {
  const workHighlights: string[] = [];
  for (const entry of doc.experience) {
    if (entry.bullets.length > 0) {
      workHighlights.push(...entry.bullets);
    } else if (entry.rawHeader) {
      workHighlights.push(entry.rawHeader);
    }
  }

  // Fallback for sectionless plain text where lines had no recognized headings
  if (
    workHighlights.length === 0 &&
    doc.sections.every((s) => s.kind === 'header' || s.kind === 'other')
  ) {
    for (const sec of doc.otherSections) {
      for (const line of sec.lines) {
        if (line.length >= 12) workHighlights.push(line);
      }
    }
  }

  const educationStrings = doc.sections
    .filter((s) => s.kind === 'education')
    .flatMap((s) => s.lines.map((l) => l.text));

  const projectStrings: string[] = [];
  for (const proj of doc.projects) {
    const header = [proj.name, proj.technologies.join(', '), proj.dateRange].filter(Boolean).join(' | ');
    if (header) projectStrings.push(header);
    projectStrings.push(...proj.bullets);
  }

  const profile: ResumeBuilderProfile = {
    ...(doc.fullName ? { fullName: doc.fullName } : {}),
    ...(doc.email ? { email: doc.email } : {}),
    ...(doc.phone ? { phone: doc.phone } : {}),
    ...(doc.location ? { location: doc.location } : {}),
    links: dedupeStrings(
      doc.links.map((l) => l.display),
      6,
    ),
    ...(doc.headline ? { headline: doc.headline } : {}),
    ...(doc.summary ? { summary: doc.summary } : {}),
    workHighlights: dedupeStrings(workHighlights, 12),
    education: dedupeStrings(educationStrings, 8),
    skills: dedupeStrings(doc.flatSkills, 30),
    projects: dedupeStrings(projectStrings, 10),
    awardsCertifications: dedupeStrings([...doc.certifications, ...doc.awards], 8),
  };

  const hasContent = Boolean(
    profile.fullName ||
      profile.email ||
      profile.phone ||
      profile.location ||
      profile.links.length ||
      profile.headline ||
      profile.summary ||
      profile.workHighlights.length ||
      profile.education.length ||
      profile.skills.length ||
      profile.projects.length ||
      profile.awardsCertifications.length,
  );

  return hasContent ? profile : undefined;
}

/**
 * Formats parsed sections into structured preview sections when full structured preservation is helpful.
 */
export function toPreservedPreviewSections(doc: ParsedResumeDocument): GeneratedResumePreview['sections'] {
  const result: GeneratedResumePreview['sections'] = [];
  for (const sec of doc.sections) {
    if (sec.kind === 'header') continue;
    const items: GeneratedResumePreview['sections'][number]['items'] = [];
    for (const line of sec.lines) {
      if (line.hasBullet) {
        let last = items[items.length - 1];
        if (!last) {
          last = { heading: '', details: [] };
          items.push(last);
        }
        last.details.push(line.text);
      } else {
        items.push({
          heading: '',
          subheading: line.leftText,
          ...(line.rightText ? { date: line.rightText } : {}),
          details: [],
        });
      }
    }
    if (items.length) {
      result.push({ title: sec.title, items });
    }
  }
  return result;
}
