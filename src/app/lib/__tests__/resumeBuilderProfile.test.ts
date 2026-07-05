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
