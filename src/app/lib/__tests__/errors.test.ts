import { OpenAI } from 'openai';
import { 
  APIError, 
  ConfigurationError, 
  ValidationError,
  formatError,
  handleOpenAIError,
  validateResume,
  validateJobDescription
} from '../errors';

describe('Error Handling', () => {
  describe('formatError', () => {
    it('formats OpenAI API errors correctly', () => {
      const error = new OpenAI.APIError(401, { message: 'Invalid key' }, 'invalid_key', {});
      expect(formatError(error)).toBe('Authentication failed. Please check your API key.');
    });

    it('formats rate limit errors', () => {
      const error = new OpenAI.APIError(429, { message: 'Too many requests' }, 'rate_limit', {});
      expect(formatError(error)).toBe('Rate limit exceeded. Please try again in a few moments.');
    });

    it('formats validation errors', () => {
      const error = new ValidationError('Invalid input');
      expect(formatError(error)).toBe('Validation Error: Invalid input');
    });

    it('formats configuration errors', () => {
      const error = new ConfigurationError('Missing API key');
      expect(formatError(error)).toBe('Configuration Error: Missing API key');
    });

    it('handles unknown errors', () => {
      expect(formatError({})).toBe('An unexpected error occurred');
    });
  });

  describe('validateResume', () => {
    it('accepts valid PDF files', () => {
      const file = new File([''], 'test.pdf', { type: 'application/pdf' });
      expect(() => validateResume(file)).not.toThrow();
    });

    it('accepts valid text files', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      expect(() => validateResume(file)).not.toThrow();
    });

    it('rejects null files', () => {
      expect(() => validateResume(null))
        .toThrow(ValidationError);
    });

    it('rejects invalid file types', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      expect(() => validateResume(file))
        .toThrow(/Invalid file type/);
    });

    it('rejects files that are too large', () => {
      const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.pdf', {
        type: 'application/pdf'
      });
      expect(() => validateResume(largeFile))
        .toThrow(/File too large/);
    });
  });

  describe('validateJobDescription', () => {
    it('accepts valid job descriptions', () => {
      const validDesc = 'This is a valid job description that meets the minimum length requirement.';
      expect(() => validateJobDescription(validDesc)).not.toThrow();
    });

    it('rejects empty descriptions', () => {
      expect(() => validateJobDescription(''))
        .toThrow(ValidationError);
      expect(() => validateJobDescription('   '))
        .toThrow(ValidationError);
    });

    it('rejects short descriptions', () => {
      expect(() => validateJobDescription('Too short'))
        .toThrow(/at least \d+ characters/);
    });

    it('rejects extremely long descriptions', () => {
      const longDesc = 'a'.repeat(5001);
      expect(() => validateJobDescription(longDesc))
        .toThrow(/cannot exceed/);
    });
  });

  describe('handleOpenAIError', () => {
    it('throws APIError for OpenAI errors', () => {
      const openAIError = new OpenAI.APIError(
        401,
        { message: 'Invalid API key' },
        'invalid_key',
        {}
      );

      expect(() => handleOpenAIError(openAIError))
        .toThrow(APIError);
    });

    it('includes status code in thrown error', () => {
      const openAIError = new OpenAI.APIError(
        429,
        { message: 'Rate limit exceeded' },
        'rate_limit',
        {}
      );

      try {
        handleOpenAIError(openAIError);
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(429);
      }
    });

    it('throws generic error for unknown errors', () => {
      const unknownError = new Error('Unknown error');
      expect(() => handleOpenAIError(unknownError))
        .toThrow('Unknown error');
    });
  });
});