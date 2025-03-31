import '@testing-library/jest-dom';
import { loadEnvConfig } from '@next/env';
import { TextDecoder, TextEncoder } from 'util';

// Load environment variables
loadEnvConfig(process.cwd());

// Polyfill TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Extended matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledWithFile: (fileName: string) => R;
      toHaveValidApiResponse: () => R;
      toBeValidAnalysis: () => R;
    }
  }
}

// Custom matchers for API responses
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
  },

  toHaveValidApiResponse(received) {
    const hasStatus = received && typeof received.status !== 'undefined';
    const hasData = received && typeof received.data !== 'undefined';
    const hasHeaders = received && typeof received.headers !== 'undefined';
    
    return {
      pass: hasStatus && hasData && hasHeaders,
      message: () =>
        `expected response to ${
          hasStatus && hasData && hasHeaders ? 'not ' : ''
        }have valid API structure`
    };
  },

  toBeValidAnalysis(received) {
    const hasScore = received && typeof received.score === 'number';
    const hasMatchedSkills = received && Array.isArray(received.matchedSkills);
    const hasMissingSkills = received && Array.isArray(received.missingSkills);
    const hasRecommendations = received && typeof received.recommendations === 'object';
    const hasDetailedAnalysis = received && typeof received.detailedAnalysis === 'string';
    
    return {
      pass: hasScore && hasMatchedSkills && hasMissingSkills && hasRecommendations && hasDetailedAnalysis,
      message: () =>
        `expected object to ${
          hasScore && hasMatchedSkills && hasMissingSkills && hasRecommendations && hasDetailedAnalysis
            ? 'not '
            : ''
        }be a valid analysis result`
    };
  }
});

// Mock console methods but keep them functional
const originalConsole = { ...console };

global.console = {
  ...console,
  log: jest.fn((...args) => originalConsole.log(...args)),
  error: jest.fn((...args) => originalConsole.error(...args)),
  warn: jest.fn((...args) => originalConsole.warn(...args)),
  info: jest.fn((...args) => originalConsole.info(...args))
};

// Global test timeouts
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});