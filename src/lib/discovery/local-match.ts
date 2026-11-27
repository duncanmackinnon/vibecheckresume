/**
 * Pure, dependency-free matching helpers shared by the job search API and the browser.
 * No network, no AI: simple keyword overlap that is easy to reason about.
 */
export interface FoundJob {
  id: string;
  source: 'Remotive' | 'Remote OK' | 'Arbeitnow' | 'Jobicy' | 'Himalayas';
  company: string;
  role: string;
  location: string;
  remote: boolean;
  jobType: string;
  compensation: string;
  description: string;
  url: string;
  postedAt: string;
  tags: string[];
}

export interface SearchCriteria {
  roles: string;
  locations: string;
  workModes: string[];
  employmentTypes: string[];
}

const STOPWORDS = new Set(`a an and are as at be but by can do for from get have help i if in into is it its like love make me my of on or our role roles position positions job jobs
  work working small team teams that the their then there these they this to want we where which who will with would you your looking interested find new next
  company companies where anywhere remote hybrid onsite site opportunity opportunities things thing feel simple complex someone something kind sort types type level levels senior junior`.split(/\s+/).filter(Boolean));

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.\-]*[a-z0-9+#]|[a-z0-9]/g) || []).map(token => token.replace(/\.+$/, ''));
}

/** Distinct, meaningful search words from free-text role preferences (e.g. "Product design roles on a small team"). */
export function roleKeywords(roles: string): string[] {
  const seen = new Set<string>();
  for (const token of tokenize(roles)) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    seen.add(token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token);
  }
  return [...seen].slice(0, 12);
}

export function rolePhrases(roles: string): string[] {
  return roles.toLowerCase().split(/[,;\n]| or | and /).map(part => part.replace(/\b(roles?|positions?|jobs?)\b/g, '').trim()).filter(part => part.length >= 3 && part.split(/\s+/).length <= 5);
}

function stem(token: string) { return token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token; }

/** 0-100 role relevance of a job to the stated roles; 0 means not relevant. */
export function roleRelevance(job: Pick<FoundJob, 'role' | 'tags' | 'description'>, roles: string): number {
  const title = new Set(tokenize(job.role).map(stem));
  const tags = new Set(job.tags.flatMap(tag => tokenize(tag)).map(stem));
  const body = new Set(tokenize(job.description.slice(0, 4000)).map(stem));
  const coverage = (keywords: string[]) => {
    let total = 0;
    for (const keyword of keywords) total += title.has(keyword) ? 1 : tags.has(keyword) ? 0.7 : body.has(keyword) ? 0.35 : 0;
    return (total / keywords.length) * 100;
  };
  // Comma-separated titles are alternatives ("product designer, ux researcher"): the best one wins.
  const alternatives = rolePhrases(roles).map(phrase => ({ phrase, keywords: roleKeywords(phrase) })).filter(item => item.keywords.length);
  const lowerTitle = job.role.toLowerCase();
  let score = 0;
  if (alternatives.length) {
    for (const { phrase, keywords } of alternatives) {
      const value = coverage(keywords) + (lowerTitle.includes(phrase) ? 25 : 0);
      if (value > score) score = value;
    }
  } else {
    const keywords = roleKeywords(roles);
    if (!keywords.length) return 50;
    score = coverage(keywords);
  }
  return Math.round(Math.min(100, score));
}

const REGION_GROUPS: { triggers: string[]; matches: string[] }[] = [
  {
    triggers: ['toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'edmonton', 'waterloo', 'ontario', 'quebec', 'british columbia', 'alberta', 'canada'],
    matches: ['canada', 'north america', 'americas'],
  },
  {
    triggers: ['new york', 'nyc', 'san francisco', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'denver', 'atlanta', 'california', 'texas', 'washington', 'usa', 'u.s.', 'us', 'united states', 'america'],
    matches: ['united states', 'usa', 'u.s.', 'us', 'north america', 'americas'],
  },
  {
    triggers: ['london', 'manchester', 'edinburgh', 'bristol', 'uk', 'u.k.', 'united kingdom', 'england', 'scotland', 'britain', 'great britain'],
    matches: ['united kingdom', 'uk', 'u.k.', 'europe', 'emea'],
  },
  {
    triggers: ['berlin', 'munich', 'hamburg', 'frankfurt', 'germany', 'paris', 'france', 'amsterdam', 'netherlands', 'dublin', 'ireland', 'madrid', 'barcelona', 'spain', 'lisbon', 'portugal', 'stockholm', 'sweden', 'warsaw', 'poland', 'prague', 'zurich', 'switzerland', 'milan', 'italy', 'europe', 'eu', 'emea'],
    matches: ['europe', 'eu', 'emea'],
  },
  {
    triggers: ['sydney', 'melbourne', 'brisbane', 'australia', 'auckland', 'new zealand', 'apac'],
    matches: ['australia', 'new zealand', 'apac', 'oceania'],
  },
];

function containsTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  if (term.length <= 2) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(haystack);
  }
  return haystack.includes(term);
}

function isUnrestrictedRemote(place: string): boolean {
  const clean = place.trim().toLowerCase();
  return !clean || /^(?:anywhere(?:\s+in\s+the\s+world)?|worldwide|global|remote(?:\s+job)?|remote\s*[-–]\s*anywhere|earth)$/.test(clean);
}

export function matchesLocation(job: Pick<FoundJob, 'location' | 'remote'>, locations: string, workModes: string[]): { ok: boolean; boost: number } {
  const lowerLocations = locations.toLowerCase();
  const wanted = lowerLocations
    .split(/[,;\n]/)
    .map(part => part.trim())
    .filter(part => part && part !== 'remote' && !/^(anywhere|any|open|worldwide|global)$/.test(part));
  const anywhereRemote = /\b(remote|anywhere|worldwide|global)\b/.test(lowerLocations);
  const place = job.location.toLowerCase();
  const wantsRemote = !workModes.length || workModes.includes('remote') || anywhereRemote;

  if (wanted.length > 0) {
    const firstCity = place.split(',')[0].trim();
    const placeDirectMatch = wanted.some(
      part => containsTerm(place, part) || (firstCity.length >= 3 && containsTerm(part, firstCity)),
    );
    if (placeDirectMatch) return { ok: true, boost: 20 };

    const regionMatch = wanted.some(part =>
      REGION_GROUPS.some(
        group => group.triggers.some(trigger => containsTerm(part, trigger)) && group.matches.some(candidate => containsTerm(place, candidate)),
      ),
    );
    if (regionMatch) return { ok: true, boost: 10 };

    if (job.remote && wantsRemote && isUnrestrictedRemote(place)) return { ok: true, boost: 5 };
    return { ok: false, boost: 0 };
  }

  if (job.remote) return { ok: wantsRemote, boost: 5 };
  return { ok: !workModes.length || workModes.includes('onsite') || workModes.includes('hybrid'), boost: 0 };
}

export interface ResumeFit { score: number; matched: string[]; missing: string[] }

const FIT_NOISE = new Set(`about ability able across also work working experience years year team teams strong skills skill including ensure environment responsibilities requirements required preferred plus
  company role job join looking candidate candidates help build building will must should within using use used good great excellent knowledge understanding etc such well other more new
  our you your we they their are have has been being from into over than that this with and for the not who what when where which while other able part full time remote benefits salary apply`.split(/\s+/));

/** How much of what the posting emphasises shows up in the resume. Transparent and free, not a hiring prediction. */
export function resumeFit(resumeText: string, job: Pick<FoundJob, 'role' | 'tags' | 'description'>): ResumeFit {
  const resumeTokens = new Set(tokenize(resumeText).map(stem));
  const counts = new Map<string, number>();
  const add = (token: string, weight: number) => { counts.set(token, (counts.get(token) || 0) + weight); };
  for (const token of tokenize(job.role)) add(stem(token), 4);
  for (const tag of job.tags) for (const token of tokenize(tag)) add(stem(token), 3);
  for (const token of tokenize(job.description.slice(0, 5000))) add(stem(token), 1);
  const ranked = [...counts.entries()].filter(([token]) => token.length >= 3 && !FIT_NOISE.has(token) && !STOPWORDS.has(token) && !/^\d+$/.test(token))
    .sort((a, b) => b[1] - a[1]).slice(0, 24);
  if (!ranked.length) return { score: 0, matched: [], missing: [] };
  const matched = ranked.filter(([token]) => resumeTokens.has(token)).map(([token]) => token);
  const missing = ranked.filter(([token]) => !resumeTokens.has(token)).map(([token]) => token);
  const weight = (list: string[]) => list.reduce((sum, token) => sum + (counts.get(token) || 0), 0);
  const total = weight(matched) + weight(missing);
  return { score: total ? Math.round((weight(matched) / total) * 100) : 0, matched: matched.slice(0, 8), missing: missing.slice(0, 8) };
}
