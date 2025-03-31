declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Node environment
      NODE_ENV: 'development' | 'production' | 'test';
      
      // Application
      NEXT_PUBLIC_APP_URL: string;
      
      // Deepseek Configuration
      DEEPSEEK_API_KEY: string;
      
      // Rate Limiting
      RATE_LIMIT: string;
      
      // Database Configuration
      DB_HOST: string;
      DB_PORT: string;
      DB_NAME: string;
      DB_USER: string;
      DB_PASSWORD: string;
      DB_SSL: string;
      
      // Database Pool Configuration
      DB_POOL_MAX: string;
      DB_POOL_IDLE_TIMEOUT: string;
      DB_CONNECTION_TIMEOUT: string;

      // Health Check Configuration
      HEALTH_CHECK_INTERVAL?: string;
      HEALTH_CHECK_TIMEOUT?: string;

      // Logging Configuration
      LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
      LOG_FORMAT?: 'json' | 'pretty';

      // Security Configuration
      CORS_ORIGIN?: string;
      TRUST_PROXY?: string;
      API_RATE_LIMIT?: string;
      
      // Test Configuration
      TEST_DATABASE_URL?: string;
      MOCK_OPENAI_RESPONSES?: string;
    }
  }
}

// Environment validation types
export interface EnvVars {
  required: string[];
  optional: string[];
}

export const envVars: EnvVars = {
  required: [
    'NODE_ENV',
    'NEXT_PUBLIC_APP_URL',
    'DEEPSEEK_API_KEY',
    'RATE_LIMIT',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD'
  ],
  optional: [
    'OPENAI_ORG_ID',
    'DB_SSL',
    'DB_POOL_MAX',
    'DB_POOL_IDLE_TIMEOUT',
    'DB_CONNECTION_TIMEOUT',
    'HEALTH_CHECK_INTERVAL',
    'HEALTH_CHECK_TIMEOUT',
    'LOG_LEVEL',
    'LOG_FORMAT',
    'CORS_ORIGIN',
    'TRUST_PROXY',
    'API_RATE_LIMIT',
    'TEST_DATABASE_URL',
    'MOCK_OPENAI_RESPONSES'
  ]
};

export function validateEnv(): boolean {
  const missing = envVars.required.filter(
    (name) => !process.env[name]
  );

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    return false;
  }

  return true;
}

// This needs to be here to make this file a module
export {};