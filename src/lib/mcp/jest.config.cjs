module.exports = {
  rootDir: '../../..',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testMatch: ['<rootDir>/src/lib/assistant/__tests__/**/*.test.ts', '<rootDir>/src/lib/mcp/__tests__/**/*.test.ts', '<rootDir>/src/lib/discovery/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { target: 'ES2022', module: 'commonjs', esModuleInterop: true, jsx: 'react-jsx' }, diagnostics: false }] },
  clearMocks: true,
};
