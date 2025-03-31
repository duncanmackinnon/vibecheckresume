// Mock environment variables
process.env = {
  ...process.env,
  OPENAI_API_KEY: 'test-key',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'test@example.com',
  SMTP_PASS: 'test-password',
  SMTP_SECURE: 'true',
  EMAIL_RECIPIENTS: 'test@example.com,admin@example.com',
  SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/test',
  SLACK_CHANNEL: '#test-reports',
  NODE_ENV: 'test',
  CI: 'true',
  TEST_TIMEOUT: '5000',
  MIN_COVERAGE: '80',
  MIN_TEST_RATIO: '0.5',
  MAX_FLAKINESS: '0.1',
  QUALITY_THRESHOLD: '75'
};

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

if (process.env.JEST_SILENT) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

// Restore console after tests
afterAll(() => {
  if (process.env.JEST_SILENT) {
    global.console = originalConsole;
  }
});

// Global test timeouts
jest.setTimeout(30000);

// Mock dates
const mockDate = new Date('2025-03-25T12:00:00Z');
global.Date = class extends Date {
  constructor(...args) {
    if (args.length) {
      return super(...args);
    }
    return mockDate;
  }
};

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn()
}));

// Mock child process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn()
}));

// Global test utilities
global.mockProcessExit = () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
  return {
    mockExit,
    restore: () => mockExit.mockRestore()
  };
};

// Global matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  }
});

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Initialize test environment
process.env.JEST_WORKER_ID = '1';
process.env.JEST_SILENT = 'true';