/** @type {import('jest').Config} */
module.exports = {
  displayName: 'scripts',
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/scripts'],
  testMatch: [
    '<rootDir>/scripts/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/scripts/**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/scripts/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageDirectory: '<rootDir>/coverage/scripts',
  collectCoverageFrom: [
    'scripts/**/*.{ts,tsx}',
    '!scripts/**/*.d.ts',
    '!scripts/**/__tests__/**',
    '!scripts/**/jest.*.{js,ts}',
    '!scripts/**/types.{js,ts}'
  ],
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/scripts/tsconfig.json'
    }
  },
  verbose: true,
  testTimeout: 10000,
  maxWorkers: '50%'
}