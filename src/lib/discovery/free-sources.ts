import { matchesLocation, roleKeywords, rolePhrases, roleRelevance, type FoundJob, type SearchCriteria } from './local-match';

/**
 * Free, keyless public job feeds. Each provider asks for attribution and a link back to the
 * original posting, which the UI shows on every result. Responses are cached so we stay a
 * polite client (these feeds are refreshed by their owners every few hours).
 */
const CACHE_MS = 45 * 60_000;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_DESCRIPTION = 6_000;
const MIN_RELEVANCE = 55;
const FALLBACK_RELEVANCE = 35;
const cache = new Map<string, { at: number; jobs: FoundJob[] }>();
const inflight = new Map<string, Promise<FoundJob[]>>();

export interface SourceStatus { name: string; url: string; ok: boolean; count: number; error?: string }

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
  '&rsquo;': '’', '&lsquo;': '‘', '&ndash;': '–', '&mdash;': '—', '&hellip;': '...',
};

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol)\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp|rsquo|lsquo|ndash|mdash|hellip);/g, entity => HTML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code) => { try { return String.fromCodePoint(Number(code)); } catch { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ' '; } })
    .replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_DESCRIPTION);
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json', 'User-Agent': 'VibeCheck-Resume/1.0 (personal job search tool)' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const safeUrl = (value: unknown) => { const text = str(value); return /^https?:\/\//i.test(text) ? text : ''; };
function iso(value: unknown) { const date = typeof value === 'number' ? new Date(value * 1000) : new Date(str(value)); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); }
function money(min?: unknown, max?: unknown, currency = '$') {
  const low = Number(min), high = Number(max);
  if (low > 0 && high > 0) return `${currency}${Math.round(low / 1000)}k – ${currency}${Math.round(high / 1000)}k`;
  return low > 0 ? `From ${currency}${Math.round(low / 1000)}k` : '';
}

interface ProviderDef {
  name: FoundJob['source'];
  url: string;
  cacheKey: (criteria: SearchCriteria) => string;
  load: (criteria: SearchCriteria) => Promise<FoundJob[]>;
}

function primaryTerm(criteria: SearchCriteria): string {
  return rolePhrases(criteria.roles)[0] || roleKeywords(criteria.roles)[0] || '';
}

function primaryKeyword(criteria: SearchCriteria): string {
  return roleKeywords(criteria.roles)[0] || '';
}

const providers: ProviderDef[] = [
  {
    name: 'Remotive', url: 'https://remotive.com',
    cacheKey: criteria => primaryTerm(criteria).toLowerCase(),
    async load(criteria) {
      const term = primaryTerm(criteria);
      const url = term
        ? `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}`
        : 'https://remotive.com/api/remote-jobs';
      const data = await getJson(url);
      return (Array.isArray(data?.jobs) ? data.jobs : []).map((job: any): FoundJob => ({
        id: `remotive-${job.id}`, source: 'Remotive', company: str(job.company_name), role: str(job.title),
        location: str(job.candidate_required_location) || 'Remote', remote: true, jobType: str(job.job_type).replace(/_/g, '-'),
        compensation: str(job.salary), description: htmlToText(str(job.description)), url: safeUrl(job.url),
        postedAt: iso(job.publication_date), tags: [str(job.category), ...(Array.isArray(job.tags) ? job.tags.map(str) : [])].filter(Boolean),
      }));
    },
  },
  {
    name: 'Remote OK', url: 'https://remoteok.com',
    cacheKey: () => 'all',
    async load() {
      const data = await getJson('https://remoteok.com/api');
      return (Array.isArray(data) ? data : []).filter((job: any) => job?.position && job?.company).map((job: any): FoundJob => ({
        id: `remoteok-${job.id}`, source: 'Remote OK', company: str(job.company), role: str(job.position),
        location: str(job.location) || 'Remote', remote: true, jobType: '', compensation: money(job.salary_min, job.salary_max),
        description: htmlToText(str(job.description)), url: safeUrl(job.url) || safeUrl(job.apply_url),
        postedAt: iso(job.date), tags: Array.isArray(job.tags) ? job.tags.map(str).filter(Boolean) : [],
      }));
    },
  },
  {
    name: 'Arbeitnow', url: 'https://www.arbeitnow.com',
    cacheKey: () => 'all',
    async load() {
      const data = await getJson('https://www.arbeitnow.com/api/job-board-api');
      return (Array.isArray(data?.data) ? data.data : []).map((job: any): FoundJob => ({
        id: `arbeitnow-${job.slug}`, source: 'Arbeitnow', company: str(job.company_name), role: str(job.title),
        location: str(job.location) || (job.remote ? 'Remote' : ''), remote: Boolean(job.remote),
        jobType: Array.isArray(job.job_types) ? str(job.job_types[0]).toLowerCase().replace(/\s+/g, '-') : '', compensation: '',
        description: htmlToText(str(job.description)), url: safeUrl(job.url), postedAt: iso(job.created_at),
        tags: [...(Array.isArray(job.tags) ? job.tags.map(str) : []), ...(Array.isArray(job.job_types) ? job.job_types.map(str) : [])].filter(Boolean),
      }));
    },
  },
  {
    name: 'Jobicy', url: 'https://jobicy.com',
    cacheKey: criteria => primaryKeyword(criteria).toLowerCase(),
    async load(criteria) {
      const tag = primaryKeyword(criteria);
      const url = tag
        ? `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`
        : 'https://jobicy.com/api/v2/remote-jobs?count=50';
      const data = await getJson(url);
      return (Array.isArray(data?.jobs) ? data.jobs : []).map((job: any): FoundJob => ({
        id: `jobicy-${job.id}`, source: 'Jobicy', company: str(job.companyName), role: str(job.jobTitle),
        location: str(job.jobGeo) || 'Remote', remote: true,
        jobType: Array.isArray(job.jobType) ? str(job.jobType[0]).toLowerCase() : str(job.jobType).toLowerCase(),
        compensation: money(job.annualSalaryMin, job.annualSalaryMax, str(job.salaryCurrency) || '$'),
        description: htmlToText(str(job.jobDescription) || str(job.jobExcerpt)), url: safeUrl(job.url),
        postedAt: iso(job.pubDate), tags: Array.isArray(job.jobIndustry) ? job.jobIndustry.map(str).filter(Boolean) : [],
      }));
    },
  },
  {
    name: 'Himalayas', url: 'https://himalayas.app',
    cacheKey: () => 'all',
    async load() {
      const data = await getJson('https://himalayas.app/jobs/api?limit=100');
      return (Array.isArray(data?.jobs) ? data.jobs : []).map((job: any, index: number): FoundJob => {
        const locations = Array.isArray(job.locationRestrictions) ? job.locationRestrictions.map(str).filter(Boolean) : [];
        return {
          id: `himalayas-${str(job.guid) || index}`, source: 'Himalayas', company: str(job.companyName), role: str(job.title),
          location: locations.join(', ') || 'Remote', remote: true,
          jobType: str(job.employmentType).toLowerCase().replace(/\s+/g, '-'),
          compensation: money(job.minSalary, job.maxSalary, str(job.currency) || '$'),
          description: htmlToText(str(job.description) || str(job.excerpt)),
          url: safeUrl(job.applicationLink) || safeUrl(job.guid),
          postedAt: iso(job.pubDate),
          tags: Array.isArray(job.categories) ? job.categories.map(str).filter(Boolean) : [],
        };
      });
    },
  },
];

async function loadProvider(provider: ProviderDef, criteria: SearchCriteria): Promise<FoundJob[]> {
  const key = `${provider.name}:${provider.cacheKey(criteria)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.jobs;
  const pending = inflight.get(key) ?? provider.load(criteria).then(jobs => {
    const usable = jobs.filter(job => job.role && job.company && job.url);
    cache.set(key, { at: Date.now(), jobs: usable });
    return usable;
  }).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  try { return await pending; }
  catch (error) { if (cached) return cached.jobs; throw error; }
}

const TYPE_ALIASES: Record<string, string[]> = { 'full-time': ['full-time', 'fulltime', 'full_time'], 'part-time': ['part-time', 'parttime'], contract: ['contract', 'freelance', 'contractor'], internship: ['internship', 'intern'] };
function typeAllowed(job: FoundJob, wanted: string[]) {
  if (!wanted.length || !job.jobType) return true;
  const known = job.jobType.toLowerCase();
  return wanted.some(type => (TYPE_ALIASES[type] || [type]).some(alias => known.includes(alias)));
}

export interface RankedJob extends FoundJob { relevance: number }

export function clearFreeJobCache() {
  cache.clear();
  inflight.clear();
}

export async function searchFreeJobs(criteria: SearchCriteria, limit = 60): Promise<{ jobs: RankedJob[]; sources: SourceStatus[]; fetchedAt: string }> {
  const settled = await Promise.allSettled(providers.map(provider => loadProvider(provider, criteria)));
  const sources: SourceStatus[] = settled.map((result, index) => ({
    name: providers[index].name, url: providers[index].url, ok: result.status === 'fulfilled',
    count: result.status === 'fulfilled' ? result.value.length : 0,
    ...(result.status === 'rejected' ? { error: result.reason instanceof Error ? result.reason.message : 'Unavailable' } : {}),
  }));
  const candidates: (RankedJob & { rank: number })[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const job of result.value) {
      if (!typeAllowed(job, criteria.employmentTypes)) continue;
      const relevance = roleRelevance(job, criteria.roles);
      if (relevance < FALLBACK_RELEVANCE) continue;
      const place = matchesLocation(job, criteria.locations, criteria.workModes);
      if (!place.ok) continue;
      const ageDays = job.postedAt ? Math.max(0, (Date.now() - Date.parse(job.postedAt)) / 86_400_000) : 30;
      candidates.push({ ...job, relevance, rank: relevance + place.boost + Math.max(0, 10 - ageDays / 3) });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);

  const dedupe = (list: (RankedJob & { rank: number })[]) => {
    const seen = new Set<string>();
    const out: RankedJob[] = [];
    for (const { rank: _rank, ...job } of list) {
      const key = `${job.company}|${job.role}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(job);
      if (out.length >= limit) break;
    }
    return out;
  };

  const strong = dedupe(candidates.filter(item => item.relevance >= MIN_RELEVANCE));
  const jobs = strong.length >= 5 ? strong : dedupe(candidates);
  return { jobs, sources, fetchedAt: new Date().toISOString() };
}
