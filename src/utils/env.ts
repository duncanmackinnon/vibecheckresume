/**
 * Type-safe environment configuration
 */
export const env = {
  isProduction: process.env.NODE_ENV === 'production',
  isVercel: !!process.env.VERCEL,
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',

  vercelEnv: process.env.VERCEL_ENV,
  
  api: {
    deepseek: {
      key: process.env.DEEPSEEK_API_KEY,
      isConfigured: !!process.env.DEEPSEEK_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
    }
  },

  /**
   * Validate required environment variables
   */
  validate() {
    const required = ['DEEPSEEK_API_KEY'];
    const missing = required.filter(key => !process.env[key]);

    if (this.isProduction && missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(', ')}`
      );
    }

    if (missing.length > 0) {
      console.warn(
        `Warning: Missing environment variables: ${missing.join(', ')}`
      );
    }
  },

  /**
   * Get API configuration
   */
  getApiConfig() {
    return {
      deepseek: {
        apiKey: this.api.deepseek.key,
        baseUrl: this.api.deepseek.baseUrl,
      }
    };
  },

  /**
   * Log environment configuration (safe for production)
   */
  logConfig() {
    console.log('Environment Configuration:', {
      nodeEnv: process.env.NODE_ENV,
      isProduction: this.isProduction,
      isVercel: this.isVercel,
      vercelEnv: this.vercelEnv,
      hasDeepseekKey: this.api.deepseek.isConfigured,
    });
  }
};