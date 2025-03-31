import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TestConfig, TestContext, MockEvent, MockChangeEvent, MockFileEvent } from '@/types/test';
import { createTestContext } from './utils';

/**
 * Setup test environment with common mocks and utilities
 */
export function setupTest(config?: Partial<TestConfig>): TestContext {
  // Reset any previous test state
  cleanup();
  
  // Clear mocks
  jest.clearAllMocks();
  
  // Reset fetch mock
  global.fetch = jest.fn();
  
  // Create test context with provided config
  return createTestContext({
    mockDelay: 0,
    mockErrors: false,
    mockNetworkFailures: false,
    consoleLevel: 'error',
    ...config
  });
}

/**
 * Custom render function with common providers and utilities
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: { initialState?: any; route?: string } = {}
) {
  // Setup window location mock
  const pushSpy = jest.fn();
  const replaceSpy = jest.fn();
  
  Object.defineProperty(window, 'location', {
    value: {
      pathname: options.route || '/',
      search: '',
      hash: '',
      push: pushSpy,
      replace: replaceSpy
    },
    writable: true
  });

  // Create user event instance
  const user = userEvent.setup();

  return {
    user,
    pushSpy,
    replaceSpy,
    ...render(ui),
  };
}

/**
 * Mock file upload event
 */
export function createFileUploadEvent(files: File[]): MockFileEvent {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: {
      files
    }
  };
}

/**
 * Mock change event
 */
export function createChangeEvent(value: string): MockChangeEvent {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: {
      value,
      type: 'text'
    }
  };
}

/**
 * Wait for component updates
 */
export async function waitForComponentUpdate(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Mock response stream
 */
export function createMockStream(chunks: string[]): ReadableStream {
  let index = 0;
  
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      
      const chunk = chunks[index++];
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(chunk));
    },
  });
}

/**
 * Create a mock form submission event
 */
export function createSubmitEvent(): MockEvent {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  };
}

/**
 * Mock local storage
 */
export function mockLocalStorage() {
  const store: Record<string, string> = {};
  
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
  };
}

/**
 * Mock resize observer
 */
export function mockResizeObserver() {
  return {
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  };
}

/**
 * Mock intersection observer
 */
export function mockIntersectionObserver() {
  return {
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  };
}

/**
 * Create a mock HTML element with specific attributes
 */
export function createMockElement(tagName: string, attributes: Record<string, string> = {}) {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}