require('@testing-library/jest-dom');

// Mock next/navigation hooks
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    };
  },
  useSearchParams() {
    return {
      get: jest.fn(),
      set: jest.fn(),
    };
  },
}));

// Mock File API if not available in test environment
if (typeof File === 'undefined') {
  global.File = class MockFile {
    constructor(bits, name, options = {}) {
      this.name = name;
      this.type = options.type || '';
    }
  };
}