#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { TestQualityConfig, NotificationConfig } from './types/test-config';

interface SetupConfig {
  quality: TestQualityConfig;
  notifications: NotificationConfig;
  dependencies: string[];
  devDependencies: string[];
}

const config: SetupConfig = {
  quality: {
    coverage: {
      lines: 80,
      statements: 80,
      functions: 85,
      branches: 75
    },
    ratios: {
      testToCode: 0.5,
      unitToIntegration: 2.0,
      assertionsPerTest: 3.0
    },
    quality: {
      maintainability: 70,
      complexity: 15,
      flakiness: 0.01
    }
  },
  notifications: {
    email: {
      host: 'smtp.example.com',
      port: 587,
      secure: true,
      auth: {
        user: 'test@example.com',
        pass: 'placeholder'
      },
      recipients: ['team@example.com']
    },
    slack: {
      webhookUrl: 'https://hooks.slack.com/services/your/webhook/url',
      channel: '#test-reports'
    }
  },
  dependencies: [
    'nodemailer',
    '@slack/webhook'
  ],
  devDependencies: [
    '@types/jest',
    '@types/node',
    '@types/nodemailer',
    'jest',
    'jest-environment-jsdom',
    'jest-junit',
    'ts-jest',
    'typescript'
  ]
};

async function setupTestEnvironment() {
  console.log('\nSetting up test environment...\n');

  // Create necessary directories
  const dirs = [
    'coverage',
    'test-results',
    'reports',
    'scripts/__tests__',
    'scripts/utils/__tests__'
  ];

  dirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });

  // Install dependencies
  console.log('\nInstalling dependencies...');
  
  const deps = config.dependencies.join(' ');
  const devDeps = config.devDependencies.join(' ');

  try {
    execSync(`npm install ${deps}`, { stdio: 'inherit' });
    execSync(`npm install -D ${devDeps}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Error installing dependencies:', error);
    process.exit(1);
  }

  // Create or update .env file
  const envPath = path.join(process.cwd(), '.env');
  const envExample = path.join(process.cwd(), '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExample)) {
      fs.copyFileSync(envExample, envPath);
    } else {
      const envContent = [
        '# Test Configuration',
        'NODE_ENV=development',
        'TEST_TIMEOUT=5000',
        '',
        '# Quality Thresholds',
        'MIN_COVERAGE=80',
        'MIN_TEST_RATIO=0.5',
        'MAX_FLAKINESS=0.01',
        'QUALITY_THRESHOLD=75',
        '',
        '# Email Configuration',
        'SMTP_HOST=smtp.example.com',
        'SMTP_PORT=587',
        'SMTP_USER=your-email@example.com',
        'SMTP_PASS=your-password',
        'SMTP_SECURE=true',
        'EMAIL_RECIPIENTS=team@example.com,admin@example.com',
        '',
        '# Slack Configuration',
        'SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url',
        'SLACK_CHANNEL=#test-reports'
      ].join('\n');

      fs.writeFileSync(envPath, envContent);
    }
    console.log('Created .env file');
  }

  // Update package.json scripts if needed
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const newScripts = {
    'test:setup': 'ts-node scripts/setup-test-env.ts',
    'test:verify': 'ts-node scripts/verify-test-quality.ts',
    'test:report': 'ts-node scripts/generate-weekly-report.ts',
    'ci:test': 'npm run test:ci && npm run test:verify'
  };

  pkg.scripts = { ...pkg.scripts, ...newScripts };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('Updated package.json scripts');

  // Create quality standards file if it doesn't exist
  const qualityPath = path.join(process.cwd(), 'docs', 'QUALITY_STANDARDS.md');
  if (!fs.existsSync(qualityPath)) {
    const qualityContent = `# Test Quality Standards

## Coverage Requirements

| Metric     | Minimum | Target |
|------------|---------|--------|
| Lines      | ${config.quality.coverage.lines}%     | 90%    |
| Functions  | ${config.quality.coverage.functions}%     | 95%    |
| Branches   | ${config.quality.coverage.branches}%     | 85%    |

## Test Ratios

| Metric               | Minimum | Target |
|---------------------|---------|--------|
| Test/Code Ratio     | ${config.quality.ratios.testToCode}     | 0.7    |
| Unit/Integration    | ${config.quality.ratios.unitToIntegration}     | 3.0    |
| Assertions/Test     | ${config.quality.ratios.assertionsPerTest}     | 5.0    |

## Quality Thresholds

| Metric           | Minimum | Target |
|-----------------|---------|--------|
| Maintainability | ${config.quality.quality.maintainability}      | 85     |
| Complexity      | N/A     | ${config.quality.quality.complexity}     |
| Flakiness       | N/A     | ${config.quality.quality.flakiness * 100}%    |`;

    fs.writeFileSync(qualityPath, qualityContent);
    console.log('Created quality standards documentation');
  }

  console.log('\nTest environment setup complete!\n');
  console.log('Next steps:');
  console.log('1. Configure your .env file with proper credentials');
  console.log('2. Run `npm run test:verify` to check your setup');
  console.log('3. Run `npm run test:report` to generate your first report');
}

// Run setup if executed directly
if (require.main === module) {
  setupTestEnvironment().catch(error => {
    console.error('Error setting up test environment:', error);
    process.exit(1);
  });
}

export { setupTestEnvironment, type SetupConfig };