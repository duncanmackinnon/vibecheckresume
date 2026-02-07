#!/usr/bin/env ts-node
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
// Skip .env loading in CI environment
if (!process.env.CI) {
  config({ path: path.resolve(__dirname, '../.env') });
}

console.log('\n=== Pre-deployment Verification ===\n');

interface VerificationResult {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
}

async function runVerification() {
  const results: VerificationResult[] = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  results.push({
    name: 'Node.js Version',
    status: majorVersion >= 16 ? 'pass' : 'fail',
    message: `Using ${nodeVersion}, required >= v16`
  });

  // Check required files
  const requiredFiles = [
    'package.json',
    'next.config.js',
    'tsconfig.json',
    'src/app/page.tsx',
    'src/app/api/analyze/route.ts',
    // .env is only required locally; Vercel/CI use env vars
    ...(process.env.CI || process.env.VERCEL ? [] : ['.env'])
  ];

  for (const file of requiredFiles) {
    const exists = fs.existsSync(path.resolve(__dirname, '..', file));
    results.push({
      name: `Required File: ${file}`,
      status: exists ? 'pass' : 'fail',
      message: exists ? undefined : 'File not found'
    });
  }

  // Check environment variables
  const requiredEnvVars = [
    'DEEPSEEK_API_KEY',
    'NODE_ENV'
  ];

  for (const envVar of requiredEnvVars) {
    let exists = process.env[envVar];
    if (process.env.CI) {
      // In CI, check if the variable is explicitly set (as GitHub Secret)
      exists = exists !== undefined ? exists :
              (envVar === 'NODE_ENV' ? 'production' : undefined);
    }
    results.push({
      name: `Environment Variable: ${envVar}`,
      status: exists ? 'pass' : 'fail',
      message: exists ? undefined : `Missing ${process.env.CI ? 'GitHub Secret' : '.env variable'}: ${envVar}`
    });
  }

  // Validate Deepseek API key exists
  const apiKey = process.env.DEEPSEEK_API_KEY;
  results.push({
    name: 'Deepseek API Key',
    status: apiKey ? 'pass' : 'fail',
    message: apiKey ? undefined : 'Missing API key'
  });

  // Check package.json dependencies
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
    );
    
    const requiredDeps = [
      'next',
      'react',
      'openai',
      'typescript'
    ];

    for (const dep of requiredDeps) {
      results.push({
        name: `Dependency: ${dep}`,
        status: packageJson.dependencies[dep] ? 'pass' : 'fail',
        message: packageJson.dependencies[dep] 
          ? undefined 
          : `Missing required dependency: ${dep}`
      });
    }
  } catch (error) {
    results.push({
      name: 'Package.json Check',
      status: 'fail',
      message: 'Failed to parse package.json'
    });
  }

  return results;
}

function printResults(results: VerificationResult[]) {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log('Verification Results:\n');

  results.forEach(result => {
    const icon = result.status === 'pass' ? '✓' : '✗';
    const color = result.status === 'pass' ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${color}${icon} ${result.name}${reset}`);
    if (result.message) {
      console.log(`  ${result.message}`);
    }
  });

  console.log('\nSummary:');
  console.log(`Total Checks  : ${results.length}`);
  console.log(`\x1b[32mPassed        : ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed        : ${failed}\x1b[0m`);

  return failed === 0;
}

// Run verification
runVerification()
  .then(results => {
    const success = printResults(results);
    if (!success) {
      console.log('\n❌ Verification failed. Please fix the issues above before deploying.');
      process.exit(1);
    }
    console.log('\n✅ All verification checks passed. Ready for deployment!');
  })
  .catch(error => {
    console.error('\nVerification failed with error:', error);
    process.exit(1);
  });
