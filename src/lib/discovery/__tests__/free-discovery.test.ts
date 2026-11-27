/** @jest-environment node */
import { GET } from '@/app/api/jobs/search/route';
import { clearFreeJobCache, htmlToText } from '../free-sources';
import { matchesLocation, resumeFit, roleRelevance } from '../local-match';

beforeEach(() => {
  clearFreeJobCache();
  jest.resetAllMocks();
});

test('roleRelevance evaluates comma-separated role alternatives independently', () => {
  const job = {
    role: 'Senior UX Researcher',
    tags: ['Research', 'User Interviews'],
    description: 'Lead qualitative usability testing and customer research studies.',
  };
  expect(roleRelevance(job, 'product designer, ux researcher')).toBeGreaterThanOrEqual(80);
  expect(roleRelevance(job, 'account executive')).toBe(0);
});

test('matchesLocation filters restricted remote regions while allowing local, compatible region, and worldwide remote', () => {
  expect(matchesLocation({ location: 'US Only', remote: true }, 'Toronto', [])).toEqual({ ok: false, boost: 0 });
  expect(matchesLocation({ location: 'UK Only', remote: true }, 'Toronto', [])).toEqual({ ok: false, boost: 0 });
  expect(matchesLocation({ location: 'Europe', remote: true }, 'Toronto', [])).toEqual({ ok: false, boost: 0 });
  expect(matchesLocation({ location: 'Toronto, ON', remote: false }, 'Toronto', [])).toEqual({ ok: true, boost: 20 });
  expect(matchesLocation({ location: 'Canada', remote: true }, 'Toronto', [])).toEqual({ ok: true, boost: 10 });
  expect(matchesLocation({ location: 'North America', remote: true }, 'Toronto', [])).toEqual({ ok: true, boost: 10 });
  expect(matchesLocation({ location: 'Worldwide', remote: true }, 'Toronto', [])).toEqual({ ok: true, boost: 5 });
  expect(matchesLocation({ location: 'Remote', remote: true }, 'Toronto', [])).toEqual({ ok: true, boost: 5 });
});

test('resumeFit scores weighted overlap and htmlToText strips markup safely', () => {
  const fit = resumeFit(
    'Product Designer experienced in Figma, design systems, prototyping, and accessibility.',
    {
      role: 'Product Designer',
      tags: ['Figma', 'Design Systems'],
      description: 'Build accessible design systems and interactive prototypes in Figma. Experience with Motion.',
    },
  );
  expect(fit.score).toBeGreaterThan(60);
  expect(fit.matched).toEqual(expect.arrayContaining(['product', 'designer', 'figma']));
  expect(htmlToText('<p>Hello&nbsp;<strong>world</strong></p><ul><li>Item &amp; detail</li></ul>')).toBe('Hello world\n• Item & detail');
});

test('GET /api/jobs/search aggregates keyless feeds, deduplicates, and filters locations', async () => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('remotive.com')) {
      return Response.json({
        jobs: [
          {
            id: 1,
            company_name: 'Maple Studio',
            title: 'Product Designer',
            candidate_required_location: 'Canada',
            job_type: 'full_time',
            salary: '$140k',
            description: '<p>Design product workflows in Figma.</p>',
            url: 'https://remotive.com/jobs/1',
            publication_date: new Date().toISOString(),
            category: 'Design',
            tags: ['figma'],
          },
          {
            id: 2,
            company_name: 'US Only Corp',
            title: 'Product Designer',
            candidate_required_location: 'USA Only',
            job_type: 'full_time',
            salary: '',
            description: '<p>Product design role.</p>',
            url: 'https://remotive.com/jobs/2',
            publication_date: new Date().toISOString(),
            category: 'Design',
            tags: [],
          },
        ],
      });
    }
    if (url.includes('remoteok.com')) {
      return Response.json([
        { legal: 'notice' },
        {
          id: 'ok-1',
          company: 'Maple Studio',
          position: 'Product Designer',
          location: 'Worldwide',
          description: '<p>Duplicate listing on Remote OK.</p>',
          url: 'https://remoteok.com/jobs/ok-1',
          date: new Date().toISOString(),
          tags: ['design'],
        },
      ]);
    }
    if (url.includes('arbeitnow.com')) {
      return Response.json({ data: [] });
    }
    if (url.includes('jobicy.com')) {
      return Response.json({
        jobs: [
          {
            id: 99,
            companyName: 'Open Canvas',
            jobTitle: 'Senior Product Designer',
            jobGeo: 'Anywhere',
            jobType: ['Full-Time'],
            jobIndustry: ['Design'],
            jobDescription: '<p>Lead product design systems.</p>',
            url: 'https://jobicy.com/jobs/99',
            pubDate: new Date().toISOString(),
          },
        ],
      });
    }
    if (url.includes('himalayas.app')) {
      return Response.json({
        jobs: [
          {
            guid: 'https://himalayas.app/jobs/him-1',
            companyName: 'Cloud Craft',
            title: 'Staff Product Designer',
            locationRestrictions: ['North America'],
            employmentType: 'Full Time',
            categories: ['Product-Design'],
            description: '<p>Own end-to-end product design.</p>',
            applicationLink: 'https://himalayas.app/jobs/him-1',
            pubDate: Math.floor(Date.now() / 1000),
          },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as unknown as typeof fetch;

  const res = await GET(new Request('http://localhost:3000/api/jobs/search?roles=product%20designer&locations=Toronto&modes=&types='));
  expect(res.status).toBe(200);
  const payload = await res.json();
  expect(payload.sources).toHaveLength(5);
  expect(payload.sources.every((s: { ok: boolean }) => s.ok)).toBe(true);

  const companies = payload.jobs.map((j: { company: string }) => j.company);
  expect(companies).toContain('Maple Studio');
  expect(companies).toContain('Open Canvas');
  expect(companies).toContain('Cloud Craft');
  expect(companies).not.toContain('US Only Corp');
  expect(companies.filter((name: string) => name === 'Maple Studio')).toHaveLength(1);
});

test('GET /api/jobs/search rejects missing role query and returns 502 if all feeds fail', async () => {
  const bad = await GET(new Request('http://localhost:3000/api/jobs/search?roles=a'));
  expect(bad.status).toBe(400);

  global.fetch = jest.fn(async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;

  const down = await GET(new Request('http://localhost:3000/api/jobs/search?roles=product%20designer'));
  expect(down.status).toBe(502);
});
