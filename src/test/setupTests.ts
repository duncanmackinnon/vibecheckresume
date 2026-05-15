import 'openai/shims/node';
import '@testing-library/jest-dom';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
// Robust Web Fetch polyfill for NextRequest/openai shims
(() => {
  const g: any = global;
  try {
    // Provided by Next's edge-runtime build
    const edgeFetch = require('next/dist/compiled/@edge-runtime/primitives/fetch');
    g.fetch = g.fetch || edgeFetch.fetch;
    g.Headers = g.Headers || edgeFetch.Headers;
    g.Request = g.Request || edgeFetch.Request;
    g.Response = g.Response || edgeFetch.Response;
    g.FormData = g.FormData || edgeFetch.FormData;
  } catch (_) {
    if (!g.fetch && typeof fetch !== 'undefined') g.fetch = fetch;
    if (!g.Headers && typeof Headers !== 'undefined') g.Headers = Headers;
    if (!g.Request && typeof Request !== 'undefined') g.Request = Request;
    if (!g.Response && typeof Response !== 'undefined') g.Response = Response;
    if (!g.FormData && typeof FormData !== 'undefined') g.FormData = FormData;
  }

  // Final fallback simple implementations to satisfy NextRequest if still missing
  if (!g.Request) {
    g.Request = class {
      constructor(input: any, init: any = {}) {
        const headers = g.Headers ? new g.Headers(init.headers || {}) : init.headers || {};
        Object.defineProperty(this, 'url', {
          value: typeof input === 'string' ? input : input?.url || '',
          configurable: true,
          enumerable: true
        });
        Object.defineProperty(this, 'method', {
          value: init.method || 'GET',
          configurable: true,
          enumerable: true
        });
        Object.defineProperty(this, 'headers', {
          value: headers,
          configurable: true,
          enumerable: true
        });
      }
    };
  }
  if (!g.Response) {
    g.Response = class {
      status: number;
      headers: any;
      body: any;
      constructor(body?: any, init: any = {}) {
        this.status = init.status || 200;
        this.headers = init.headers || {};
        this.body = body;
      }
      json() {
        if (typeof this.body === 'string') {
          return Promise.resolve(JSON.parse(this.body));
        }

        return Promise.resolve(this.body ?? {});
      }
      text() {
        return Promise.resolve(typeof this.body === 'string' ? this.body : JSON.stringify(this.body ?? ''));
      }
    };
  }
})();

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

// Mock fetch (spy-friendly)
global.fetch = jest.fn();

// Mock react-markdown (ESM) to avoid transformer issues in Jest
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children)
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn()
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({})
}));

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
  DEEPSEEK_API_KEY: 'test123',
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
