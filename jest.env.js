// Ensure tests run in development mode regardless of external NODE_ENV
process.env.NODE_ENV = 'test';
// Avoid hitting real OpenAI during tests
process.env.MOCK_OPENAI_RESPONSES = 'true';
