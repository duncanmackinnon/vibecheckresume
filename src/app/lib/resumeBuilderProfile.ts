import type { ResumeBuilderProfile } from '../types';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const EXPLICIT_URL_PATTERN = /\b(?:https?:\/\/[^\s|,;]+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\/[^\s|,;]*|linkedin\.com\/in\/[^\s|,;]+|github\.com\/[^\s|,;]+)/gi;
const HEADER_DOMAIN_PATTERN = /\b(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|edu|gov|dev|app|xyz|me|ca|uk|de|io|co|ai|tech|site|design)(?:\/[^\s|,;]*)?/g;
const SECTION_HEADING_PATTERN = /^(?:summary|professional\s+summary|executive\s+summary|objective|profile|about(?:\s+me)?|experience|work\s+experience|professional\s+experience|relevant\s+experience|work\s+history|employment(?:\s+history)?|education|academic\s+background|projects|technical\s+projects|selected\s+projects|skills|technical\s+skills|core\s+skills|core\s+competencies|tools\s*(?:&|and)\s*technologies|certifications?(?:\s*(?:&|and)\s*licenses?)?|awards?(?:\s*(?:&|and)\s*certifications?)?|credentials)\b:?$/i;
const IGNORED_TECH_SUFFIX_PATTERN = /\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rb|rs|c|cpp|h|java|json|ya?ml|toml|md|txt|pdf|tex|css|html|xml|sql|sh|csv|png|jpg|jpeg|svg|webp)$/i;

type SectionKind = 'summary' | 'experience' | 'projects' | 'education' | 'skills' | 'awards';

function matchSectionHeading(line: string): { kind: SectionKind; inlineValue: string } | null {
  const match = line.match(
    /^(summary|professional\s+summary|executive\s+summary|objective|profile|about(?:\s+me)?|experience|work\s+experience|professional\s+experience|relevant\s+experience|work\s+history|employment(?:\s+history)?|education|academic\s+background|projects|technical\s+projects|selected\s+projects|skills|technical\s+skills|core\s+skills|core\s+competencies|tools\s*(?:&|and)\s*technologies|certifications?(?:\s*(?:&|and)\s*licenses?)?|awards?(?:\s*(?:&|and)\s*certifications?)?|credentials)\s*(?::\s*(.*))?$/i
  );
  if (!match) return null;
  const heading = match[1].toLowerCase();
  const inlineValue = (match[2] ?? '').trim();
  if (/^(?:summary|professional|executive|objective|profile|about)/.test(heading)) return { kind: 'summary', inlineValue };
  if (/^(?:experience|work|professional\s+exp|relevant|employment)/.test(heading)) return { kind: 'experience', inlineValue };
  if (/^(?:projects|technical\s+projects|selected\s+projects)/.test(heading)) return { kind: 'projects', inlineValue };
  if (/^(?:education|academic)/.test(heading)) return { kind: 'education', inlineValue };
  if (/^(?:skills|technical\s+skills|core|tools)/.test(heading)) return { kind: 'skills', inlineValue };
  return { kind: 'awards', inlineValue };
}

function stripBullet(line: string): string {
  return line.replace(/^[-*•▪◦]+\s*/, '').trim();
}

function isContactOrLinkLine(line: string): boolean {
  if (EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line)) return true;
  if (/https?:\/\/|www\.|linkedin\.com\/|github\.com\//i.test(line)) return true;
  const domains = collectMatches(line, HEADER_DOMAIN_PATTERN);
  return domains.length > 0 && line.split(/\s*[|•·]\s*/).every((segment) => {
    const trimmed = segment.trim();
    return !trimmed || EMAIL_PATTERN.test(trimmed) || PHONE_PATTERN.test(trimmed) || domains.includes(trimmed);
  });
}

function extractHeadline(headerLines: string[], fullName: string, location: string): string {
  const candidate = headerLines.find((line) => {
    if (!line || line.length > 80) return false;
    if (fullName && line.toLowerCase() === fullName.toLowerCase()) return false;
    if (location && line.toLowerCase() === location.toLowerCase()) return false;
    if (SECTION_HEADING_PATTERN.test(line) || isContactOrLinkLine(line)) return false;
    if (/[.!?]$/.test(line) && line.split(/\s+/).length > 8) return false;
    return line.split(/\s+/).length <= 12;
  });
  return cleanText(candidate, 120);
}

function cleanText(value: unknown, maxLength = 180): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function toStringList(value: unknown, maxItems = 10): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((item) => cleanText(item, 300))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
}

function readProperty(source: unknown, key: string): unknown {
  return source && typeof source === 'object'
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function isLikelyName(line: string): boolean {
  if (!line || line.length > 60) return false;
  if (EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line) || /https?:|linkedin|github|resume|curriculum/i.test(line)) return false;
  if (/[0-9@|]/.test(line)) return false;

  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5 && words.every((word) => /^[A-Za-z][A-Za-z'.-]*$/.test(word));
}

function collectMatches(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern))
    .filter((match) => {
      const index = match.index ?? 0;
      const before = text[index - 1];
      return before !== '@' && !/\w/.test(before || '');
    })
    .map((match) => match[0].replace(/[).,;]+$/, '').trim())
    .filter((match) => !EMAIL_PATTERN.test(match) && !IGNORED_TECH_SUFFIX_PATTERN.test(match));
}

function extractLinks(headerText: string, bodyText: string): string[] {
  const candidates = [
    ...collectMatches(headerText, EXPLICIT_URL_PATTERN),
    ...collectMatches(headerText, HEADER_DOMAIN_PATTERN),
    ...collectMatches(bodyText, EXPLICIT_URL_PATTERN),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((match) => {
      const key = match.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

const NON_LOCATION_TOKEN_PATTERN = /\b(?:typescript|javascript|react|next|vue|angular|svelte|python|java|golang|rust|docker|kubernetes|aws|gcp|azure|sql|postgresql|postgres|mysql|mongodb|redis|graphql|node|built|developed|engineered|designed|led|shipped|deployed|experience|education|projects|skills)\b/i;

function extractLocation(headerLines: string[]): string {
  const segments = headerLines
    .slice(0, 8)
    .flatMap((line) => line.split(/\s*[|•·]\s*/))
    .map((segment) => segment.trim())
    .filter(Boolean);

  const locationSegment = segments.find((segment) => {
    if (segment.length > 45 || /@|https?:|www\.|linkedin|github|\d{3}/i.test(segment)) return false;
    if (SECTION_HEADING_PATTERN.test(segment) || NON_LOCATION_TOKEN_PATTERN.test(segment)) return false;
    if (segment.split(/\s+/).length > 5) return false;
    return /^\s*remote(?:\s*\([^)]{1,25}\))?\s*$/i.test(segment) ||
      /^[A-Z][A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/.test(segment);
  });

  return cleanText(locationSegment, 80);
}

export function normalizeResumeBuilderProfile(value: unknown): ResumeBuilderProfile | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const profile: ResumeBuilderProfile = {
    fullName: cleanText(readProperty(value, 'fullName'), 80) || undefined,
    email: cleanText(readProperty(value, 'email'), 120) || undefined,
    phone: cleanText(readProperty(value, 'phone'), 60) || undefined,
    location: cleanText(readProperty(value, 'location'), 80) || undefined,
    links: toStringList(readProperty(value, 'links'), 6),
    headline: cleanText(readProperty(value, 'headline'), 120) || undefined,
    summary: cleanText(readProperty(value, 'summary'), 500) || undefined,
    workHighlights: toStringList(readProperty(value, 'workHighlights'), 12),
    education: toStringList(readProperty(value, 'education'), 8),
    skills: toStringList(readProperty(value, 'skills'), 30),
    projects: toStringList(readProperty(value, 'projects'), 10),
    awardsCertifications: toStringList(readProperty(value, 'awardsCertifications'), 8),
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
    profile.awardsCertifications.length
  );

  return hasContent ? profile : undefined;
}

export function extractResumeBuilderProfileFromText(resumeText: string): ResumeBuilderProfile | undefined {
  const normalized = resumeText.replace(/\r\n/g, '\n').replace(/\0/g, '').trim();
  if (!normalized) return undefined;

  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const firstSectionIdx = lines.findIndex((line, idx) => idx > 0 && Boolean(matchSectionHeading(line)));
  const headerLines = lines.slice(0, firstSectionIdx > 0 ? Math.min(firstSectionIdx, 12) : Math.min(lines.length, 8));
  const headerText = headerLines.join(' ');
  const topText = lines.slice(0, 20).join(' ');
  const fullText = lines.join(' ');
  const email = topText.match(EMAIL_PATTERN)?.[0] ?? fullText.match(EMAIL_PATTERN)?.[0] ?? '';
  const phone = topText.match(PHONE_PATTERN)?.[0] ?? fullText.match(PHONE_PATTERN)?.[0] ?? '';
  const fullName = lines.slice(0, 8).find(isLikelyName) ?? '';
  const links = extractLinks(headerText, topText || fullText);
  const location = extractLocation(headerLines);
  const headline = extractHeadline(headerLines, fullName, location);

  const summaryLines: string[] = [];
  const workHighlights: string[] = [];
  const projects: string[] = [];
  const education: string[] = [];
  const skills: string[] = [];
  const awardsCertifications: string[] = [];

  const pushSkillLine = (line: string) => {
    const withoutLabel = stripBullet(line).replace(/^[^:]{1,32}:\s*/, '');
    for (const token of withoutLabel.split(/[,;|•]/)) {
      const cleaned = cleanText(token, 60);
      if (cleaned) skills.push(cleaned);
    }
  };

  let currentSection: SectionKind | null = null;
  let hasRecognizedSection = false;
  for (const line of lines) {
    const heading = matchSectionHeading(line);
    if (heading) {
      hasRecognizedSection = true;
      currentSection = heading.kind;
      if (heading.inlineValue) {
        if (currentSection === 'summary') summaryLines.push(heading.inlineValue);
        else if (currentSection === 'experience') workHighlights.push(stripBullet(heading.inlineValue));
        else if (currentSection === 'projects') projects.push(stripBullet(heading.inlineValue));
        else if (currentSection === 'education') education.push(stripBullet(heading.inlineValue));
        else if (currentSection === 'skills') pushSkillLine(heading.inlineValue);
        else if (currentSection === 'awards') awardsCertifications.push(stripBullet(heading.inlineValue));
      }
      continue;
    }
    if (!currentSection) continue;
    const cleaned = stripBullet(line);
    if (!cleaned) continue;
    if (currentSection === 'summary') summaryLines.push(cleaned);
    else if (currentSection === 'experience') workHighlights.push(cleaned);
    else if (currentSection === 'projects') projects.push(cleaned);
    else if (currentSection === 'education') education.push(cleaned);
    else if (currentSection === 'skills') pushSkillLine(cleaned);
    else if (currentSection === 'awards') awardsCertifications.push(cleaned);
  }

  if (!hasRecognizedSection) {
    for (const line of lines) {
      if (fullName && line === fullName) continue;
      if (headline && line === headline) continue;
      if (location && line === location) continue;
      if (isContactOrLinkLine(line)) continue;
      const cleaned = stripBullet(line);
      if (cleaned.length >= 12) workHighlights.push(cleaned);
    }
  }

  return normalizeResumeBuilderProfile({
    fullName,
    email,
    phone,
    location,
    links,
    headline,
    summary: summaryLines.join(' '),
    workHighlights,
    education,
    skills,
    projects,
    awardsCertifications,
  });
}

export function mergeResumeBuilderProfiles(
  primary?: ResumeBuilderProfile,
  fallback?: ResumeBuilderProfile
): ResumeBuilderProfile | undefined {
  const merged = normalizeResumeBuilderProfile({
    fullName: primary?.fullName || fallback?.fullName,
    email: primary?.email || fallback?.email,
    phone: primary?.phone || fallback?.phone,
    location: primary?.location || fallback?.location,
    links: [...(primary?.links ?? []), ...(fallback?.links ?? [])],
    headline: primary?.headline || fallback?.headline,
    summary: primary?.summary || fallback?.summary,
    workHighlights: [...(primary?.workHighlights ?? []), ...(fallback?.workHighlights ?? [])],
    education: [...(primary?.education ?? []), ...(fallback?.education ?? [])],
    skills: [...(primary?.skills ?? []), ...(fallback?.skills ?? [])],
    projects: [...(primary?.projects ?? []), ...(fallback?.projects ?? [])],
    awardsCertifications: [
      ...(primary?.awardsCertifications ?? []),
      ...(fallback?.awardsCertifications ?? []),
    ],
  });

  return merged;
}

export function formatContactDetails(profile?: ResumeBuilderProfile): string {
  if (!profile) return '';

  return [
    profile.email,
    profile.phone,
    profile.location,
    ...profile.links,
  ]
    .map((item) => cleanText(item, 120))
    .filter(Boolean)
    .join(' | ');
}
