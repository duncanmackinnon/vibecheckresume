declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Test environment
      NODE_ENV: 'test' | 'development' | 'production';
      CI?: string;
      JEST_WORKER_ID?: string;
      JEST_SILENT?: string;
      TEST_TIMEOUT?: string;

      // API Keys
      OPENAI_API_KEY: string;

      // Email Configuration
      SMTP_HOST?: string;
      SMTP_PORT?: string;
      SMTP_USER?: string;
      SMTP_PASS?: string;
      SMTP_SECURE?: string;
      EMAIL_RECIPIENTS?: string;

      // Slack Configuration
      SLACK_WEBHOOK_URL?: string;
      SLACK_CHANNEL?: string;

      // Quality Thresholds
      MIN_COVERAGE?: string;
      MIN_TEST_RATIO?: string;
      MAX_FLAKINESS?: string;
      QUALITY_THRESHOLD?: string;
    }
  }

  // Test Matchers
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }

  // Global Test Utilities
  interface Global {
    mockProcessExit(): {
      mockExit: jest.SpyInstance;
      restore: () => void;
    };
  }
}

export interface TestQualityConfig {
  coverage: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  };
  ratios: {
    testToCode: number;
    unitToIntegration: number;
    assertionsPerTest: number;
  };
  quality: {
    maintainability: number;
    complexity: number;
    flakiness: number;
  };
}

export interface TestReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  coverage: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
    uncovered: string[];
  };
  quality: {
    maintainability: number;
    complexity: number;
    flakiness: number;
    testToCodeRatio: number;
  };
  history: Array<{
    timestamp: string;
    hash: string;
    metrics: {
      coverage: number;
      quality: number;
    };
  }>;
}

export interface NotificationConfig {
  email?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    recipients: string[];
  };
  slack?: {
    webhookUrl: string;
    channel: string;
  };
}

export interface TestQualityMetrics {
  code: {
    total: number;
    tested: number;
    coverage: number;
  };
  tests: {
    total: number;
    passing: number;
    failing: number;
    flaky: number;
  };
  complexity: {
    cognitive: number;
    cyclomatic: number;
    maintainability: number;
  };
  trends: {
    coverage: {
      current: number;
      change: number;
      direction: 'improving' | 'declining' | 'stable';
    };
    quality: {
      current: number;
      change: number;
      direction: 'improving' | 'declining' | 'stable';
    };
  };
}

// Prevent name collisions
export {};