import { OpenAI } from 'openai';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function handleApiError(response: Response): Promise<void> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      (error as {error?: string}).error || 'API request failed',
      response.status,
      (error as {code?: string}).code
    );
  }
}

export function logError(error: unknown, context: string): void {
  if (error instanceof OpenAI.APIError) {
    console.error(`OpenAI API Error [${context}]:`, {
      status: error.status,
      message: error.message,
      code: error.code,
      type: error.type
    });
  } else if (error instanceof Error) {
    console.error(`Error [${context}]:`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
  } else {
    console.error(`Unknown Error [${context}]:`, error);
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return 'Authentication failed. Please check your API key configuration.';
    }
    if (error.status === 429) {
      return 'Rate limit exceeded. Please try again in a few moments.';
    }
    return `API Error: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

export function validateApiKey(apiKey?: string): boolean {
  if (!apiKey) return false;
  if (typeof apiKey !== 'string') return false;
  if (!apiKey.startsWith('sk-')) return false;
  if (apiKey.length < 40) return false;
  return true;
}

export function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function chunkText(text: string, maxChunkSize = 5000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  
  const paragraphs = text.split(/\n\s*\n/);
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      if (paragraph.length > maxChunkSize) {
        const words = paragraph.split(/\s+/);
        let currentWords = '';
        for (const word of words) {
          if (currentWords.length + word.length > maxChunkSize) {
            chunks.push(currentWords);
            currentWords = '';
          }
          currentWords += (currentWords ? ' ' : '') + word;
        }
        if (currentWords) {
          chunks.push(currentWords);
        }
      } else {
        chunks.push(paragraph);
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

export async function processInChunks<T>(
  text: string,
  processor: (chunk: string, index: number, total: number) => Promise<T>,
  maxChunkSize = 5000,
  parallel = false,
  concurrency = 3,
  timeoutMs = 30000
): Promise<T[]> {
  const chunks = chunkText(text, maxChunkSize);
  
  if (parallel) {
    const results: T[] = [];
    const queue = [...chunks.entries()];
    
    const worker = async () => {
      while (queue.length > 0) {
        const [index, chunk] = queue.shift()!;
        try {
          const result = await Promise.race([
            processor(chunk, index, chunks.length),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Chunk ${index + 1} timeout after ${timeoutMs}ms`)), timeoutMs)
            )
          ]) as T;
          
          results[index] = result;
        } catch (error) {
          console.error(`Error processing chunk ${index + 1}:`, error);
          throw error;
        }
      }
    };
    
    await Promise.all(Array(concurrency).fill(0).map(worker));
    return results;
  }
  
  const results: T[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const result = await Promise.race([
      processor(chunk, index, chunks.length),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Chunk ${index + 1} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]) as T;
    
    results.push(result);
  }
  return results;
}