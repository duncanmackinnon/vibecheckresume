import { Analysis } from '../types';

const COMMON_SKILLS = {
  programming: [
    'javascript', 'typescript', 'python', 'java', 'c++', 'ruby', 'php',
    'scala', 'kotlin', 'swift', 'rust', 'go', 'git', 'linux'
  ],
  frontend: [
    'react', 'vue', 'angular', 'html', 'css', 'sass', 'less', 'tailwind',
    'tailwind css', 'bootstrap', 'material-ui', 'webpack', 'vite', 'nextjs',
    'next.js', 'gatsby'
  ],
  backend: [
    'node', 'express', 'django', 'flask', 'spring', 'rails', 'laravel',
    'asp.net', 'fastapi', 'graphql', 'rest', 'rest api', 'prisma',
    'drizzle', 'supabase', 'microservices'
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
    'jest', 'mocha', 'cypress', 'playwright', 'selenium', 'testing', 'tdd',
    'unit test', 'integration test', 'e2e test'
  ],
  design: [
    'figma', 'design systems', 'prototyping', 'wireframing', 'user research',
    'usability testing', 'accessibility', 'wcag', 'interaction design',
    'information architecture'
  ],
  product_and_ops: [
    'product management', 'roadmapping', 'stakeholder management', 'a/b testing',
    'jira', 'confluence', 'okr', 'kpi', 'customer success', 'salesforce',
    'hubspot', 'seo'
  ],
  data: [
    'excel', 'tableau', 'power bi', 'looker', 'snowflake', 'dbt', 'bigquery',
    'pandas', 'statistics', 'data visualization', 'etl'
  ],
  soft_skills: [
    'leadership', 'communication', 'teamwork', 'problem-solving',
    'analytical', 'project management', 'agile', 'scrum'
  ]
};

const DOMAIN_TERM_STOPWORDS = new Set([
  'about', 'above', 'across', 'after', 'all', 'also', 'and', 'any', 'are', 'around',
  'because', 'been', 'being', 'between', 'both', 'build', 'building', 'can', 'candidate',
  'candidates', 'collaborate', 'company', 'create', 'day', 'degree', 'deliver', 'description',
  'design', 'develop', 'developing', 'diverse', 'duties', 'ensure', 'environment', 'equal',
  'etc', 'every', 'excellent', 'experience', 'experienced', 'fast', 'field', 'following',
  'for', 'from', 'full', 'good', 'great', 'have', 'help', 'high', 'hiring', 'ideal',
  'including', 'into', 'its', 'job', 'join', 'knowledge', 'large', 'lead', 'leading',
  'like', 'looking', 'make', 'manage', 'management', 'may', 'more', 'most', 'must',
  'new', 'not', 'office', 'one', 'only', 'opportunity', 'other', 'our', 'out', 'over',
  'part', 'people', 'plus', 'position', 'preferred', 'qualifications', 'related', 'remote',
  'required', 'requirements', 'responsibilities', 'responsible', 'role', 'salary', 'seeking',
  'should', 'skills', 'small', 'some', 'strong', 'such', 'support', 'team', 'teams',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'through', 'time', 'tools', 'understanding', 'use', 'using', 'various', 'very',
  'want', 'well', 'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with',
  'within', 'work', 'working', 'world', 'would', 'year', 'years', 'you', 'your'
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSkillMatches(text: string, skills: string[]): string[] {
  const lower = text.toLowerCase();
  return skills.filter(skill => {
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(skill.toLowerCase())}(?:$|[^a-z0-9])`);
    return pattern.test(lower);
  });
}

function extractFallbackDomainTerms(jobDescription: string, existingSkills: string[], limit = 10): string[] {
  const existing = new Set(existingSkills.map(skill => skill.toLowerCase()));
  const counts = new Map<string, number>();
  const tokens = jobDescription.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
  for (const raw of tokens) {
    const token = raw.replace(/\.+$/, '');
    if (token.length < 3 || DOMAIN_TERM_STOPWORDS.has(token) || existing.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
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
      'Highlight specific projects where you have applied the required skills',
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
    design: `Document user flows, wireframes, or design system work demonstrating ${skills.join(', ')}`,
    product_and_ops: `Highlight measurable outcomes and stakeholder delivery using ${skills.join(', ')}`,
    data: `Showcase dashboards, pipelines, or analytical projects built with ${skills.join(', ')}`,
    soft_skills: `Seek leadership or team projects to develop ${skills.join(', ')} abilities`,
    other: `Surface verifiable experience or coursework covering ${skills.slice(0, 4).join(', ')}`
  };

  return suggestions[category] || '';
}

export function analyzeResume(resumeText: string, jobDescription: string): Analysis {
  const allSkills = Object.values(COMMON_SKILLS).flat();
  const matchedCatalog = findSkillMatches(jobDescription, allSkills);
  const jobSkills = matchedCatalog.length < 4
    ? Array.from(new Set([...matchedCatalog, ...extractFallbackDomainTerms(jobDescription, matchedCatalog, 10 - matchedCatalog.length)]))
    : matchedCatalog;

  const matchedSkills = jobSkills.map(skill => ({
    name: skill,
    match: findSkillMatches(resumeText, [skill]).length > 0
  }));

  const missingSkills = matchedSkills
    .filter(skill => !skill.match)
    .map(skill => skill.name);

  const matchedCount = matchedSkills.filter(skill => skill.match).length;
  const totalSkills = jobSkills.length;
  const score = totalSkills > 0
    ? Math.round((matchedCount / totalSkills) * 100)
    : 0;

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

  const categorySections = Object.entries(skillsByCategory)
    .map(([category, skills]) => {
      const matched = skills.filter(s => s.match).map(s => s.name).join(', ');
      const missing = skills.filter(s => !s.match).map(s => s.name).join(', ');
      const matchRate = Math.round((skills.filter(s => s.match).length / skills.length) * 100);

      const parts = [
        `${category.toUpperCase()} (${matchRate}% match):`,
        matched ? `- Matched Skills: ${matched}` : '',
        missing ? `- Skills to Develop: ${missing}` : ''
      ].filter(Boolean);

      return parts.join('\n');
    })
    .join('\n');

  const detailedAnalysis = [
    'Based on the detailed analysis:',
    `- Overall match score: ${score}%`,
    `- Found ${matchedSkills.filter(s => s.match).length} matching skills`,
    `- Identified ${missingSkills.length} skill gaps`,
    '',
    'Skills Analysis by Category:',
    categorySections,
    recommendations.skillGaps.length > 0
      ? ['','Skill Development Priorities:', ...recommendations.skillGaps].join('\n')
      : '',
    recommendations.strengths.length > 0
      ? ['','Key Strengths:', ...recommendations.strengths].join('\n')
      : '',
    '',
    'Recommended Actions:',
    recommendations.improvements.map(imp => `- ${imp}`).join('\n'),
    '',
    'Resume Format Recommendations:',
    recommendations.format.map(fmt => `- ${fmt}`).join('\n')
  ].filter(Boolean).join('\n');

  return {
    score,
    matchedSkills,
    missingSkills,
    recommendations,
    detailedAnalysis,
    isChunked: false
  };
}
