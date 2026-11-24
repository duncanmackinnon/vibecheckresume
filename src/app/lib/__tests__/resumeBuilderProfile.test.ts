import {
  extractResumeBuilderProfileFromText,
  formatContactDetails,
  mergeResumeBuilderProfiles,
} from '../resumeBuilderProfile';

describe('resumeBuilderProfile', () => {
  it('extracts heading contact information from resume text', () => {
    const profile = extractResumeBuilderProfileFromText(`
Jane Doe
Toronto, ON
jane@example.com | 555-123-4567 | linkedin.com/in/jane | github.com/jane

Experience
Built React applications.
`);

    expect(profile).toEqual(expect.objectContaining({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      location: 'Toronto, ON',
      links: ['linkedin.com/in/jane', 'github.com/jane'],
    }));
    expect(formatContactDetails(profile)).toBe(
      'jane@example.com | 555-123-4567 | Toronto, ON | linkedin.com/in/jane | github.com/jane'
    );
  });

  it('does not treat an email domain as a portfolio link', () => {
    const profile = extractResumeBuilderProfileFromText('Jane Doe\njane@example.com');

    expect(profile?.email).toBe('jane@example.com');
    expect(profile?.links).toEqual([]);
  });

  it('does not treat framework names or body companies as portfolio links', () => {
    const profile = extractResumeBuilderProfileFromText(`
Duncan MacKinnon
duncan@example.com | duncanmackinnon.xyz

Experience
Built Next.js dashboards at Knorket.AI and integrated unstructured.io pipelines.
`);

    expect(profile?.links).toEqual(['duncanmackinnon.xyz']);
  });

  it('does not misclassify technical experience bullets with comma-separated frameworks as locations', () => {
    const profile = extractResumeBuilderProfileFromText(`
Duncan MacKinnon
duncan@example.com | 555-222-3333 | linkedin.com/in/duncan

Experience
Built full-stack TypeScript, React, Next.js, and PostgreSQL web apps.
`);

    expect(profile?.location).toBeUndefined();
    expect(formatContactDetails(profile)).toBe('duncan@example.com | 555-222-3333 | linkedin.com/in/duncan');

    const headerLocationProfile = extractResumeBuilderProfileFromText(`
Duncan MacKinnon
duncan@example.com | Toronto, ON | 555-222-3333

Experience
Built TypeScript, React, Next.js apps.
`);

    expect(headerLocationProfile?.location).toBe('Toronto, ON');
  });

  it('merges model profile values with local extraction fallback', () => {
    const merged = mergeResumeBuilderProfiles(
      {
        fullName: 'Jane Doe',
        links: ['linkedin.com/in/jane'],
        workHighlights: ['Built React applications.'],
        education: [],
        skills: ['React'],
        projects: [],
        awardsCertifications: [],
      },
      {
        email: 'jane@example.com',
        phone: '555-123-4567',
        links: ['github.com/jane'],
        workHighlights: [],
        education: [],
        skills: ['TypeScript'],
        projects: [],
        awardsCertifications: [],
      }
    );

    expect(merged).toEqual(expect.objectContaining({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      links: ['linkedin.com/in/jane', 'github.com/jane'],
      skills: ['React', 'TypeScript'],
    }));
  });
});
