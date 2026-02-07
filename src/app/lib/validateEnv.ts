const envVars = {
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

export interface ValidationError {
  type: 'missing' | 'invalid';
  variables: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export function validateEnvironment(): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Check for missing required variables
  const missing = envVars.required.filter(name => !process.env[name]);
  if (missing.length > 0) {
    errors.push({
      type: 'missing',
      variables: missing
    });
  }

  // Validate Deepseek API Key exists
  if (!process.env.DEEPSEEK_API_KEY) {
    errors.push({
      type: 'missing',
      variables: ['DEEPSEEK_API_KEY']
    });
  } else {
    const key = process.env.DEEPSEEK_API_KEY;
    const looksValid = /[0-9]/.test(key) && key.length >= 6;
    if (!looksValid) {
    errors.push({
      type: 'invalid',
      variables: ['DEEPSEEK_API_KEY']
    });
  }
  }

  // Validate numeric values
  const numericVars = [
    'RATE_LIMIT',
    'DB_PORT',
    'DB_POOL_MAX',
    'DB_POOL_IDLE_TIMEOUT',
    'DB_CONNECTION_TIMEOUT'
  ];

  const invalidNumeric = numericVars
    .filter(name => {
      const value = process.env[name];
      return value && isNaN(Number(value));
    });

  if (invalidNumeric.length > 0) {
    errors.push({
      type: 'invalid',
      variables: invalidNumeric
    });
  }

  // Validate boolean values
  const booleanVars = ['DB_SSL', 'TRUST_PROXY'];
  const invalidBoolean = booleanVars
    .filter(name => {
      const value = process.env[name];
      return value && !['true', 'false'].includes(value.toLowerCase());
    });

  if (invalidBoolean.length > 0) {
    errors.push({
      type: 'invalid',
      variables: invalidBoolean
    });
  }

  // Validate URL format
  const urlVars = ['NEXT_PUBLIC_APP_URL'];
  const invalidUrls = urlVars
    .filter(name => {
      const value = process.env[name];
      if (!value) return false;
      try {
        new URL(value);
        return false;
      } catch {
        return true;
      }
    });

  if (invalidUrls.length > 0) {
    errors.push({
      type: 'invalid',
      variables: invalidUrls
    });
  }

  // Validate enum values
  const enumValidations: Record<string, string[]> = {
    NODE_ENV: ['development', 'production', 'test'],
    LOG_LEVEL: ['debug', 'info', 'warn', 'error'],
    LOG_FORMAT: ['json', 'pretty']
  };

  const invalidEnums = Object.entries(enumValidations)
    .filter(([name, validValues]) => {
      const value = process.env[name];
      return value && !validValues.includes(value);
    })
    .map(([name]) => name);

  if (invalidEnums.length > 0) {
    errors.push({
      type: 'invalid',
      variables: invalidEnums
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.map(error => {
    const variables = error.variables.join(', ');
    switch (error.type) {
      case 'missing':
        return `Missing required environment variables: ${variables}`;
      case 'invalid':
        return `Invalid values for environment variables: ${variables}`;
      default:
        return `Unknown error with environment variables: ${variables}`;
    }
  });
}

export function validateAndLogEnvironment(): boolean {
  console.log('Validating environment configuration...');
  
  const { isValid, errors } = validateEnvironment();
  
  if (!isValid) {
    console.error('Environment validation failed:');
    formatValidationErrors(errors).forEach(error => {
      console.error(`  ✗ ${error}`);
    });
    return false;
  }

  console.log('✓ Environment configuration is valid');
  
  // Log non-sensitive configuration details in development
  if (process.env.NODE_ENV === 'development') {
    console.log('\nConfiguration:');
    console.log(`  • Environment: ${process.env.NODE_ENV}`);
    console.log(`  • API URL: ${process.env.NEXT_PUBLIC_APP_URL}`);
    console.log(`  • Rate Limit: ${process.env.RATE_LIMIT} requests/minute`);
    console.log(`  • Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log(`  • SSL Enabled: ${process.env.DB_SSL || false}`);
    console.log(`  • Pool Size: ${process.env.DB_POOL_MAX || 'default'}`);
  }

  return true;
}
