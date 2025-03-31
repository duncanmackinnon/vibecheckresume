import { validateEnvironment, formatValidationErrors } from '../validateEnv';
import type { ValidationError } from '../validateEnv';

describe('Environment Validation', () => {
  const originalEnv = { ...process.env };
  let mockEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Set up mock environment
    mockEnv = {
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      DEEPSEEK_API_KEY: 'test123',
      RATE_LIMIT: '10',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'test_db',
      DB_USER: 'test_user',
      DB_PASSWORD: 'test_password'
    };

    // Mock process.env
    jest.replaceProperty(process, 'env', mockEnv as NodeJS.ProcessEnv);
  });

  afterAll(() => {
    // Restore original environment
    jest.replaceProperty(process, 'env', originalEnv);
  });

  describe('validateEnvironment', () => {
    it('should return valid for correct configuration', () => {
      const result = validateEnvironment();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required variables', () => {
      mockEnv.DEEPSEEK_API_KEY = undefined;
      mockEnv.DB_HOST = undefined;

      const result = validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'missing',
        variables: ['DEEPSEEK_API_KEY', 'DB_HOST']
      } satisfies ValidationError);
    });

    it('should validate OpenAI API key format', () => {
      mockEnv.DEEPSEEK_API_KEY = 'invalid-key';

      const result = validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'invalid',
        variables: ['DEEPSEEK_API_KEY']
      } satisfies ValidationError);
    });

    it('should validate numeric values', () => {
      mockEnv.RATE_LIMIT = 'not-a-number';
      mockEnv.DB_PORT = 'invalid';

      const result = validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'invalid',
        variables: ['RATE_LIMIT', 'DB_PORT']
      } satisfies ValidationError);
    });

    it('should validate boolean values', () => {
      mockEnv.DB_SSL = 'not-a-boolean';

      const result = validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'invalid',
        variables: ['DB_SSL']
      } satisfies ValidationError);
    });

    it('should validate URL format', () => {
      mockEnv.NEXT_PUBLIC_APP_URL = 'invalid-url';

      const result = validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'invalid',
        variables: ['NEXT_PUBLIC_APP_URL']
      } satisfies ValidationError);
    });

    it('should validate enum values', () => {
      mockEnv.NODE_ENV = 'invalid' as any;
      mockEnv.LOG_LEVEL = 'invalid' as any;

      const result = validateEnvironment();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        type: 'invalid',
        variables: ['NODE_ENV', 'LOG_LEVEL']
      } satisfies ValidationError);
    });
  });

  describe('formatValidationErrors', () => {
    it('should format missing variable errors', () => {
      const errors: ValidationError[] = [{
        type: 'missing',
        variables: ['DEEPSEEK_API_KEY', 'DB_HOST']
      }];

      const formatted = formatValidationErrors(errors);
      expect(formatted).toContain('Missing required environment variables: DEEPSEEK_API_KEY, DB_HOST');
    });

    it('should format invalid value errors', () => {
      const errors: ValidationError[] = [{
        type: 'invalid',
        variables: ['NODE_ENV', 'RATE_LIMIT']
      }];

      const formatted = formatValidationErrors(errors);
      expect(formatted).toContain('Invalid values for environment variables: NODE_ENV, RATE_LIMIT');
    });

    it('should handle multiple error types', () => {
      const errors: ValidationError[] = [
        {
          type: 'missing',
          variables: ['DEEPSEEK_API_KEY']
        },
        {
          type: 'invalid',
          variables: ['NODE_ENV']
        }
      ];

      const formatted = formatValidationErrors(errors);
      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toContain('Missing required environment variables: DEEPSEEK_API_KEY');
      expect(formatted[1]).toContain('Invalid values for environment variables: NODE_ENV');
    });
  });
});