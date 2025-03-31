#!/usr/bin/env ts-node
import { spawnSync } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

interface TestConfig {
  patterns: string[];
  command: string;
  description: string;
}

// Configuration for different test suites
const testSuites: Record<string, TestConfig> = {
  components: {
    patterns: ['src/components/'],
    command: 'jest src/components',
    description: 'Component tests'
  },
  api: {
    patterns: ['src/app/api/'],
    command: 'jest src/app/api',
    description: 'API endpoint tests'
  },
  utils: {
    patterns: ['src/app/lib/'],
    command: 'jest src/app/lib',
    description: 'Utility function tests'
  },
  openai: {
    patterns: ['src/app/lib/openai'],
    command: 'npm run test:openai',
    description: 'OpenAI integration tests'
  },
  errors: {
    patterns: ['src/app/lib/errors'],
    command: 'npm run test:errors',
    description: 'Error handling tests'
  }
};

/**
 * Get changed files from git
 */
function getChangedFiles(): string[] {
  try {
    const result = execSync('git diff --name-only HEAD').toString().trim();
    return result.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting changed files:', error);
    return [];
  }
}

/**
 * Determine which test suites to run based on changed files
 */
function getTestSuitesToRun(changedFiles: string[]): TestConfig[] {
  const suitesToRun = new Set<TestConfig>();

  changedFiles.forEach(file => {
    Object.values(testSuites).forEach(suite => {
      if (suite.patterns.some(pattern => file.startsWith(pattern))) {
        suitesToRun.add(suite);
      }
    });
  });

  return Array.from(suitesToRun);
}

/**
 * Run specified test suites
 */
function runTestSuites(suites: TestConfig[]): boolean {
  if (suites.length === 0) {
    console.log('No relevant test suites to run.');
    return true;
  }

  console.log('\nRunning targeted test suites:');
  console.log('-----------------------------');

  let allPassed = true;

  suites.forEach(suite => {
    console.log(`\nRunning ${suite.description}...`);
    
    const result = spawnSync('npm', ['run', suite.command], {
      stdio: 'inherit',
      shell: true
    });

    if (result.status !== 0) {
      console.error(`❌ ${suite.description} failed`);
      allPassed = false;
    } else {
      console.log(`✓ ${suite.description} passed`);
    }
  });

  return allPassed;
}

/**
 * Save test results to file
 */
function saveTestResults(suites: TestConfig[], success: boolean): void {
  const timestamp = new Date().toISOString();
  const results = {
    timestamp,
    success,
    suites: suites.map(s => s.description),
    changedFiles: getChangedFiles()
  };

  const resultsDir = path.join(process.cwd(), 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultsPath = path.join(resultsDir, `targeted-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
}

/**
 * Main function
 */
async function main() {
  // Check if specific suites are requested
  const requestedSuites = process.argv.slice(2);
  let suitesToRun: TestConfig[];

  if (requestedSuites.length > 0) {
    suitesToRun = requestedSuites
      .map(name => testSuites[name])
      .filter(Boolean);

    if (suitesToRun.length === 0) {
      console.error('No valid test suites specified.');
      console.log('\nAvailable test suites:');
      Object.entries(testSuites).forEach(([name, suite]) => {
        console.log(`  ${name}: ${suite.description}`);
      });
      process.exit(1);
    }
  } else {
    // Determine suites based on changed files
    const changedFiles = getChangedFiles();
    suitesToRun = getTestSuitesToRun(changedFiles);
  }

  console.log(`Found ${suitesToRun.length} relevant test suite(s)`);
  
  const success = runTestSuites(suitesToRun);
  saveTestResults(suitesToRun, success);

  process.exit(success ? 0 : 1);
}

// Run if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });
}

export {
  getChangedFiles,
  getTestSuitesToRun,
  runTestSuites,
  saveTestResults
};