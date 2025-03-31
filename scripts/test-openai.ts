#!/usr/bin/env ts-node
import { config } from 'dotenv';
import path from 'path';
import { analyzeResume } from '../src/app/lib/openai';
import { logError, validateApiKey } from '../src/app/lib/utils';
import type { Analysis } from '../src/app/types';

// Ensure we're in the right environment
const ENV_PATH = path.resolve(__dirname, '../.env');
config({ path: ENV_PATH });

console.log('\n=== OpenAI Integration Test ===');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Working Directory:', process.cwd());
console.log('Env File:', ENV_PATH);

// Test Data
const mockResume = `
John Doe
Software Engineer
Email: john@example.com

Technical Skills:
- JavaScript/TypeScript
- React.js & Next.js
- Node.js & Express
- REST APIs
- Git & GitHub

Experience:
Senior Software Engineer at Tech Co (2020-Present)
- Led development of a React-based dashboard used by 10k+ users
- Implemented RESTful APIs using Node.js and Express
- Reduced load times by 40% through code optimization

Software Engineer at StartUp Inc (2018-2020)
- Developed responsive web applications using React
- Integrated third-party APIs and services
- Implemented automated testing using Jest
`;

const mockJobDescription = `
Senior Frontend Engineer

Required Skills:
- 5+ years experience with JavaScript/TypeScript
- Strong proficiency in React.js
- Experience with modern frontend tools
- RESTful API integration experience
- Git version control

Preferred:
- Next.js experience
- Node.js backend experience
- Testing experience
- Leadership experience
`;

function checkEnvironment(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  
  console.log('\nEnvironment Check:');
  console.log('- OpenAI API Key:', apiKey ? '✓ Present' : '✗ Missing');
  console.log('- API Key Format:', validateApiKey(apiKey) ? '✓ Valid' : '✗ Invalid');
  
  if (!validateApiKey(apiKey)) {
    console.error('\nError: Invalid or missing OpenAI API key');
    console.log('Please ensure OPENAI_API_KEY is properly set in your .env file');
    return false;
  }
  
  return true;
}

function formatResults(result: Analysis): void {
  console.log('\n=== Analysis Results ===');
  console.log(`Match Score: ${result.score}%`);
  
  console.log('\nSkill Analysis:');
  console.log('Matched Skills:');
  result.matchedSkills
    .filter(skill => skill.match)
    .forEach(skill => console.log(`  ✓ ${skill.name}`));
  
  console.log('\nMissing Skills:');
  result.missingSkills
    .forEach(skill => console.log(`  ✗ ${skill}`));
  
  if (result.recommendations) {
    console.log('\nStrengths:');
    result.recommendations.strengths
      .forEach(strength => console.log(`  • ${strength}`));
    
    console.log('\nSuggested Improvements:');
    result.recommendations.improvements
      .forEach(improvement => console.log(`  • ${improvement}`));
  }
  
  console.log('\nDetailed Analysis:');
  console.log(result.detailedAnalysis);
}

async function runTest() {
  console.log('\nStarting analysis...');
  const startTime = Date.now();

  try {
    const result = await analyzeResume({
      resumeText: mockResume,
      jobDescription: mockJobDescription
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nAnalysis completed in ${duration}s ✓`);
    
    formatResults(result);
    return true;
  } catch (error) {
    console.error('\nAnalysis failed ✗');
    logError(error, 'OpenAI Test');
    return false;
  }
}

// Main execution
if (checkEnvironment()) {
  runTest()
    .then(success => {
      if (success) {
        console.log('\nTest completed successfully ✓');
        process.exit(0);
      } else {
        console.error('\nTest failed ✗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\nUnexpected error:', error);
      process.exit(1);
    });
} else {
  process.exit(1);
}