import type {
  DocumentSection,
  EducationEntry,
  ExperienceEntry,
  LayoutLine,
  ProjectEntry,
  SkillCategory,
  TypedLink,
} from './types';
import { normalizeWhitespace } from './adapters/utils';
import {
  analyzeLineSignals,
  EMAIL_RE,
  EXPLICIT_URL_RE,
  extractDateRange,
  HEADER_DOMAIN_RE,
  IGNORED_CODE_EXT_RE,
  isLikelyHumanName,
  isLinkLabelSegment,
  isLocationSegment,
  PHONE_RE,
  scoreOrgName,
  scoreRoleTitle,
} from './nlp/signals';
import { DEGREE_RE } from './nlp/gazetteers';
import { decodeBodySequence, tagHeaderLines } from './nlp/sequenceTagger';

function isNonUrlEmailOrPhoneMatch(value: string): boolean {
  return EMAIL_RE.test(value) || IGNORED_CODE_EXT_RE.test(value);
}

function collectPatternMatches(text: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return Array.from(text.matchAll(pattern))
    .filter((match) => {
      const index = match.index ?? 0;
      const before = text[index - 1];
      return before !== '@' && !/\w/.test(before || '');
    })
    .map((match) => match[0].replace(/[).,;]+$/, '').trim())
    .filter((match) => match.length > 0 && !isNonUrlEmailOrPhoneMatch(match));
}

function classifyLinkKind(url: string, label?: string): TypedLink['kind'] {
  const target = `${label || ''} ${url}`.toLowerCase();
  if (target.includes('github.com') || target.includes('github')) return 'github';
  if (target.includes('linkedin.com') || target.includes('linkedin')) return 'linkedin';
  if (url.toLowerCase().startsWith('mailto:')) return 'email';
  if (/portfolio|website|personal|\.dev\b|\.design\b|\.xyz\b|\.me\b/i.test(target)) return 'portfolio';
  return 'other';
}

function normalizeUrlKey(displayOrUrl: string): string {
  return displayOrUrl
    .toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?/, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function addTypedLink(
  bucket: TypedLink[],
  seenKeys: Set<string>,
  display: string,
  url: string,
  label?: string,
) {
  const cleanDisplay = display.replace(/\/$/, '').trim();
  const cleanUrl = url.trim();
  if (!cleanDisplay || !cleanUrl || /^mailto:/i.test(cleanUrl)) return;
  const key = normalizeUrlKey(cleanUrl);
  if (!key || seenKeys.has(key)) return;
  seenKeys.add(key);
  bucket.push({
    kind: classifyLinkKind(cleanUrl, label),
    ...(label ? { label } : {}),
    url: cleanUrl,
    display: cleanDisplay,
  });
}

export interface HeaderExtraction {
  fullName?: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: TypedLink[];
}

export function extractHeaderFields(
  headerSection: DocumentSection | undefined,
  bodySections: DocumentSection[],
): HeaderExtraction {
  const headerLines = headerSection?.lines ?? [];
  const tagged = tagHeaderLines(headerLines);

  const fullNameLine =
    tagged.find((t) => t.tag === 'NAME')?.line.text ||
    headerLines
      .slice(0, 6)
      .map((l) => l.leftText.trim())
      .find(isLikelyHumanName);

  const headerText = headerLines.map((l) => l.text).join('\n');
  const bodyTopText = bodySections
    .slice(0, 2)
    .flatMap((s) => s.lines.slice(0, 12).map((l) => l.text))
    .join('\n');

  let email =
    headerText.match(EMAIL_RE)?.[0] ||
    bodyTopText.match(EMAIL_RE)?.[0] ||
    undefined;

  // Recover mailto: annotations if email wasn't rendered in visible text
  if (!email) {
    for (const line of headerLines) {
      const mailLink = line.links.find((l) => /^mailto:/i.test(l.url));
      if (mailLink) {
        email = mailLink.url.replace(/^mailto:/i, '').trim() || undefined;
        break;
      }
    }
  }

  let phone =
    headerText.match(PHONE_RE)?.[0]?.trim() ||
    bodyTopText.match(PHONE_RE)?.[0]?.trim() ||
    undefined;

  if (!phone) {
    for (const line of headerLines) {
      const telLink = line.links.find((l) => /^tel:/i.test(l.url));
      if (telLink) {
        phone = telLink.url.replace(/^tel:/i, '').trim() || undefined;
        break;
      }
    }
  }

  // Location extraction strictly from header/contact lines
  let location: string | undefined;
  for (const line of headerLines) {
    const segments = [line.leftText, ...(line.rightText ? [line.rightText] : [])]
      .flatMap((part) => part.split(/\s*[|•·]\s*/))
      .map((seg) => seg.trim())
      .filter(Boolean);
    const foundLoc = segments.find((seg) => isLocationSegment(seg));
    if (foundLoc) {
      location = normalizeWhitespace(foundLoc).slice(0, 80);
      break;
    }
  }

  // Links extraction: attached hyperlink annotations first, then header explicit URLs & domains,
  // then body explicit URLs ONLY (never bare body domains like Knorket.AI or unstructured.io)
  const links: TypedLink[] = [];
  const seenKeys = new Set<string>();

  for (const line of headerLines) {
    for (const link of line.links) {
      if (/^mailto:|^tel:/i.test(link.url)) continue;
      const cleanDisp = link.url.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '');
      const visibleMatchesUrl = line.text.toLowerCase().includes(cleanDisp.toLowerCase());
      addTypedLink(links, seenKeys, visibleMatchesUrl ? cleanDisp : link.url, link.url, link.label);
    }
  }

  for (const match of collectPatternMatches(headerText, EXPLICIT_URL_RE)) {
    const fullUrl = /^https?:\/\//i.test(match) ? match : `https://${match}`;
    addTypedLink(links, seenKeys, match, fullUrl);
  }
  for (const match of collectPatternMatches(headerText, HEADER_DOMAIN_RE)) {
    const fullUrl = /^https?:\/\//i.test(match) ? match : `https://${match}`;
    addTypedLink(links, seenKeys, match, fullUrl);
  }
  for (const match of collectPatternMatches(bodyTopText, EXPLICIT_URL_RE)) {
    const fullUrl = /^https?:\/\//i.test(match) ? match : `https://${match}`;
    addTypedLink(links, seenKeys, match, fullUrl);
  }

  // Headline extraction strictly using validated HEADLINE tag + positive role gate
  const headlineCandidate = tagged.find(
    (entry) =>
      entry.tag === 'HEADLINE' &&
      (!fullNameLine || entry.line.text.toLowerCase() !== fullNameLine.toLowerCase()) &&
      (!location || entry.line.text.toLowerCase() !== location.toLowerCase()),
  );

  return {
    fullName: fullNameLine ? normalizeWhitespace(fullNameLine).slice(0, 80) : undefined,
    headline: headlineCandidate ? normalizeWhitespace(headlineCandidate.line.text).slice(0, 120) : undefined,
    email: email?.slice(0, 120),
    phone: phone?.slice(0, 60),
    location,
    links: links.slice(0, 8),
  };
}

function splitEntryHeaderParts(line: LayoutLine): {
  parts: string[];
  dateRange?: string;
  location?: string;
} {
  const { dateRange, remaining } = extractDateRange(line.text);
  const rawParts = (line.rightText
    ? [line.leftText, line.rightText]
    : remaining.split(/\s*[|•·]\s*/))
    .map((p) => extractDateRange(p).remaining.trim())
    .filter(Boolean);

  let location: string | undefined;
  const parts: string[] = [];
  for (const part of rawParts) {
    if (!location && isLocationSegment(part) && scoreRoleTitle(part) < 0.5 && scoreOrgName(part) < 0.7) {
      location = part;
    } else if (!isLinkLabelSegment(part)) {
      parts.push(part);
    }
  }
  return { parts, dateRange, location };
}

function splitRoleAndCompanyFromParts(parts: string[]): { title: string; company: string } {
  if (parts.length === 1) {
    const single = parts[0];
    const atMatch = single.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      return { title: atMatch[1].trim(), company: atMatch[2].trim() };
    }
    const commaMatch = single.match(/^([^,]+),\s*(.+)$/);
    if (commaMatch) {
      const a = commaMatch[1].trim();
      const b = commaMatch[2].trim();
      return scoreRoleTitle(a) >= scoreRoleTitle(b) ? { title: a, company: b } : { title: b, company: a };
    }
    return scoreRoleTitle(single) >= 0.6 ? { title: single, company: '' } : { title: '', company: single };
  }

  let bestTitle = '';
  let bestTitleScore = -Infinity;
  const companyParts: string[] = [];

  for (const part of parts) {
    const atMatch = part.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch && scoreRoleTitle(atMatch[1]) >= 0.6) {
      return { title: atMatch[1].trim(), company: atMatch[2].trim() };
    }
    const rScore = scoreRoleTitle(part);
    if (rScore > bestTitleScore && rScore >= 0.55) {
      if (bestTitle) companyParts.push(bestTitle);
      bestTitle = part;
      bestTitleScore = rScore;
    } else {
      companyParts.push(part);
    }
  }

  return {
    title: bestTitle,
    company: companyParts.join(' | ').trim(),
  };
}

export function extractExperienceEntries(section: DocumentSection | undefined): ExperienceEntry[] {
  if (!section?.lines.length) return [];
  const decoded = decodeBodySequence(section.lines, 'experience');
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;
  let activeCompany = '';

  const flushIfNonEmpty = () => {
    if (current && (current.title || current.company || current.bullets.length > 0)) {
      entries.push(current);
    }
    current = null;
  };

  for (const { line, state } of decoded) {
    if (state === 'BULLET') {
      if (!current) {
        current = {
          title: '',
          company: activeCompany,
          isCurrent: false,
          bullets: [],
        };
      }
      current.bullets.push(line.text);
      continue;
    }

    if (state === 'CONTINUATION') {
      if (current?.bullets.length) {
        current.bullets[current.bullets.length - 1] += ` ${line.text}`;
      }
      continue;
    }

    const { parts, dateRange, location } = splitEntryHeaderParts(line);
    const isCurrent = /present|current|now|ongoing/i.test(dateRange || '');

    if (state === 'COMBINED_HEADER') {
      flushIfNonEmpty();
      const { title, company } = splitRoleAndCompanyFromParts(parts);
      if (company) activeCompany = company;
      current = {
        title,
        company: company || activeCompany,
        ...(location ? { location } : {}),
        ...(dateRange ? { dateRange } : {}),
        isCurrent,
        bullets: [],
        rawHeader: line.text,
      };
      continue;
    }

    if (state === 'ORG_LINE') {
      const companyText = parts.join(' | ').trim();
      if (companyText) activeCompany = companyText;
      // Pair Role-above-Company when no bullets have been added yet
      if (current && !current.company && current.bullets.length === 0) {
        current.company = companyText;
        if (location && !current.location) current.location = location;
        if (dateRange && !current.dateRange) {
          current.dateRange = dateRange;
          current.isCurrent = isCurrent;
        }
        continue;
      }

      flushIfNonEmpty();
      current = {
        title: '',
        company: companyText,
        ...(location ? { location } : {}),
        ...(dateRange ? { dateRange } : {}),
        isCurrent,
        bullets: [],
        rawHeader: line.text,
      };
      continue;
    }

    if (state === 'ROLE_LINE') {
      const titleText = parts.join(' | ').trim() || line.leftText;
      // Pair Company-above-Role (Jake's LaTeX pattern) when no bullets have been added yet
      if (current && !current.title && current.bullets.length === 0) {
        current.title = titleText;
        if (location && !current.location) current.location = location;
        if (dateRange && !current.dateRange) {
          current.dateRange = dateRange;
          current.isCurrent = isCurrent;
        }
        continue;
      }

      flushIfNonEmpty();
      current = {
        title: titleText,
        company: activeCompany,
        ...(location ? { location } : {}),
        ...(dateRange ? { dateRange } : {}),
        isCurrent,
        bullets: [],
        rawHeader: line.text,
      };
    }
  }

  flushIfNonEmpty();
  return entries;
}

export function extractProjectEntries(section: DocumentSection | undefined): ProjectEntry[] {
  if (!section?.lines.length) return [];
  const decoded = decodeBodySequence(section.lines, 'projects');
  const entries: ProjectEntry[] = [];
  let current: ProjectEntry | null = null;

  for (const { line, state } of decoded) {
    if (state === 'BULLET') {
      if (!current) {
        current = { name: 'Project', technologies: [], links: [], bullets: [] };
        entries.push(current);
      }
      current.bullets.push(line.text);
      continue;
    }
    if (state === 'CONTINUATION') {
      if (current?.bullets.length) {
        current.bullets[current.bullets.length - 1] += ` ${line.text}`;
      }
      continue;
    }

    const { dateRange, remaining } = extractDateRange(line.text);
    const segments = (line.rightText
      ? [line.leftText, line.rightText]
      : remaining.split(/\s*[|•·]\s*/))
      .map((s) => extractDateRange(s).remaining.trim())
      .filter((s) => Boolean(s) && !isLinkLabelSegment(s));

    const name = segments[0] || remaining || line.leftText;
    const technologies = segments
      .slice(1)
      .flatMap((seg) => seg.split(/\s*,\s*/))
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && s.length <= 40);
    const links = line.links.map((l) => l.url);

    current = {
      name,
      technologies,
      links,
      ...(dateRange ? { dateRange } : {}),
      bullets: [],
    };
    entries.push(current);
  }

  return entries;
}

export function extractEducationEntries(section: DocumentSection | undefined): {
  entries: EducationEntry[];
  rawLines: string[];
} {
  if (!section?.lines.length) return { entries: [], rawLines: [] };
  const rawLines = section.lines.map((l) => l.text).filter(Boolean);
  const entries: EducationEntry[] = [];
  let current: EducationEntry | null = null;

  for (const line of section.lines) {
    if (line.hasBullet) {
      if (current) current.details.push(line.text);
      continue;
    }
    const { dateRange, remaining } = extractDateRange(line.text);
    const gpaMatch = remaining.match(/gpa\s*:?\s*([\d.]+(?:\s*\/\s*[\d.]+)?)/i);
    const cleanText = remaining.replace(/gpa\s*:?\s*[\d.]+(?:\s*\/\s*[\d.]+)?/i, '').replace(/[|,;\s]+$/, '').trim();
    const hasDeg = DEGREE_RE.test(cleanText);
    const sig = analyzeLineSignals(cleanText);

    if (hasDeg && current && !current.degree && current.institution) {
      current.degree = cleanText;
      if (dateRange && !current.graduationDate) current.graduationDate = dateRange;
      if (gpaMatch && !current.gpa) current.gpa = gpaMatch[1];
      continue;
    }

    if (sig.isLocation && current && !current.location) {
      current.location = cleanText;
      if (dateRange && !current.graduationDate) current.graduationDate = dateRange;
      continue;
    }

    if (gpaMatch && current && !cleanText) {
      current.gpa = gpaMatch[1];
      continue;
    }

    const parts = cleanText.split(/\s*[|•·]\s*|\s+,\s+/).map((p) => p.trim()).filter(Boolean);
    const inst = parts.find((p) => !DEGREE_RE.test(p) && !isLocationSegment(p)) || '';
    const deg = parts.find((p) => DEGREE_RE.test(p)) || (hasDeg ? cleanText : undefined);

    current = {
      institution: inst || cleanText,
      ...(deg ? { degree: deg } : {}),
      ...(dateRange ? { graduationDate: dateRange } : {}),
      ...(gpaMatch ? { gpa: gpaMatch[1] } : {}),
      details: [],
    };
    entries.push(current);
  }

  return { entries, rawLines };
}

export function extractSkillCategories(sections: DocumentSection[]): {
  categories: SkillCategory[];
  flatSkills: string[];
} {
  const categories: SkillCategory[] = [];
  const flatSkills: string[] = [];
  const seen = new Set<string>();

  const pushSkill = (target: string[], raw: string) => {
    const clean = normalizeWhitespace(raw).slice(0, 60);
    if (!clean || clean.length < 1) return;
    target.push(clean);
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      flatSkills.push(clean);
    }
  };

  for (const sec of sections) {
    if (sec.kind !== 'skills') continue;
    for (const line of sec.lines) {
      const colonMatch = line.text.match(/^([^:]{2,34}):\s*(.+)$/);
      if (colonMatch) {
        const category = normalizeWhitespace(colonMatch[1]);
        const items: string[] = [];
        for (const token of colonMatch[2].split(/[,;|•]/)) {
          pushSkill(items, token);
        }
        if (items.length) categories.push({ category, items });
      } else {
        const items: string[] = [];
        for (const token of line.text.split(/[,;|•]/)) {
          pushSkill(items, token);
        }
        if (items.length) {
          const existing = categories.find((c) => c.category === 'Skills');
          if (existing) existing.items.push(...items);
          else categories.push({ category: 'Skills', items });
        }
      }
    }
  }

  return { categories, flatSkills: flatSkills.slice(0, 40) };
}
