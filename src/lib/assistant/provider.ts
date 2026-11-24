import OpenAI from 'openai';
import { TrackerError } from '@/lib/tracker/errors';

export interface InteractiveProvider {
  client: OpenAI;
  model: string;
  provider: 'platform';
}

/** Website AI explicitly uses the deployment's API provider; MCP does not grant inference credentials. */
export async function interactiveProvider(_ownerId: string, capability: 'assistant' | 'web_search' = 'assistant'): Promise<InteractiveProvider> {
  if (!process.env.OPENAI_API_KEY) throw new TrackerError('Website AI is not configured. You can still manage applications and saved resumes.', 503, 'PLATFORM_AI_UNCONFIGURED');
  return {
    provider: 'platform',
    model: capability === 'web_search' ? process.env.OPENAI_DISCOVERY_MODEL || 'gpt-5.5' : process.env.OPENAI_ASSISTANT_MODEL || 'gpt-5.6-terra',
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1', timeout: 120000, maxRetries: 0 }),
  };
}

export async function interactiveProviderError(_ownerId: string, cause: unknown): Promise<TrackerError> {
  if (cause instanceof TrackerError) return cause;
  const error = cause as { status?: number; code?: string } | null;
  if (error?.status === 429) return new TrackerError('The website AI service reached its usage limit. Try again later. Your applications and saved resumes are still available.', 429, 'PLATFORM_AI_LIMIT');
  if (error?.code === 'unsupported_tool') return new TrackerError('This website AI model does not support the requested search capability. You can add a job manually from its posting.', 400, 'PLATFORM_AI_UNSUPPORTED_CAPABILITY');
  return new TrackerError('Website AI is temporarily unavailable. Try again later. Your applications and saved resumes are still available.', 503, 'PLATFORM_AI_UNAVAILABLE');
}
