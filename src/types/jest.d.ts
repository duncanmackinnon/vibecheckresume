/// <reference types="jest" />

declare namespace jest {
  interface Matchers<R> {
    /**
     * Check if a mock function was called with a file of a specific name
     * @param fileName - The expected file name
     */
    toHaveBeenCalledWithFile(fileName: string): R;

    /**
     * Check if an object matches the structure of a valid API response
     */
    toHaveValidApiResponse(): R;

    /**
     * Check if an object matches the structure of a valid analysis result
     */
    toBeValidAnalysis(): R;
  }
}

// Extended expect interface
declare module '@jest/expect' {
  interface AsymmetricMatchers {
    toHaveBeenCalledWithFile(fileName: string): void;
    toHaveValidApiResponse(): void;
    toBeValidAnalysis(): void;
  }
}

// API Response type
interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

// Analysis Result type
interface AnalysisResult {
  score: number;
  matchedSkills: Array<{
    name: string;
    match: boolean;
  }>;
  missingSkills: string[];
  recommendations: {
    improvements: string[];
    strengths: string[];
    skillGaps: string[];
    format: string[];
  };
  detailedAnalysis: string;
}

// Mock types
declare global {
  namespace NodeJS {
    interface Global {
      fetch: jest.Mock;
      TextEncoder: typeof TextEncoder;
      TextDecoder: typeof TextDecoder;
      FileReader: new () => FileReader;
      URL: {
        createObjectURL: jest.Mock;
        revokeObjectURL: jest.Mock;
      };
    }
  }

  interface Window {
    fetch: jest.Mock;
    URL: {
      createObjectURL: jest.Mock;
      revokeObjectURL: jest.Mock;
    };
  }
}

// Helper types for testing
type MockResponse<T = any> = {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
  headers: Headers;
};

type MockFile = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  slice: (start?: number, end?: number, contentType?: string) => Blob;
};

// Test utilities
interface TestUtils {
  createMockFile: (name: string, type: string, content: string) => File;
  createMockResponse: <T>(data: T, status?: number) => MockResponse<T>;
  createMockAnalysis: (partial?: Partial<AnalysisResult>) => AnalysisResult;
  mockFetch: <T>(response: T, status?: number) => jest.Mock;
}

declare global {
  const testUtils: TestUtils;
}