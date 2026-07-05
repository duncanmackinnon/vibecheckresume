import type { Analysis } from '@/app/types';
import type {
  MockResponse,
  TestUtils,
  TestContext,
  TestConfig,
  MockApiError,
  TestResult
} from '@/types/test';

/**
 * Default test configuration
 */
const defaultConfig: TestConfig = {
  mockDelay: 100,
  mockErrors: false,
  mockNetworkFailures: false,
  consoleLevel: 'error'
};

/**
 * Create a mock file for testing
 */
export const createMockFile = (name: string, type: string, content: string): File => {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
};

/**
 * Create a mock API response
 */
export const createMockResponse = <T>(data: T, status = 200): MockResponse<T> => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
  headers: new Headers()
});

/**
 * Create a mock analysis result
 */
export const createMockAnalysis = (partial?: Partial<Analysis>): Analysis => ({
  score: 85,
  matchedSkills: [
    { name: 'JavaScript', match: true },
    { name: 'React', match: true },
    { name: 'TypeScript', match: true }
  ],
  missingSkills: ['Python', 'AWS'],
  recommendations: {
    improvements: ['Learn Python', 'Get AWS certification'],
    strengths: ['Strong frontend skills', 'Good technical background'],
    skillGaps: ['Cloud computing', 'Backend development'],
    format: ['Well-structured resume', 'Clear presentation']
  },
  detailedAnalysis: 'Detailed analysis of the resume...',
  resumeSections: {
    basics: ['Software engineer with frontend delivery experience.'],
    work: ['Delivered React and TypeScript applications.'],
    education: ['Computer science background listed when relevant to role requirements.'],
    skills: ['JavaScript', 'React', 'TypeScript'],
    projects: ['Relevant project evidence demonstrates application delivery.'],
    awardsCertifications: []
  },
  roleRequirements: [
    {
      text: 'React frontend delivery',
      status: 'matched',
      evidence: 'The resume shows React and TypeScript application work.'
    },
    {
      text: 'AWS experience',
      status: 'missing',
      evidence: 'The resume does not show clear AWS project evidence.'
    }
  ],
  priorityActions: [
    {
      categoryId: 'technical_skills',
      title: 'Add AWS delivery evidence',
      rationale: 'The job values AWS and the resume does not show a concrete AWS project.',
      impact: 'high',
      effort: 'medium',
      exampleRewrite: 'Add a bullet describing an AWS deployment, service used, and measurable result.'
    }
  ],
  evaluation: {
    categories: [
      {
        id: 'technical_skills',
        label: 'Technical Skills',
        score: 30,
        max: 35,
        evidence: 'The resume shows JavaScript, React, and TypeScript experience.'
      },
      {
        id: 'experience_relevance',
        label: 'Experience Relevance',
        score: 25,
        max: 30,
        evidence: 'The resume includes senior frontend engineering experience.'
      },
      {
        id: 'projects_and_open_source',
        label: 'Projects and Open Source',
        score: 15,
        max: 20,
        evidence: 'The resume includes relevant implementation and delivery examples.'
      },
      {
        id: 'role_alignment',
        label: 'Role Alignment',
        score: 15,
        max: 15,
        evidence: 'The candidate aligns with frontend role responsibilities.'
      }
    ],
    bonus: {
      score: 0,
      max: 10,
      evidence: 'No bonus points applied.'
    },
    deductions: {
      score: 0,
      evidence: 'No deductions applied.'
    },
    fairnessNotes: [
      'Scoring excludes demographic, location, school-name, and grade-based signals.'
    ]
  },
  ...partial
});

/**
 * Mock fetch function for testing
 */
export const mockFetch = <T>(
  response: T,
  status = 200,
  config: TestConfig = defaultConfig
): jest.Mock => {
  return jest.fn().mockImplementation(() => 
    new Promise((resolve, reject) => {
      if (config.mockNetworkFailures) {
        reject(new Error('Network error'));
        return;
      }

      setTimeout(() => {
        resolve(createMockResponse(response, status));
      }, config.mockDelay);
    })
  );
};

/**
 * Create a mock API error
 */
export const createMockError = (
  status: number,
  message: string,
  code?: string
): MockApiError => ({
  status,
  message,
  code
});

/**
 * Mock resume content for testing
 */
export const mockResumeContent = `
John Doe
Software Engineer

Technical Skills:
- JavaScript/TypeScript
- React & Next.js
- Node.js
- Git

Experience:
Senior Software Engineer at Tech Co (2020-Present)
- Led development of React applications
- Implemented CI/CD pipelines
- Mentored junior developers

Education:
BS Computer Science, University College (2016-2020)
`;

/**
 * Mock job description for testing
 */
export const mockJobDescription = `
Senior Frontend Engineer

Required Skills:
- 5+ years experience with JavaScript
- Strong proficiency in React
- TypeScript expertise
- Experience with modern frontend tools

Preferred:
- Next.js experience
- Node.js knowledge
- AWS experience
`;

/**
 * Create test context with mocked dependencies
 */
export const createTestContext = (config: TestConfig = defaultConfig): TestContext => {
  const mockFn = jest.fn();
  
  // Configure console mocking based on config
  const mockConsole = {
    log: jest.spyOn(console, 'log'),
    error: jest.spyOn(console, 'error'),
    warn: jest.spyOn(console, 'warn'),
    info: jest.spyOn(console, 'info')
  };

  if (config.consoleLevel === 'none') {
    Object.values(mockConsole).forEach(spy => spy.mockImplementation());
  }

  return {
    mockFn,
    mockConsole,
    cleanup: () => {
      mockFn.mockReset();
      Object.values(mockConsole).forEach(spy => spy.mockRestore());
    }
  };
};

/**
 * Wait for a specified time
 */
export const wait = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Assert that a value is not null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value is null or undefined');
  }
}

/**
 * Create a test result
 */
export const createTestResult = <T>(
  success: boolean,
  data?: T,
  error?: MockApiError
): TestResult<T> => ({
  success,
  data,
  error,
  duration: Date.now()
});

// Export all utilities as a single object
export const testUtils: TestUtils = {
  createMockFile,
  createMockResponse,
  createMockAnalysis,
  mockFetch
};
