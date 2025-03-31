#!/usr/bin/env ts-node
import { config } from 'dotenv';
import path from 'path';
import { analyzeResume } from '../src/app/lib/openai';
import { 
  validateResume, 
  validateJobDescription, 
  formatError,
  ValidationError 
} from '../src/app/lib/errors';

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

console.log('\n=== Error Handling Test Suite ===\n');

async function runTests() {
  const tests = [
    testFileValidation,
    testJobDescriptionValidation,
    testOpenAIError,
    testSuccessCase
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
      console.log(`✓ ${test.name} passed\n`);
    } catch (error) {
      failed++;
      console.error(`✗ ${test.name} failed:`, error);
      console.error('\n');
    }
  }

  console.log('=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${tests.length}\n`);

  return failed === 0;
}

async function testFileValidation() {
  console.log('Testing file validation...');

  // Test invalid file type
  const invalidFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
  try {
    validateResume(invalidFile);
    throw new Error('Should have rejected invalid file type');
  } catch (error) {
    if (!(error instanceof ValidationError) || 
        !error.message.includes('Invalid file type')) {
      throw error;
    }
  }

  // Test file too large
  const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.pdf', {
    type: 'application/pdf'
  });
  try {
    validateResume(largeFile);
    throw new Error('Should have rejected large file');
  } catch (error) {
    if (!(error instanceof ValidationError) || 
        !error.message.includes('File too large')) {
      throw error;
    }
  }

  console.log('File validation tests passed');
}

async function testJobDescriptionValidation() {
  console.log('Testing job description validation...');

  // Test empty description
  try {
    validateJobDescription('');
    throw new Error('Should have rejected empty description');
  } catch (error) {
    if (!(error instanceof ValidationError) || 
        !error.message.includes('cannot be empty')) {
      throw error;
    }
  }

  // Test too short
  try {
    validateJobDescription('Too short');
    throw new Error('Should have rejected short description');
  } catch (error) {
    if (!(error instanceof ValidationError) || 
        !error.message.includes('at least')) {
      throw error;
    }
  }

  console.log('Job description validation tests passed');
}

async function testOpenAIError() {
  console.log('Testing OpenAI error handling...');

  // Test with invalid API key
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'invalid-key';

  try {
    await analyzeResume({
      resumeText: 'Test resume',
      jobDescription: 'Test job'
    });
    throw new Error('Should have failed with invalid API key');
  } catch (error) {
    const formattedError = formatError(error);
    if (!formattedError.includes('API key')) {
      throw new Error(`Unexpected error message: ${formattedError}`);
    }
  } finally {
    process.env.OPENAI_API_KEY = originalKey;
  }

  console.log('OpenAI error handling tests passed');
}

async function testSuccessCase() {
  console.log('Testing successful analysis...');

  const validResume = `
John Doe
Software Engineer
Skills: JavaScript, React, Node.js
`;

  const validJobDescription = `
Looking for a Software Engineer with:
- JavaScript experience
- React knowledge
- Node.js background
`;

  const result = await analyzeResume({
    resumeText: validResume,
    jobDescription: validJobDescription
  });

  if (!result || typeof result !== 'object') {
    throw new Error('Invalid analysis result');
  }

  if (!('score' in result) || !('matchedSkills' in result) || !('recommendations' in result)) {
    throw new Error('Missing required fields in analysis result');
  }

  console.log('Success case test passed');
}

// Run the tests
runTests()
  .then(success => {
    if (success) {
      console.log('All tests passed successfully ✓');
      process.exit(0);
    } else {
      console.error('Some tests failed ✗');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });