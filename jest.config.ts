import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig: Config = {
  setupFiles: [
    '<rootDir>/jest.env.js',
  ],
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setupTests.ts',
  ],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
  ],
  moduleNameMapper: {
    // Handle module aliases
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/app/(.*)$': '<rootDir>/src/app/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/app/lib/validateEnv$': '<rootDir>/src/app/lib/validateEnv.cjs',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/test/(.*)$': '<rootDir>/src/test/$1',
    '^react-markdown$': '<rootDir>/__mocks__/react-markdown.tsx',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**/*',
    '!src/**/index.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
  verbose: true,
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/dist/',
    '/coverage/',
    '/.git/',
  ],
  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'clover',
    'html',
  ],
  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
  moduleDirectories: [
    'node_modules',
    'src',
  ],
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>/src',
  ],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // Add TypeScript file extensions to module resolution
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ],
  // Global test timeout
  testTimeout: 10000,
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(customJestConfig);
