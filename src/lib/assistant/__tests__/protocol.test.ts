import { readFrames } from '../protocol';

it('buffers incomplete network frames without losing streamed text', () => {
  const first = readFrames('{"type":"delta","text":"Hello"}\n{"type":"del');
  expect(first.events).toEqual([{ type: 'delta', text: 'Hello' }]);
  const second = readFrames(first.remainder + 'ta","text":" world"}\n{"type":"done","messageId":"1"}\n');
  expect(second.events).toEqual([{ type: 'delta', text: ' world' }, { type: 'done', messageId: '1' }]);
  expect(second.remainder).toBe('');
});

it('surfaces malformed frames instead of silently dropping data', () => {
  expect(() => readFrames('not-json\n')).toThrow();
});
