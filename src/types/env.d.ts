declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DEEPSEEK_API_KEY: string;
      NODE_ENV: 'development' | 'production' | 'test';
      VERCEL_ENV?: 'production' | 'preview' | 'development';
      VERCEL?: string;
    }
  }
}

// This needs to be a module
export {};