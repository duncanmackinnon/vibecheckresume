/**
 * Creates a promise that rejects after a specified timeout
 */
export function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
}

/**
 * Wraps a promise with a timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    timeout(ms)
  ]);
}

/**
 * Default timeouts for different environments
 */
export const TIMEOUTS = {
  // Vercel has a 10s timeout for serverless functions
  API_REQUEST: process.env.VERCEL ? 9000 : 30000,
  FILE_UPLOAD: process.env.VERCEL ? 8000 : 60000,
  ANALYSIS: process.env.VERCEL ? 8000 : 60000,
};

/**
 * Type for a function that accepts a retry count
 */
type RetryableFunction<T> = (attempt: number) => Promise<T>;

/**
 * Options for retry configuration
 */
interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeout?: number;
}

/**
 * Retries a function with exponential backoff
 */
export async function withRetry<T>(
  fn: RetryableFunction<T>,
  {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 5000,
    timeout = TIMEOUTS.API_REQUEST
  }: RetryOptions = {}
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const promise = fn(attempt);
      if (timeout) {
        return await withTimeout(promise, timeout);
      }
      return await promise;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        Math.round(baseDelay * Math.pow(1.5, attempt - 1) * (0.8 + Math.random() * 0.4)),
        maxDelay
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Operation failed after retries');
}