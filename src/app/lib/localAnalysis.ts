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

interface Recommendations {
  improvements: string[];
  strengths: string[];
  skillGaps: string[];
  format: string[];
  isChunked?: boolean;
}

function generateRecommendations(
  missingSkills: string[],
  matchedSkills: Array<{ name: string; match: boolean }>,
  score: number
): Recommendations {
  const recommendations: Recommendations = {
    improvements: [],
    strengths: [],
    skillGaps: [],
    format: [
      'Include a clear professional summary highlighting your expertise and career goals',
      'Structure your experience section with measurable achievements and impact',
      'Use industry-standard formatting with consistent spacing and bullet points',
      'Include relevant certifications and educational qualifications prominently',
      'Add a dedicated skills section organized by categories (e.g., Programming Languages, Frameworks, Tools)'
    ]
  };

  // Analyze skill gaps by category
  const missingSkillsByCategory = missingSkills.reduce((acc, skill) => {
    const category = getSkillsCategory(skill);
    if (!acc[category]) acc[category] = [];
    acc[category].push(skill);
    return acc;
  }, {} as Record<string, string[]>);

  // Generate specific recommendations for each category
  Object.entries(missingSkillsByCategory).forEach(([category, skills]) => {
    if (skills.length > 0) {
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      recommendations.skillGaps.push(
        `${categoryName} skills to develop: ${skills.join(', ')}`
      );

      // Add specific improvement suggestions based on category
      const suggestion = getCategorySpecificSuggestion(category, skills);
      if (suggestion) {
        recommendations.improvements.push(suggestion);
      }
    }
  });

  // Score-based detailed recommendations
  if (score < 50) {
    recommendations.improvements.push(
      'Focus on acquiring fundamental skills required for the position',
      'Consider completing relevant online courses or certifications',
      'Gain practical experience through personal projects or contributions to open source',
      'Network with professionals in the field to understand skill requirements better'
    );
  } else if (score < 75) {
    recommendations.improvements.push(
      "Highlight specific projects where you have applied the required skills",
      'Quantify your achievements with metrics and results',
      'Add more detailed examples of your technical implementations'
    );
  }

  // Analyze and highlight strengths
  const skillsByCategory = matchedSkills
    .filter(skill => skill.match)
    .reduce((acc, skill) => {
      const category = getSkillsCategory(skill.name);
      if (!acc[category]) acc[category] = [];
      acc[category].push(skill.name);
      return acc;
    }, {} as Record<string, string[]>);

  Object.entries(skillsByCategory).forEach(([category, skills]) => {
    if (skills.length > 0) {
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      recommendations.strengths.push(
        `Strong ${categoryName} background with expertise in: ${skills.join(', ')}`
      );
    }
  });

  return recommendations;
}

function getCategorySpecificSuggestion(category: string, skills: string[]): string {
  const suggestions: Record<string, string> = {
    programming: `Consider building personal projects using ${skills.slice(0, 3).join(', ')} to demonstrate practical experience`,
    frontend: `Gain hands-on experience with ${skills.join(', ')} through building responsive web applications`,
    backend: `Create REST APIs or backend services using ${skills.join(', ')} to showcase your server-side capabilities`,
    database: `Practice database design and implementation using ${skills.join(', ')}`,
    cloud: `Obtain certifications in ${skills.slice(0, 2).join(' or ')} to validate your cloud expertise`,
    testing: `Implement comprehensive test suites using ${skills.join(', ')} in your projects`,
    soft_skills: `Seek leadership or team projects to develop ${skills.join(', ')} abilities`
  };

  return suggestions[category] || '';
}

export function analyzeResume(resumeText: string, jobDescription: string): Analysis {
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

  // Group skills by category
  const skillsByCategory = matchedSkills.reduce((acc, skill) => {
    const category = getSkillsCategory(skill.name);
    if (!acc[category]) acc[category] = [];
    acc[category].push(skill);
    return acc;
  }, {} as Record<string, typeof matchedSkills>);

  const detailedAnalysis = `
Based on the detailed analysis:
- Overall match score: ${score}%
- Found ${matchedSkills.filter(s => s.match).length} matching skills
- Identified ${missingSkills.length} skill gaps

Skills Analysis by Category:
${Object.entries(skillsByCategory)
    .map(([category, skills]) => {
      const matched = skills.filter(s => s.match).map(s => s.name).join(', ');
      const missing = skills.filter(s => !s.match).map(s => s.name).join(', ');
      const matchRate = Math.round((skills.filter(s => s.match).length / skills.length) * 100);
      return `
${category.toUpperCase()} (${matchRate}% match):
${matched ? `✓ Matched Skills: ${matched}` : ''}
${missing ? `⨯ Skills to Develop: ${missing}` : ''}`;
    })
    .join('\n')}

${recommendations.skillGaps.length > 0 ? '\nSkill Development Priorities:\n' + recommendations.skillGaps.join('\n') : ''}
${recommendations.strengths.length > 0 ? '\nKey Strengths:\n' + recommendations.strengths.join('\n') : ''}

Recommended Actions:
${recommendations.improvements.map(imp => `• ${imp}`).join('\n')}

Resume Format Recommendations:
${recommendations.format.map(fmt => `• ${fmt}`).join('\n')}
  `.trim();

  return {
    score,
    matchedSkills,
    missingSkills,
    recommendations,
    detailedAnalysis,
    isChunked: false
  };
}