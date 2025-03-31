#!/usr/bin/env ts-node
import { config } from 'dotenv';
import path from 'path';
import { validateApiKey } from '../src/app/lib/utils';

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

console.log('\n=== Environment Setup Verification ===\n');

// Check Node.js version
const nodeVersion = process.version;
console.log('Node.js Version:', nodeVersion);
if (nodeVersion.startsWith('v16') || nodeVersion.startsWith('v18') || nodeVersion.startsWith('v20')) {
  console.log('✓ Node.js version compatible');
} else {
  console.warn('⚠ Recommended Node.js version is 16.x, 18.x or 20.x');
}

// Check environment variables
console.log('\nEnvironment Variables:');
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('✗ OPENAI_API_KEY is missing');
  process.exit(1);
}

if (!validateApiKey(apiKey)) {
  console.error('✗ OPENAI_API_KEY is invalid (should start with "sk-" and be at least 40 characters)');
  process.exit(1);
}

console.log('✓ OPENAI_API_KEY is configured');
console.log(`✓ API Key format is valid (starts with sk-****${apiKey.slice(-4)})`);

// Check for required files
const requiredFiles = [
  '../.env',
  '../package.json',
  '../src/app/lib/openai.ts',
  '../src/app/lib/utils.ts',
  './test-openai.ts'
];

console.log('\nChecking Required Files:');
for (const file of requiredFiles) {
  try {
    require.resolve(path.resolve(__dirname, file));
    console.log(`✓ ${file} exists`);
  } catch (error) {
    console.error(`✗ ${file} is missing`);
    process.exit(1);
  }
}

// Print setup instructions if needed
console.log('\nSetup Instructions:');
console.log('1. Ensure all dependencies are installed:');
console.log('   npm install');
console.log('\n2. Run the OpenAI integration test:');
console.log('   npm run test:openai');

console.log('\n=== Setup Verification Complete ===');
console.log('✓ Environment is properly configured\n');