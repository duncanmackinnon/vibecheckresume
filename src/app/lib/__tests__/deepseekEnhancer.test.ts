import { normalizeAIAnalysis } from '../deepseekEnhancer';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    score: 10,
    matchedSkills: [
      { name: 'React', match: true },
      { name: 'TypeScript', match: true },
    ],
    missingSkills: ['Python'],
    recommendations: {
      improvements: ['Add Python project evidence'],
      strengths: ['Strong React delivery evidence'],
      skillGaps: ['Python automation'],
      format: ['Add measurable impact to recent roles'],
    },
    detailedAnalysis: 'The resume has strong React and TypeScript evidence for the target role.',
    resumeSections: {
      basics: ['Frontend engineer with React experience.'],
      work: ['Built React applications for product teams.'],
      education: ['Computer science degree requirement is not used for scoring.'],
      skills: ['React', 'TypeScript', 'Testing Library'],
      projects: ['Portfolio project uses React and API integration.'],
      awardsCertifications: ['Cloud certification is relevant to the role.'],
    },
    resumeBuilderProfile: {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      location: 'Toronto, ON',
      links: ['linkedin.com/in/janedoe', 'github.com/janedoe'],
      headline: 'Frontend Engineer',
      summary: 'Frontend engineer with React delivery experience.',
      workHighlights: ['Built React applications for product teams.'],
      education: ['Computer Science'],
      skills: ['React', 'TypeScript', 'Testing Library'],
      projects: ['Portfolio project uses React and API integration.'],
      awardsCertifications: ['Cloud certification'],
    },
    roleRequirements: [
      {
        text: 'Build frontend applications with React.',
        status: 'matched',
        evidence: 'The resume includes React application delivery.',
      },
      {
        text: 'Automate workflows with Python.',
        status: 'missing',
        evidence: 'The resume does not include Python automation evidence.',
      },
    ],
    priorityActions: [
      {
        categoryId: 'technical_skills',
        title: 'Add Python automation evidence',
        rationale: 'The job asks for Python automation and the resume does not currently show it.',
        impact: 'high',
        effort: 'medium',
        exampleRewrite: 'Add a bullet describing a Python script that automated a real workflow.',
      },
    ],
    evaluation: {
      categories: [
        {
          id: 'technical_skills',
          label: 'Technical Skills',
          score: 28,
          max: 35,
          evidence: 'React and TypeScript match core technical requirements.',
        },
        {
          id: 'experience_relevance',
          label: 'Experience Relevance',
          score: 20,
          max: 30,
          evidence: 'Recent frontend work maps to the responsibilities in the job description.',
        },
        {
          id: 'projects_and_open_source',
          label: 'Projects and Open Source',
          score: 12,
          max: 20,
          evidence: 'The resume includes project delivery evidence but limited public contribution evidence.',
        },
        {
          id: 'role_alignment',
          label: 'Role Alignment',
          score: 10,
          max: 15,
          evidence: 'The candidate aligns with most role requirements.',
        },
      ],
      bonus: {
        score: 5,
        max: 10,
        evidence: 'Relevant certification adds role-specific value.',
      },
      deductions: {
        score: 2,
        evidence: 'Some required Python evidence is missing.',
      },
      fairnessNotes: ['Only job-relevant technical evidence was used.'],
    },
    ...overrides,
  };
}

describe('deepseekEnhancer normalization', () => {
  it('normalizes a valid evidence-backed evaluation and computes the final score', () => {
    const analysis = normalizeAIAnalysis(createPayload());

    expect(analysis.score).toBe(73);
    expect(analysis.evaluation?.categories).toHaveLength(4);
    expect(analysis.evaluation?.categories[0]).toEqual({
      id: 'technical_skills',
      label: 'Technical Skills',
      score: 28,
      max: 35,
      evidence: 'React and TypeScript match core technical requirements.',
    });
    expect(analysis.evaluation?.bonus.score).toBe(5);
    expect(analysis.evaluation?.deductions.score).toBe(2);
    expect(analysis.evaluation?.fairnessNotes).toEqual(
      expect.arrayContaining([
        'Only job-relevant technical evidence was used.',
        'Scoring excludes demographic, location, school-name, and grade-based signals.',
      ])
    );
    expect(analysis.resumeSections?.skills).toEqual(['React', 'TypeScript', 'Testing Library']);
    expect(analysis.resumeBuilderProfile).toEqual({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      location: 'Toronto, ON',
      links: ['linkedin.com/in/janedoe', 'github.com/janedoe'],
      headline: 'Frontend Engineer',
      summary: 'Frontend engineer with React delivery experience.',
      workHighlights: ['Built React applications for product teams.'],
      education: ['Computer Science'],
      skills: ['React', 'TypeScript', 'Testing Library'],
      projects: ['Portfolio project uses React and API integration.'],
      awardsCertifications: ['Cloud certification'],
    });
    expect(analysis.roleRequirements?.[0]).toEqual({
      text: 'Build frontend applications with React.',
      status: 'matched',
      evidence: 'The resume includes React application delivery.',
    });
    expect(analysis.priorityActions?.[0]).toEqual({
      categoryId: 'technical_skills',
      title: 'Add Python automation evidence',
      rationale: 'The job asks for Python automation and the resume does not currently show it.',
      impact: 'high',
      effort: 'medium',
      exampleRewrite: 'Add a bullet describing a Python script that automated a real workflow.',
    });
  });

  it('throws when an evaluation category has no job-relevant evidence', () => {
    const payload = createPayload({
      evaluation: {
        ...(createPayload().evaluation as Record<string, unknown>),
        categories: [
          {
            id: 'technical_skills',
            label: 'Technical Skills',
            score: 20,
            max: 35,
            evidence: '',
          },
          ...((createPayload().evaluation as any).categories.slice(1)),
        ],
      },
    });

    expect(() => normalizeAIAnalysis(payload)).toThrow(/technical_skills evidence/);
  });

  it('clamps category, bonus, deduction, and final scores to supported ranges', () => {
    const rawEvaluation = createPayload().evaluation as any;
    const payload = createPayload({
      evaluation: {
        ...rawEvaluation,
        categories: rawEvaluation.categories.map((category: any) => ({
          ...category,
          score: 999,
        })),
        bonus: {
          score: 999,
          max: 10,
          evidence: 'Relevant bonus evidence.',
        },
        deductions: {
          score: -10,
          evidence: 'Negative deductions should not apply.',
        },
      },
    });

    const analysis = normalizeAIAnalysis(payload);

    expect(analysis.evaluation?.categories.map((category) => category.score)).toEqual([35, 30, 20, 15]);
    expect(analysis.evaluation?.bonus.score).toBe(10);
    expect(analysis.evaluation?.deductions.score).toBe(0);
    expect(analysis.score).toBe(100);
  });

  it('throws when evaluation categories are malformed', () => {
    const payload = createPayload({
      evaluation: {
        ...(createPayload().evaluation as Record<string, unknown>),
        categories: 'not an array',
      },
    });

    expect(() => normalizeAIAnalysis(payload)).toThrow(/evaluation\.categories must be an array/);
  });

  it('deduplicates skills and removes protected-signal rationale from text fields', () => {
    const payload = createPayload({
      matchedSkills: [
        { name: 'React', match: true },
        { name: 'react', match: true },
        { name: 'cloud', match: true },
        { name: 'AWS Lambda', match: true },
      ],
      missingSkills: ['Python', 'GPA', 'City'],
      recommendations: {
        improvements: ['Add Python project evidence', 'Mention GPA if strong'],
        strengths: ['Strong React delivery evidence', 'Located near the office'],
        skillGaps: ['Python automation'],
        format: ['Remove location-heavy summary'],
      },
      detailedAnalysis: 'High GPA should not affect scoring. Built React applications for the job requirements.',
      evaluation: {
        ...(createPayload().evaluation as Record<string, unknown>),
        categories: (createPayload().evaluation as any).categories.map((category: any) => ({
          ...category,
          evidence: `${category.evidence} GPA and school name were ignored.`,
        })),
      },
    });

    const analysis = normalizeAIAnalysis(payload);

    expect(analysis.matchedSkills.map((skill) => skill.name)).toEqual(['React', 'AWS Lambda']);
    expect(analysis.missingSkills).toEqual(['Python']);
    expect(analysis.recommendations.improvements).toEqual(['Add Python project evidence']);
    expect(analysis.detailedAnalysis).toBe('Built React applications for the job requirements.');
    expect(analysis.evaluation?.categories[0].evidence).not.toMatch(/GPA|school/i);
    expect(analysis.resumeBuilderProfile?.fullName).toBe('Jane Doe');
    expect(analysis.resumeBuilderProfile?.email).toBe('jane@example.com');
  });

  it('filters malformed role requirements and defaults invalid priority action metadata', () => {
    const analysis = normalizeAIAnalysis(createPayload({
      roleRequirements: [
        {
          text: 'React delivery',
          status: 'unsupported',
          evidence: 'Resume includes React delivery evidence.',
        },
        {
          text: 'Location near office',
          status: 'matched',
          evidence: 'Candidate lives near the office.',
        },
        {
          text: 'No evidence row',
          status: 'missing',
          evidence: '',
        },
      ],
      priorityActions: [
        {
          categoryId: 'unknown_category',
          title: 'Quantify React impact',
          rationale: 'The role values delivery impact and the resume has unquantified React bullets.',
          impact: 'extreme',
          effort: 'tiny',
          exampleRewrite: 'Improved React page load time by 30 percent.',
        },
        {
          categoryId: 'technical_skills',
          title: 'Quantify React impact',
          rationale: 'The role values delivery impact and the resume has unquantified React bullets.',
          impact: 'high',
          effort: 'low',
        },
      ],
    }));

    expect(analysis.roleRequirements).toEqual([
      {
        text: 'React delivery',
        status: 'partial',
        evidence: 'Resume includes React delivery evidence.',
      },
    ]);
    expect(analysis.priorityActions).toEqual([
      {
        categoryId: 'role_alignment',
        title: 'Quantify React impact',
        rationale: 'The role values delivery impact and the resume has unquantified React bullets.',
        impact: 'medium',
        effort: 'medium',
        exampleRewrite: 'Improved React page load time by 30 percent.',
      },
    ]);
  });
});
