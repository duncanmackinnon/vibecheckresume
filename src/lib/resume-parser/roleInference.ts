import type { ParsedResumeDocument, RoleSuggestion } from './types';
import { isContactOrLinkLine, isLinkLabelSegment, scoreRoleTitle } from './nlp/signals';

const TRAILING_CONTEXT_RE = /\s+(?:at|@)\s+.+$|\s*\([^)]*(?:remote|hybrid|contract|part-time|full-time|l\d+|e\d+|ic\d+)[^)]*\)$/gi;

/**
 * Strips company names, dates, and level tags while verifying the normalized string
 * is still a positive, legitimate role title (never a link label or raw skill list).
 */
export function normalizeRoleTitle(raw: string): string {
  const cleaned = raw
    .replace(TRAILING_CONTEXT_RE, '')
    .replace(/\s*[|•·]\s*.*$/, '')
    .replace(/\s*[-–—]\s*(?:remote|hybrid|on-?site)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || isLinkLabelSegment(cleaned) || isContactOrLinkLine(cleaned)) return '';
  return scoreRoleTitle(cleaned) >= 0.6 ? cleaned : '';
}

function dedupeRoles(candidates: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of candidates) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique.slice(0, 3);
}

function inferEarlyCareerRolesFromDomain(doc: ParsedResumeDocument): string[] {
  const corpus = [
    ...doc.education.map((e) => `${e.degree || ''} ${e.field || ''} ${e.institution}`),
    ...doc.projects.map((p) => `${p.name} ${p.technologies.join(' ')} ${p.bullets.join(' ')}`),
    doc.flatSkills.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  if (!corpus.trim()) return [];

  const roles: string[] = [];
  const hasFrontend = /\b(?:react|next\.js|nextjs|vue|angular|svelte|html|css|tailwind|figma|ui\/ux)\b/.test(corpus);
  const hasBackend = /\b(?:node\.?js|express|django|fastapi|spring|go|golang|rust|postgresql|postgres|sql|redis|graphql|rest api)\b/.test(corpus);
  const hasDataMl = /\b(?:pytorch|tensorflow|scikit-learn|pandas|numpy|machine learning|llm|nlp|sql|tableau|power\s*bi|spark)\b/.test(corpus);
  const hasDesign = /\b(?:figma|sketch|wireframe|prototyping|user research|usability|design system|ui\/ux)\b/.test(corpus);
  const hasFinance = /\b(?:financial modeling|valuation|dcf|bloomberg|accounting|gaap|audit|excel)\b/.test(corpus);
  const hasNursing = /\b(?:clinical rotation|patient care|rn|nursing|nclex|emr|ehr|triage)\b/.test(corpus);
  const hasCSDegree = /\b(?:computer science|software engineering|informatics|computer engineering)\b/.test(corpus);

  if (hasDesign) roles.push('Product Designer');
  if (hasDataMl && /\b(?:pytorch|tensorflow|machine learning|llm|nlp)\b/.test(corpus)) {
    roles.push('Machine Learning Engineer');
  } else if (hasDataMl) {
    roles.push('Data Analyst');
  }
  if (hasFrontend && hasBackend) roles.push('Full-Stack Developer');
  else if (hasFrontend) roles.push('Frontend Engineer');
  else if (hasBackend || hasCSDegree) roles.push('Software Engineer');
  if (hasFinance) roles.push('Financial Analyst');
  if (hasNursing) roles.push('Registered Nurse');

  return dedupeRoles(roles);
}

/**
 * Confidence-gated role inference for "Roles you are looking for".
 * Priority: verified header headline -> normalized Experience titles -> early-career domain role -> blank.
 */
export function inferSuggestedRoles(doc: ParsedResumeDocument): RoleSuggestion {
  const headlineRole = doc.headline ? normalizeRoleTitle(doc.headline) : '';
  const experienceRoles = dedupeRoles(
    doc.experience
      .map((entry) => normalizeRoleTitle(entry.title))
      .filter(Boolean),
  );

  if (headlineRole) {
    const merged = dedupeRoles([headlineRole, ...experienceRoles]);
    return {
      roles: merged,
      primaryRole: headlineRole,
      formatted: merged.join(', '),
      source: 'headline',
      confidence: 0.9,
    };
  }

  if (experienceRoles.length > 0) {
    return {
      roles: experienceRoles,
      primaryRole: experienceRoles[0],
      formatted: experienceRoles.join(', '),
      source: 'experience',
      confidence: 0.85,
    };
  }

  // Only infer early-career roles when student/project/education evidence exists without work titles
  if (doc.experience.length === 0 && (doc.education.length > 0 || doc.projects.length > 0)) {
    const inferred = inferEarlyCareerRolesFromDomain(doc);
    if (inferred.length > 0) {
      return {
        roles: inferred,
        primaryRole: inferred[0],
        formatted: inferred.join(', '),
        source: 'projects_education',
        confidence: 0.68,
      };
    }
  }

  return {
    roles: [],
    formatted: '',
    source: 'none',
    confidence: 0,
  };
}
