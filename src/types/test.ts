/**
 * Test utility types and interfaces
 */

// API Response type
export interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

// Mock Response type
export interface MockResponse<T = any> {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
  headers: Headers;
}

// Mock File type
export interface MockFile {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  slice: (start?: number, end?: number, contentType?: string) => Blob;
}

// Test utilities interface
export interface TestUtils {
  createMockFile: (name: string, type: string, content: string) => File;
  createMockResponse: <T>(data: T, status?: number) => MockResponse<T>;
  createMockAnalysis: (partial?: Partial<Analysis>) => Analysis;
  mockFetch: <T>(response: T, status?: number) => jest.Mock;
}

// Analysis type from the application
import type { Analysis } from '@/app/types';
export type { Analysis };

// Mock test context
export interface TestContext {
  mockFn: jest.Mock;
  mockConsole: {
    log: jest.SpyInstance;
    error: jest.SpyInstance;
    warn: jest.SpyInstance;
    info: jest.SpyInstance;
  };
  cleanup: () => void;
}

// Mock form data
export interface MockFormData {
  append: (name: string, value: string | Blob) => void;
  delete: (name: string) => void;
  get: (name: string) => string | File | null;
  getAll: (name: string) => Array<string | File>;
  has: (name: string) => boolean;
  set: (name: string, value: string | Blob) => void;
}

// Test environment configuration
export interface TestConfig {
  mockDelay?: number;
  mockErrors?: boolean;
  mockNetworkFailures?: boolean;
  consoleLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none';
}

// Mock API error
export interface MockApiError {
  status: number;
  message: string;
  code?: string;
  details?: Record<string, any>;
}

// Test result type
export interface TestResult<T = any> {
  success: boolean;
  data?: T;
  error?: MockApiError;
  duration: number;
}

// Mock event types
export interface MockEvent {
  preventDefault: () => void;
  stopPropagation: () => void;
  target?: any;
}

export interface MockChangeEvent extends MockEvent {
  target: {
    value: string;
    name?: string;
    type?: string;
    checked?: boolean;
  };
}

export interface MockFileEvent extends MockEvent {
  target: {
    files: File[];
  };
}

// Mock window location
export interface MockLocation {
  assign: jest.Mock;
  replace: jest.Mock;
  reload: jest.Mock;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}