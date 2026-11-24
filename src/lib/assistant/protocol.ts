export type AssistantEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'completed' | 'failed'; label: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };

/** NDJSON frames can cross network chunks; retain the final incomplete line. */
export function readFrames(buffer: string): { events: AssistantEvent[]; remainder: string } {
  const lines = buffer.split('\n');
  const remainder = lines.pop() ?? '';
  const events = lines.filter(Boolean).map((line) => JSON.parse(line) as AssistantEvent);
  return { events, remainder };
}
