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