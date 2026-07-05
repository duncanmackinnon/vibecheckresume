import type { ResumeBuilderProfile } from '../types';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const URL_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[^\s|,;]+|github\.com\/[^\s|,;]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s|,;]*)?)/gi;

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

function extractLinks(text: string): string[] {
  const matches = Array.from(text.matchAll(URL_PATTERN))
    .filter((match) => {
      const index = match.index ?? 0;
      return text[index - 1] !== '@';
    })
    .map((match) => match[0]);
  const seen = new Set<string>();
  return matches
    .map((match) => match.replace(/[).,;]+$/, '').trim())
    .filter((match) => !EMAIL_PATTERN.test(match))
    .filter((match) => {
      const key = match.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function extractLocation(lines: string[]): string {
  const topLines = lines.slice(0, 12);
  const locationLine = topLines.find((line) => {
    if (line.length > 80 || /@|https?:|linkedin|github|\d{3}/i.test(line)) return false;
    return /\b(remote|[A-Z][a-z]+,\s*[A-Z]{2}|[A-Z][a-z]+,\s*[A-Z][a-z]+)\b/.test(line);
  });

  return cleanText(locationLine, 80);
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

  const topText = lines.slice(0, 20).join(' ');
  const fullText = lines.join(' ');
  const email = topText.match(EMAIL_PATTERN)?.[0] ?? fullText.match(EMAIL_PATTERN)?.[0] ?? '';
  const phone = topText.match(PHONE_PATTERN)?.[0] ?? fullText.match(PHONE_PATTERN)?.[0] ?? '';
  const fullName = lines.slice(0, 8).find(isLikelyName) ?? '';
  const links = extractLinks(topText || fullText);
  const location = extractLocation(lines);

  return normalizeResumeBuilderProfile({
    fullName,
    email,
    phone,
    location,
    links,
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
