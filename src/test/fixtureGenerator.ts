import type { Analysis, AnalysisEvaluation, PriorityAction, ResumeSections, RoleRequirement } from '@/app/types';
import { createTempFixture } from './fixtureLoader';

/**
 * Generator options
 */
interface GeneratorOptions {
  seed?: number;
  prefix?: string;
}

/**
 * Resume generator options
 */
interface ResumeOptions extends GeneratorOptions {
  yearsOfExperience?: number;
  skillCount?: number;
  projectCount?: number;
}

/**
 * Job description generator options
 */
interface JobDescriptionOptions extends GeneratorOptions {
  requiredSkillCount?: number;
  niceToHaveSkillCount?: number;
  seniority?: 'junior' | 'mid' | 'senior' | 'lead';
}

/**
 * Analysis generator options
 */
interface AnalysisOptions extends GeneratorOptions {
  score?: number;
  matchedSkillCount?: number;
  missingSkillCount?: number;
  recommendationCount?: number;
}

/**
 * Common skills for generation
 */
const SKILLS = [
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'Python',
  'AWS',
  'Docker',
  'Kubernetes',
  'MongoDB',
  'PostgreSQL',
  'GraphQL',
  'REST APIs',
  'CI/CD',
  'Git',
  'Agile',
];

const EVALUATION_CATEGORIES = [
  { id: 'technical_skills', label: 'Technical Skills', max: 35 },
  { id: 'experience_relevance', label: 'Experience Relevance', max: 30 },
  { id: 'projects_and_open_source', label: 'Projects and Open Source', max: 20 },
  { id: 'role_alignment', label: 'Role Alignment', max: 15 },
];

function generateEvaluation(score: number): AnalysisEvaluation {
  let runningTotal = 0;
  const categories = EVALUATION_CATEGORIES.map((category, index) => {
    const isLast = index === EVALUATION_CATEGORIES.length - 1;
    const categoryScore = isLast
      ? Math.max(0, Math.min(category.max, score - runningTotal))
      : Math.max(0, Math.min(category.max, Math.round(score * (category.max / 100))));
    runningTotal += categoryScore;

    return {
      ...category,
      score: categoryScore,
      evidence: `${category.label} evidence is based on job-relevant resume details.`,
    };
  });

  return {
    categories,
    bonus: {
      score: 0,
      max: 10,
      evidence: 'No bonus points applied.',
    },
    deductions: {
      score: 0,
      evidence: 'No deductions applied.',
    },
    fairnessNotes: [
      'Scoring excludes demographic, location, school-name, and grade-based signals.',
    ],
  };
}

function generateResumeSections(matchedSkills: Array<{ name: string; match: boolean }>): ResumeSections {
  const skillNames = matchedSkills.map((skill) => skill.name);

  return {
    basics: ['Software engineer with job-relevant product delivery experience.'],
    work: ['Built and maintained applications using relevant frontend and backend technologies.'],
    education: ['Education details are present when job-relevant credentials are required.'],
    skills: skillNames,
    projects: ['Project evidence demonstrates implementation and delivery experience.'],
    awardsCertifications: ['No role-specific awards or certifications were required.'],
  };
}

function generateRoleRequirements(matchedSkills: Array<{ name: string; match: boolean }>, missingSkills: string[]): RoleRequirement[] {
  return [
    {
      text: `Experience with ${matchedSkills[0]?.name ?? 'relevant technologies'}`,
      status: 'matched',
      evidence: `The resume includes ${matchedSkills[0]?.name ?? 'relevant'} experience.`,
    },
    {
      text: `Experience with ${missingSkills[0] ?? 'additional required skills'}`,
      status: 'missing',
      evidence: `The resume does not show clear ${missingSkills[0] ?? 'additional required skill'} evidence.`,
    },
  ];
}

function generatePriorityActions(missingSkills: string[]): PriorityAction[] {
  return [
    {
      categoryId: 'technical_skills',
      title: `Add ${missingSkills[0] ?? 'missing skill'} evidence`,
      rationale: `The target role asks for ${missingSkills[0] ?? 'a skill'} and the resume does not yet show it clearly.`,
      impact: 'high',
      effort: 'medium',
      exampleRewrite: `Add a resume bullet showing how ${missingSkills[0] ?? 'the missing skill'} was used to deliver a measurable result.`,
    },
  ];
}

/**
 * Generate a random resume
 */
export function generateResume(options: ResumeOptions = {}): string {
  const {
    yearsOfExperience = 5,
    skillCount = 8,
    projectCount = 3,
    prefix = 'Test'
  } = options;

  const skills = SKILLS
    .sort(() => Math.random() - 0.5)
    .slice(0, skillCount);

  const resume = `
${prefix} Engineer
Software Engineer with ${yearsOfExperience}+ years of experience

SKILLS
${skills.join(', ')}

EXPERIENCE
${Array(projectCount).fill(0).map((_, i) => `
${prefix} Company ${i + 1}
Senior Software Engineer
- Built scalable applications using ${skills[i % skills.length]}
- Implemented ${skills[(i + 1) % skills.length]} solutions
- Led team of ${3 + i} developers
`).join('\n')}

EDUCATION
B.S. Computer Science
${prefix} University
`;

  return resume.trim();
}

/**
 * Generate a random job description
 */
export function generateJobDescription(options: JobDescriptionOptions = {}): string {
  const {
    requiredSkillCount = 5,
    niceToHaveSkillCount = 3,
    seniority = 'senior',
    prefix = 'Test'
  } = options;

  const allSkills = [...SKILLS].sort(() => Math.random() - 0.5);
  const requiredSkills = allSkills.slice(0, requiredSkillCount);
  const niceToHaveSkills = allSkills.slice(requiredSkillCount, requiredSkillCount + niceToHaveSkillCount);

  return `
${seniority.charAt(0).toUpperCase() + seniority.slice(1)} Software Engineer
${prefix} Company

Required Skills:
${requiredSkills.map(skill => `- ${skill}`).join('\n')}

Nice to Have:
${niceToHaveSkills.map(skill => `- ${skill}`).join('\n')}

Responsibilities:
- Design and implement scalable applications
- Lead technical initiatives
- Mentor junior developers
`.trim();
}

/**
 * Generate a random analysis result
 */
export function generateAnalysis(options: AnalysisOptions = {}): Analysis {
  const {
    score = Math.floor(Math.random() * 40) + 60,
    matchedSkillCount = 5,
    missingSkillCount = 3,
    recommendationCount = 4
  } = options;

  const allSkills = [...SKILLS].sort(() => Math.random() - 0.5);
  const matchedSkills = allSkills.slice(0, matchedSkillCount).map(name => ({
    name,
    match: true
  }));
  const missingSkills = allSkills.slice(matchedSkillCount, matchedSkillCount + missingSkillCount);

  return {
    score,
    matchedSkills,
    missingSkills,
    recommendations: {
      improvements: Array(recommendationCount).fill(0).map((_, i) => 
        `Learn ${missingSkills[i % missingSkills.length]}`
      ),
      strengths: matchedSkills.map(skill => 
        `Strong ${skill.name} experience`
      ),
      skillGaps: missingSkills.map(skill => 
        `Missing ${skill} experience`
      ),
      format: [
        'Good structure',
        'Clear presentation',
        'Well-organized content'
      ]
    },
    detailedAnalysis: `
The candidate shows ${score}% match with the job requirements.
Strong experience in ${matchedSkills.map(s => s.name).join(', ')}.
Areas for improvement: ${missingSkills.join(', ')}.
`.trim(),
    evaluation: generateEvaluation(score),
    resumeSections: generateResumeSections(matchedSkills),
    roleRequirements: generateRoleRequirements(matchedSkills, missingSkills),
    priorityActions: generatePriorityActions(missingSkills)
  };
}

/**
 * Generate and save fixtures
 */
export function generateFixtures(options: GeneratorOptions = {}) {
  const { prefix = 'test' } = options;

  const resume = generateResume({ prefix });
  const jobDescription = generateJobDescription({ prefix });
  const analysis = generateAnalysis();

  const resumeFile = createTempFixture(resume, '.txt');
  const jobDescriptionFile = createTempFixture(jobDescription, '.txt');
  const analysisFile = createTempFixture(JSON.stringify(analysis, null, 2), '.json');

  return {
    resumeFile,
    jobDescriptionFile,
    analysisFile,
    resume,
    jobDescription,
    analysis
  };
}
