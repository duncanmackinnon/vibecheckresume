import {
  createInitialResumeGenerationAnswers,
  getResumeGenerationQuestions,
  hasRequiredResumeGenerationAnswers,
} from '../resumeGeneratorQuestions';
import type { Analysis } from '@/app/types';

function createAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    score: 80,
    matchedSkills: [{ name: 'React', match: true }],
    missingSkills: ['AWS'],
    recommendations: {
      improvements: ['Quantify React delivery impact'],
      strengths: ['Strong React evidence'],
      skillGaps: ['AWS deployment evidence'],
      format: [],
    },
    detailedAnalysis: 'Strong frontend fit.',
    resumeBuilderProfile: {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      location: 'Toronto, ON',
      links: ['linkedin.com/in/jane'],
      headline: 'Frontend Engineer',
      summary: 'Frontend engineer with React experience.',
      workHighlights: ['Built React applications.'],
      education: [],
      skills: ['React'],
      projects: ['React dashboard'],
      awardsCertifications: [],
    },
    roleRequirements: [
      {
        text: 'Deploy frontend applications to AWS',
        status: 'partial',
        evidence: 'React evidence exists, but deployment evidence is thin.',
      },
    ],
    evaluation: {
      categories: [
        {
          id: 'projects_and_open_source',
          label: 'Projects and Open Source',
          score: 9,
          max: 20,
          evidence: 'Project evidence is limited.',
        },
      ],
      bonus: { score: 0, max: 10, evidence: 'No bonus points applied.' },
      deductions: { score: 0, evidence: 'No deductions applied.' },
      fairnessNotes: [],
    },
    ...overrides,
  };
}

describe('resumeGeneratorQuestions', () => {
  it('prefills extracted profile answers and asks targeted role questions', () => {
    const analysis = createAnalysis();
    const answers = createInitialResumeGenerationAnswers(analysis, 'Frontend Engineer\nReact and AWS role.');
    const questions = getResumeGenerationQuestions(analysis, 'Frontend Engineer\nReact and AWS role.');

    expect(answers.fullName).toBe('Jane Doe');
    expect(answers.contactDetails).toContain('jane@example.com');
    expect(answers.targetTitle).toBe('Frontend Engineer');
    expect(questions.map((question) => question.id)).toEqual(expect.arrayContaining([
      'roleRequirement_0',
      'missingSkillEvidence',
      'impactMetrics',
      'projectEvidence',
    ]));
    expect(questions.map((question) => question.id)).not.toContain('fullName');
    expect(hasRequiredResumeGenerationAnswers(analysis, answers, 'Frontend Engineer')).toBe(true);
  });

  it('asks only missing profile questions when profile data is absent and no role gaps exist', () => {
    const analysis = createAnalysis({
      missingSkills: [],
      recommendations: {
        improvements: [],
        strengths: ['Strong match'],
        skillGaps: [],
        format: [],
      },
      resumeBuilderProfile: undefined,
      roleRequirements: [],
      evaluation: undefined,
    });

    const questions = getResumeGenerationQuestions(analysis, '');

    expect(questions.map((question) => question.id)).toEqual([
      'fullName',
      'contactDetails',
      'targetTitle',
    ]);
  });
});
