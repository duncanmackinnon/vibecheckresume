import nlp from 'compromise';
import {
  ACTION_VERBS,
  DEGREE_RE,
  LINK_ANCHOR_LABELS,
  META_NOTE_RE,
  NON_LOCATION_TECH_RE,
  ORG_SUFFIX_RE,
  ROLE_FRAME_PATTERNS,
  ROLE_HEAD_NOUNS,
  ROLE_MODIFIERS,
  SOFT_ORG_SUFFIX_RE,
  WELL_KNOWN_ORGS,
} from './gazetteers';

const GEO_PHRASE_RE =
  /^(?:united\s+states|new\s+york|san\s+francisco|los\s+angeles|san\s+diego|san\s+jose|las\s+vegas|new\s+jersey|new\s+mexico|north\s+carolina|south\s+carolina|british\s+columbia|nova\s+scotia|hong\s+kong|united\s+kingdom|new\s+zealand)$/i;

export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
export const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
export const EXPLICIT_URL_RE =
  /\b(?:https?:\/\/[^\s|,;<>()]+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\/[^\s|,;<>()]*|linkedin\.com\/in\/[^\s|,;<>()]+|github\.com\/[^\s|,;<>()]+)/gi;
export const HEADER_DOMAIN_RE =
  /\b(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|edu|gov|dev|app|xyz|me|ca|uk|de|io|co|ai|tech|site|design)(?:\/[^\s|,;<>()]*)?/gi;
export const IGNORED_CODE_EXT_RE =
  /\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rb|rs|c|cpp|h|java|json|ya?ml|toml|md|txt|pdf|docx|rtf|tex|css|html|xml|sql|sh|csv|png|jpg|jpeg|svg|webp)$/i;

const MONTH_NAME =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_POINT = `(?:${MONTH_NAME}\\.?\\s+(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])\\/(?:19|20)\\d{2}|(?:19|20)\\d{2})`;
const DATE_END = `(?:${DATE_POINT}|present|current|now|ongoing|expected\\s+${DATE_POINT})`;
export const DATE_RANGE_RE = new RegExp(
  `(${DATE_POINT}(?:\\s*[-–—to/]+\\s*${DATE_END})?)`,
  'i',
);

export const SECTION_HEADING_VOCAB_RE =
  /^(?:(?:professional|executive|career|personal)\s+)?(?:summary|profile|objective|about(?:\s+me)?)|(?:(?:professional|work|relevant|industry|clinical|research|teaching|career)\s+)?(?:experience|history|employment(?:\s+history)?)|(?:selected|technical|key|personal|academic|open[- ]source)?\s*projects?|(?:academic\s+)?(?:education|academics|education\s*(?:&|and)\s*training)|(?:(?:technical|core|key)\s+)?(?:skills|competencies|technologies|toolkit)|tools\s*(?:&|and)\s*technologies|(?:licenses?\s*(?:&|and)\s*)?certifications?(?:\s*(?:&|and)\s*licenses?)?|credentials|awards?(?:\s*(?:&|and)\s*(?:honors?|certifications?))?|honors?(?:\s*(?:&|and)\s*awards?)?|publications?|volunteer(?:ing)?(?:\s+experience)?|community\s+leadership|leadership(?:\s+experience)?$/i;

export function extractDateRange(text: string): { dateRange?: string; remaining: string } {
  const match = text.match(DATE_RANGE_RE);
  if (!match || !match[1]) return { remaining: text.trim() };
  const dateRange = match[1].replace(/\s*[–—]\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  const remaining = text
    .replace(match[1], ' ')
    .replace(/\s*[|•·]\s*$/g, '')
    .replace(/^\s*[|•·]\s*/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[,\s-]+$/g, '')
    .trim();
  return { dateRange, remaining };
}

export function cleanAnchorLabel(token: string): string {
  return token
    .replace(/^[-•·|:\s]+|[-•·|:\s]+$/g, '')
    .replace(/^(?:my|view)\s+/i, '')
    .replace(/:\s*$/, '')
    .toLowerCase()
    .trim();
}

export function isLinkLabelSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return true;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return true;
  if (/^(?:https?:\/\/|mailto:|tel:|www\.|linkedin\.com|github\.com)/i.test(trimmed)) return true;
  if (/^@[a-z0-9_.-]{2,}$/i.test(trimmed)) return true;
  if (/\([a-z0-9:/._-]+\.[a-z]{2,}\S*\)/i.test(trimmed)) {
    const labelPart = trimmed.replace(/\([^)]*\)/g, '').trim();
    if (!labelPart || LINK_ANCHOR_LABELS.has(cleanAnchorLabel(labelPart))) return true;
  }

  const label = cleanAnchorLabel(trimmed);
  if (LINK_ANCHOR_LABELS.has(label)) return true;

  // Patterns like "GitHub: @user" or "LinkedIn /in/user" or "Email: ..."
  const colonPrefix = label.split(/[:/]/)[0]?.trim();
  if (colonPrefix && LINK_ANCHOR_LABELS.has(colonPrefix)) return true;

  HEADER_DOMAIN_RE.lastIndex = 0;
  const doms = trimmed.match(HEADER_DOMAIN_RE);
  if (doms && doms.some((d) => !IGNORED_CODE_EXT_RE.test(d)) && trimmed.split(/\s+/).length <= 3) {
    return true;
  }
  return false;
}

export function isContactOrLinkLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return true;
  if (/https?:\/\/|mailto:|www\.|linkedin\.com\/|github\.com\//i.test(trimmed)) {
    const parts = trimmed.split(/\s*[|•·,;]\s*/).filter(Boolean);
    if (parts.every((part) => isLinkLabelSegment(part))) return true;
    // Even if only a label prefix + url: treat short contact lines as contact
    if (trimmed.split(/\s+/).length <= 14) return true;
  }

  const segments = trimmed
    .split(/\s*[|•·]\s*|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length >= 1 && segments.every((seg) => isLinkLabelSegment(seg))) {
    return true;
  }

  return false;
}

export function isLocationSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed || trimmed.length > 48) return false;
  if (/@|https?:|www\.|linkedin|github|\d{3}/i.test(trimmed)) return false;
  if (isLinkLabelSegment(trimmed) || NON_LOCATION_TECH_RE.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 5) return false;

  if (/^(?:remote|hybrid|on-?site|open\s+to\s+relocat(?:e|ion))(?:\s*\([^)]{1,30}\))?$/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Z][A-Za-z .'-]+,\s*(?:[A-Z]{2,3}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/.test(trimmed)) {
    return true;
  }
  if (/Greater\s+[A-Z][A-Za-z .'-]+(?:\s+Area)?$/.test(trimmed)) {
    return true;
  }
  if (GEO_PHRASE_RE.test(trimmed)) {
    return true;
  }
  const doc = nlp(trimmed);
  if (
    !doc.has('#Person') &&
    (doc.has('#City') || doc.has('#Country')) &&
    trimmed.split(/\s+/).length <= 3 &&
    !ROLE_HEAD_NOUNS.has(trimmed.toLowerCase())
  ) {
    return true;
  }
  return false;
}

export function hasActionVerbLead(text: string): boolean {
  const cleaned = text.trim().replace(/^[-*•▪◦‣●∙]+\s*/, '');
  const firstWordMatch = cleaned.match(/^([A-Za-z'-]+)/);
  if (!firstWordMatch) return false;
  const firstLower = firstWordMatch[1].toLowerCase();
  if (ACTION_VERBS.has(firstLower)) return true;

  // Lowercase the first word for compromise so sentence-initial capitalization doesn't force #ProperNoun
  const probe = `${firstLower}${cleaned.slice(firstWordMatch[1].length)}`;
  const firstTerm = nlp(probe).terms(0);
  if (firstTerm.has('#PastTense') || firstTerm.has('#Gerund')) return true;
  return false;
}

export function scoreOrgName(raw: string): number {
  const text = extractDateRange(raw).remaining.replace(/[|,;]+$/, '').trim();
  if (!text || text.length > 90) return -1;
  if (isContactOrLinkLine(text) || isLinkLabelSegment(text) || hasActionVerbLead(text)) return -1;
  if (/[.!?]$/.test(text) && !/\b(?:inc|corp|ltd|llc|co)\.$/i.test(text)) return -0.6;

  const lower = text.toLowerCase();
  const roleScore = scoreRoleTitle(text);
  if (WELL_KNOWN_ORGS.has(lower)) return 0.95;
  if (ORG_SUFFIX_RE.test(text) && roleScore < 0.6) return 0.9;
  if (SOFT_ORG_SUFFIX_RE.test(text) && roleScore < 0.6) return 0.85;

  // Check if compromise recognizes an Organization
  const doc = nlp(text);
  const hasOrgTag = doc.has('#Organization');
  const words = text.split(/\s+/).filter(Boolean);

  if (hasOrgTag && roleScore < 0.5) return 0.78;
  if (words.length >= 1 && words.length <= 5 && roleScore < 0.35 && /^[A-Z]/.test(words[0])) {
    if (!isLocationSegment(text) && !DEGREE_RE.test(text)) {
      return 0.45;
    }
  }
  return -0.2;
}

/**
 * Positive + negative scoring for whether a short string represents an actual job/role title.
 */
export function scoreRoleTitle(raw: string): number {
  const { remaining } = extractDateRange(raw);
  const text = remaining.replace(/^[-*•▪◦]+\s*/, '').replace(/[|,;]+$/, '').trim();
  if (!text || text.length > 95) return -1;

  // Hard negative gates
  if (EMAIL_RE.test(text) || PHONE_RE.test(text) || /https?:|www\./i.test(text)) return -1;
  if (SECTION_HEADING_VOCAB_RE.test(text)) return -1;
  if (META_NOTE_RE.test(text) || DEGREE_RE.test(text)) return -1;
  if (isContactOrLinkLine(text)) return -1;

  const pipeParts = text.split(/\s*[|•·]\s*/).filter(Boolean);
  if (pipeParts.some((part) => isLinkLabelSegment(part))) return -1;
  if (pipeParts.length > 2) return -0.8;

  if (/[.!?]$/.test(text)) return -0.8;
  if (hasActionVerbLead(text)) return -0.85;
  if (WELL_KNOWN_ORGS.has(text.toLowerCase()) || /\b(?:inc\.?|llc|ltd\.?|corp\.?|corporation|gmbh|plc|llp)\b/i.test(text)) {
    return -0.7;
  }

  // Reject pure comma-separated technical keyword lists like "React, TypeScript, Node.js, AWS"
  const commaParts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 3) return -0.75;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 10) return -0.8;

  const strippedForMatch = text
    .replace(/\((?:l\d+|e\d+|ic\d+|level\s*\d+|remote|hybrid|contract|part-time|full-time)\)/gi, '')
    .trim();

  if (ROLE_FRAME_PATTERNS.some((pattern) => pattern.test(strippedForMatch))) {
    return 0.92;
  }

  const normalizedTokens = strippedForMatch
    .toLowerCase()
    .replace(/\b(?:i|ii|iii|iv|v|1|2|3|4|5)\b/g, ' ')
    .split(/[\s/,&-]+/)
    .map((t) => t.replace(/^[^a-z]+|[^a-z]+$/g, ''))
    .filter(Boolean);

  if (!normalizedTokens.length) return -0.5;

  let headCount = 0;
  let modCount = 0;
  for (const tok of normalizedTokens) {
    if (ROLE_HEAD_NOUNS.has(tok)) headCount += 1;
    else if (ROLE_MODIFIERS.has(tok)) modCount += 1;
  }

  if (headCount === 0 && ORG_SUFFIX_RE.test(text)) {
    return -0.7;
  }

  // Handle "Senior Backend Software Engineer" or "Clinical Research Coordinator" or "Registered Nurse"
  if (headCount >= 1) {
    const coverage = (headCount + modCount) / normalizedTokens.length;
    if (coverage >= 0.5) return 0.92;
    if (words.length <= 6) return 0.8;
    return 0.65;
  }

  // Two strong modifiers without standard noun? (e.g. "UI/UX", "DevOps"): weak unless coupled with noun
  if (modCount >= 2 && normalizedTokens.length <= 3) {
    return 0.45;
  }

  return 0.1;
}

export function isLikelyHumanName(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 56) return false;
  if (/[0-9@|/\\]/.test(trimmed)) return false;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return false;
  if (isLinkLabelSegment(trimmed) || isContactOrLinkLine(trimmed)) return false;
  if (SECTION_HEADING_VOCAB_RE.test(trimmed) || META_NOTE_RE.test(trimmed) || DEGREE_RE.test(trimmed)) return false;
  if (ORG_SUFFIX_RE.test(trimmed) || WELL_KNOWN_ORGS.has(trimmed.toLowerCase())) return false;
  if (scoreRoleTitle(trimmed) >= 0.65) return false;
  if (isLocationSegment(trimmed)) return false;

  const cleanNoCreds = trimmed.replace(/,\s*(?:ph\.?d\.?|m\.?d\.?|j\.?d\.?|m\.?b\.?a\.?|cpa|pe|pmp|rn|jr\.?|sr\.?|iii?)$/i, '').trim();
  const words = cleanNoCreds.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  const validWordPattern = /^[A-Z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.-]*$/;
  if (!words.every((w) => validWordPattern.test(w))) return false;
  if (GEO_PHRASE_RE.test(cleanNoCreds)) return false;

  const doc = nlp(cleanNoCreds);
  if (doc.has('#Organization') && !doc.has('#Person')) return false;

  return true;
}

export interface LineSignals {
  hasEmail: boolean;
  hasPhone: boolean;
  isContactOrLink: boolean;
  isLocation: boolean;
  hasDate: boolean;
  dateRange?: string;
  hasDegree: boolean;
  hasActionVerb: boolean;
  orgScore: number;
  roleScore: number;
  personLikelihood: boolean;
  headingScore: number;
}

export function analyzeLineSignals(lineText: string, leftText?: string): LineSignals {
  const probe = (leftText || lineText).trim();
  const { dateRange } = extractDateRange(lineText);
  const orgScore = scoreOrgName(probe);
  const roleScore = scoreRoleTitle(probe);

  let headingScore = 0;
  const normalizedHeading = probe.replace(/[:\s]+$/, '');
  if (SECTION_HEADING_VOCAB_RE.test(normalizedHeading)) {
    headingScore = 0.95;
  } else if (
    normalizedHeading.length <= 42 &&
    normalizedHeading.split(/\s+/).length <= 5 &&
    !/[.!?]$/.test(normalizedHeading) &&
    !dateRange &&
    !hasActionVerbLead(normalizedHeading) &&
    !isContactOrLinkLine(normalizedHeading) &&
    normalizedHeading === normalizedHeading.toUpperCase() &&
    /[A-Z]{3}/.test(normalizedHeading)
  ) {
    headingScore = 0.72;
  }

  return {
    hasEmail: EMAIL_RE.test(lineText),
    hasPhone: PHONE_RE.test(lineText),
    isContactOrLink: isContactOrLinkLine(lineText),
    isLocation: isLocationSegment(probe),
    hasDate: Boolean(dateRange),
    dateRange,
    hasDegree: DEGREE_RE.test(lineText),
    hasActionVerb: hasActionVerbLead(lineText),
    orgScore,
    roleScore,
    personLikelihood: isLikelyHumanName(probe),
    headingScore,
  };
}
