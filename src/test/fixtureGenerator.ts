import { Analysis } from '@/app/types';
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
`.trim()
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