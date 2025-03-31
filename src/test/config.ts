import type { TestConfig } from '@/types/test';

/**
 * Default test configuration
 */
export const defaultTestConfig: TestConfig = {
  mockDelay: 100,
  mockErrors: false,
  mockNetworkFailures: false,
  consoleLevel: 'error'
};

/**
 * Test file paths
 */
export const testPaths = {
  resume: './test-resume.txt',
  jobDescription: './test-job-description.txt',
  mockData: './src/test/mockData',
  fixtures: './src/test/fixtures'
};

/**
 * Mock API endpoints
 */
export const mockEndpoints = {
  analyze: '/api/analyze',
  health: '/api/health',
  upload: '/api/upload'
};

/**
 * Mock response delays (in milliseconds)
 */
export const mockDelays = {
  short: 100,
  medium: 500,
  long: 1000
};

/**
 * Mock error messages
 */
export const mockErrors = {
  network: 'Network error occurred',
  validation: 'Validation error occurred',
  authorization: 'Authorization error occurred',
  notFound: 'Resource not found',
  server: 'Server error occurred'
};

/**
 * Mock HTTP status codes
 */
export const mockStatusCodes = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  serverError: 500
};

/**
 * Test timeouts (in milliseconds)
 */
export const testTimeouts = {
  short: 1000,
  medium: 5000,
  long: 10000
};

/**
 * Mock file types
 */
export const mockFileTypes = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain'
};

/**
 * Mock file sizes (in bytes)
 */
export const mockFileSizes = {
  small: 1024, // 1KB
  medium: 1024 * 1024, // 1MB
  large: 5 * 1024 * 1024 // 5MB
};

/**
 * Test user interactions
 */
export const testInteractions = {
  uploadDelay: 500,
  typeDelay: 100,
  clickDelay: 50
};

/**
 * Test data limits
 */
export const testLimits = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  minJobDescriptionLength: 50,
  maxJobDescriptionLength: 5000,
  minResumeLength: 100,
  maxResumeLength: 10000
};

/**
 * Test environment variables
 */
export const testEnvVars = {
  development: {
    NODE_ENV: 'development',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPSEEK_API_KEY: 'test123',
    RATE_LIMIT: '10'
  },
  test: {
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPSEEK_API_KEY: 'test123',
    RATE_LIMIT: '10'
  },
  production: {
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://example.com',
    DEEPSEEK_API_KEY: 'test123',
    RATE_LIMIT: '10'
  }
};

/**
 * Test validation rules
 */
export const testValidation = {
  fileTypes: ['pdf', 'doc', 'docx', 'txt'],
  maxFileCount: 1,
  allowedFileExtensions: ['.pdf', '.doc', '.docx', '.txt']
};

/**
 * Mock API responses
 */
export const mockResponses = {
  success: { status: 'success', message: 'Operation completed successfully' },
  error: { status: 'error', message: 'Operation failed' },
  invalid: { status: 'error', message: 'Invalid input provided' }
};