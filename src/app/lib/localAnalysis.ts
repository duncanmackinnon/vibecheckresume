import { Analysis } from '../types';

const COMMON_SKILLS = {
  programming: [
    'javascript', 'typescript', 'python', 'java', 'c++', 'ruby', 'php',
    'scala', 'kotlin', 'swift', 'rust', 'go'
  ],
  frontend: [
    'react', 'vue', 'angular', 'html', 'css', 'sass', 'less', 'tailwind',
    'bootstrap', 'material-ui', 'webpack', 'vite', 'nextjs', 'gatsby'
  ],
  backend: [
    'node', 'express', 'django', 'flask', 'spring', 'rails', 'laravel',
    'asp.net', 'fastapi', 'graphql', 'rest'
  ],
  database: [
    'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
    'dynamodb', 'cassandra', 'oracle', 'sqlite'
  ],
  cloud: [
    'aws', 'azure', 'gcp', 'cloud', 'docker', 'kubernetes', 'serverless',
    'terraform', 'jenkins', 'ci/cd', 'devops'
  ],
  testing: [
    'jest', 'mocha', 'cypress', 'selenium', 'testing', 'tdd', 'unit test',
    'integration test', 'e2e test'
  ],
  soft_skills: [
    'leadership', 'communication', 'teamwork', 'problem-solving',
    'analytical', 'project management', 'agile', 'scrum'
  ]
};

function findSkillMatches(text: string, skills: string[]): string[] {
  return skills.filter(skill =>
    text.toLowerCase().includes(skill.toLowerCase())
  );
}

function getSkillsCategory(skill: string): string {
  for (const [category, skills] of Object.entries(COMMON_SKILLS)) {
    if (skills.includes(skill.toLowerCase())) {
      return category;
    }
  }
  return 'other';
}

function generateRecommendations(
  missingSkills: string[],
  matchedSkills: Array<{ name: string; match: boolean }>,
  score: number
): {
  improvements: string[];
  strengths: string[];
  skillGaps: string[];
  format: string[];
} {
  const improvements = [];
  const strengths = [];
  const skillGaps = [];
  const format = [
    'Consider using a clear, professional format',
    'Make sure your contact information is prominent',
    'Use bullet points to highlight achievements',
    'Include relevant metrics and results where possible'
  ];

  // Add skill-based recommendations
  if (missingSkills.length > 0) {
    skillGaps.push(
      `Consider adding experience with: ${missingSkills.join(', ')}`
    );
  }

  // Score-based recommendations
  if (score < 50) {
    improvements.push(
      'Your resume needs significant alignment with the job requirements',
      'Focus on acquiring and highlighting relevant skills',
      'Consider taking courses or certifications in the missing skills'
    );
  } else if (score < 75) {
    improvements.push(
      'Your resume shows good potential but could use some enhancement',
      'Try to highlight more specific examples of using the required skills'
    );
  } else {
    strengths.push(
      'Your resume shows strong alignment with the job requirements',
      'You have a good foundation of relevant skills'
    );
  }

  // Add matched skills to strengths
  const strongSkills = matchedSkills
    .filter(skill => skill.match)
    .map(skill => skill.name);

  if (strongSkills.length > 0) {
    strengths.push(
      `Strong technical background in: ${strongSkills.join(', ')}`
    );
  }

  return {
    improvements,
    strengths,
    skillGaps,
    format,
    isChunked: false // Will be set by deepseek.ts for chunked processing
  };
}

export function analyzeResumeLocally(resumeText: string, jobDescription: string): Analysis {
  const allSkills = Object.values(COMMON_SKILLS).flat();
  const jobSkills = findSkillMatches(jobDescription, allSkills);

  const matchedSkills = jobSkills.map(skill => ({
    name: skill,
    match: findSkillMatches(resumeText, [skill]).length > 0
  }));

  const missingSkills = matchedSkills
    .filter(skill => !skill.match)
    .map(skill => skill.name);

  const score = Math.round(
    (matchedSkills.filter(skill => skill.match).length / jobSkills.length) * 100
  );

  const recommendations = generateRecommendations(
    missingSkills,
    matchedSkills,
    score
  );

  return {
    score,
    matchedSkills,
    missingSkills,
    isChunked: false,
    recommendations
  };

  // Group skills by category
  const skillsByCategory = matchedSkills.reduce((acc, skill) => {
    const category = getSkillsCategory(skill.name);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(skill);
    return acc;
  }, {} as Record<string, typeof matchedSkills>);

  const detailedAnalysis = `
Based on the local analysis:
- Overall match score: ${score}%
- Found ${matchedSkills.filter(s => s.match).length} matching skills
- Identified ${missingSkills.length} missing skills

Skills by Category:
${Object.entries(skillsByCategory)
      .map(([category, skills]) => {
        const matched = skills.filter(s => s.match).map(s => s.name).join(', ');
        const missing = skills.filter(s => !s.match).map(s => s.name).join(', ');
        return `
${category.toUpperCase()}:
${matched ? `✓ Matched: ${matched}` : ''}
${missing ? `⨯ Missing: ${missing}` : ''}`;
      })
      .join('\n')}

${recommendations.skillGaps.length > 0 ? '\nRecommended skill improvements:\n' + recommendations.skillGaps.join('\n') : ''}
${recommendations.strengths.length > 0 ? '\nKey strengths:\n' + recommendations.strengths.join('\n') : ''}
  `.trim();

  return {
    score,
    matchedSkills,
    missingSkills,
    recommendations,
    detailedAnalysis
  };
}