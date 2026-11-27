import { parseTextResume, toResumeBuilderProfile } from '@/lib/resume-parser';
import type { RoleSuggestion } from '@/lib/resume-parser/types';
import type { ResumeBuilderProfile } from '../types';

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
      profile.awardsCertifications.length,
  );

  return hasContent ? profile : undefined;
}

export function extractResumeBuilderProfileFromText(resumeText: string): ResumeBuilderProfile | undefined {
  const normalized = resumeText.replace(/\r\n/g, '\n').replace(/\0/g, '').trim();
  if (!normalized) return undefined;
  const parsed = parseTextResume(normalized);
  return normalizeResumeBuilderProfile(toResumeBuilderProfile(parsed));
}

export function extractSuggestedRolesFromText(resumeText: string): RoleSuggestion {
  const normalized = resumeText.replace(/\r\n/g, '\n').replace(/\0/g, '').trim();
  if (!normalized) return { roles: [], formatted: '', source: 'none', confidence: 0 };
  return parseTextResume(normalized).suggestedRoles;
}

export function mergeResumeBuilderProfiles(
  primary?: ResumeBuilderProfile,
  fallback?: ResumeBuilderProfile,
): ResumeBuilderProfile | undefined {
  return normalizeResumeBuilderProfile({
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
}

export function formatContactDetails(profile?: ResumeBuilderProfile): string {
  if (!profile) return '';

  return [profile.email, profile.phone, profile.location, ...profile.links]
    .map((item) => cleanText(item, 120))
    .filter(Boolean)
    .join(' | ');
}
