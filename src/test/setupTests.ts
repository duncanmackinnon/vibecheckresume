import '@testing-library/jest-dom';
import 'whatwg-fetch';
import { TextDecoder, TextEncoder } from 'util';

// Mock TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock window.URL.createObjectURL
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = jest.fn(() => 'mocked-url');
  window.URL.revokeObjectURL = jest.fn();
}

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

global.IntersectionObserver = MockIntersectionObserver as any;

// Mock ResizeObserver
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

global.ResizeObserver = MockResizeObserver as any;

// Mock fetch
global.fetch = jest.fn();

// Mock console methods but keep them functional for debugging
const originalConsole = { ...console };

global.console = {
  ...console,
  log: jest.fn((...args) => originalConsole.log(...args)),
  error: jest.fn((...args) => originalConsole.error(...args)),
  warn: jest.fn((...args) => originalConsole.warn(...args)),
  info: jest.fn((...args) => originalConsole.info(...args))
};

// Mock environment variables
process.env = {
  ...process.env,
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  OPENAI_API_KEY: 'sk-test123',
  RATE_LIMIT: '10'
};

interface MockFileReaderInstance {
  readAsDataURL: jest.Mock;
  readAsText: jest.Mock;
  result?: string;
  error?: Error;
  onload: ((event: { target: MockFileReaderInstance }) => void) | null;
  onerror: ((event: { target: MockFileReaderInstance }) => void) | null;
}

// Mock file reading
const mockFileReader: MockFileReaderInstance = {
  readAsDataURL: jest.fn(),
  readAsText: jest.fn(),
  onload: null,
  onerror: null
};

class MockFileReader implements MockFileReaderInstance {
  readAsDataURL = mockFileReader.readAsDataURL;
  readAsText = mockFileReader.readAsText;
  result?: string;
  error?: Error;
  onload: ((event: { target: MockFileReaderInstance }) => void) | null = null;
  onerror: ((event: { target: MockFileReaderInstance }) => void) | null = null;

  addEventListener(event: string, callback: (event: { target: MockFileReaderInstance }) => void) {
    if (event === 'load') this.onload = callback;
    if (event === 'error') this.onerror = callback;
  }

  removeEventListener() {
    // Mock implementation
  }
}

global.FileReader = MockFileReader as any;

// Helper functions for testing
export const mockSuccessfulFileRead = (content: string) => {
  mockFileReader.readAsText.mockImplementation(function(this: MockFileReaderInstance) {
    setTimeout(() => {
      this.result = content;
      this.onload && this.onload({ target: this });
    });
  });
};

export const mockFailedFileRead = (error: string) => {
  mockFileReader.readAsText.mockImplementation(function(this: MockFileReaderInstance) {
    setTimeout(() => {
      this.error = new Error(error);
      this.onerror && this.onerror({ target: this });
    });
  });
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  
  // Reset file reader mocks
  mockFileReader.readAsText.mockReset();
  mockFileReader.readAsDataURL.mockReset();
  
  // Clean up any document body changes
  document.body.innerHTML = '';
  
  // Reset fetch mock
  (global.fetch as jest.Mock).mockReset();
});

// Custom matchers
expect.extend({
  toHaveBeenCalledWithFile(received: jest.Mock, fileName: string) {
    const calls = received.mock.calls;
    const found = calls.some(call => 
      call[0] instanceof File && call[0].name === fileName
    );
    
    return {
      pass: found,
      message: () => 
        `expected ${received.getMockName()} to ${found ? 'not ' : ''}have been called with file ${fileName}`
    };
  }
});