declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DEEPSEEK_API_KEY?: string;
      OPENAI_API_KEY?: string;
      OPENAI_ASSISTANT_MODEL?: string;
      OPENAI_DISCOVERY_MODEL?: string;
      DISCOVERY_DAILY_LIMIT?: string;
      NODE_ENV: 'development' | 'production' | 'test';
      VERCEL_ENV?: 'production' | 'preview' | 'development';
      VERCEL?: string;
    }
  }
}

// This needs to be a module
export {};
