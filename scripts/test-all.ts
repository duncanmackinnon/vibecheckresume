#!/usr/bin/env ts-node
import { spawnSync } from 'child_process';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
config({ path: path.resolve(__dirname, '../.env') });

export interface TestResult {
  success: boolean;
  output: string;
  duration: number;
}

export interface TestSuite {
  name: string;
  command: string;
  args: string[];
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Unit Tests',
    command: 'npm',
    args: ['run', 'test:ci']
  },
  {
    name: 'OpenAI Integration',
    command: 'npm',
    args: ['run', 'test:openai']
  },
  {
    name: 'Error Handling',
    command: 'npm',
    args: ['run', 'test:errors']
  }
];

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatOutput(output: string): string {
  // Clean up ANSI color codes
  return output.replace(/\[[0-9;]*m/g, '');
}

export function generateReport(results: Record<string, TestResult>): string {
  const totalDuration = Object.values(results).reduce((sum, r) => sum + r.duration, 0);
  const passedTests = Object.values(results).filter(r => r.success).length;
  const totalTests = Object.keys(results).length;

  return `
Test Execution Report
====================
Date: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV}
Node Version: ${process.version}

Summary
-------
Total Suites: ${totalTests}
Passed: ${passedTests}
Failed: ${totalTests - passedTests}
Total Duration: ${formatDuration(totalDuration)}

Details
-------
${Object.entries(results)
  .map(([name, result]) => `
${name}
${'-'.repeat(name.length)}
Status: ${result.success ? 'PASS' : 'FAIL'}
Duration: ${formatDuration(result.duration)}
${result.success ? '' : `\nOutput:\n${result.output}\n`}`)
  .join('\n')}
`.trim();
}

export async function runTests(): Promise<void> {
  console.log('Starting test execution...\n');
  const results: Record<string, TestResult> = {};

  for (const suite of TEST_SUITES) {
    process.stdout.write(`Running ${suite.name}... `);
    const startTime = Date.now();

    const result = spawnSync(suite.command, suite.args, {
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    const duration = Date.now() - startTime;
    const success = result.status === 0;
    const output = formatOutput(result.stdout + result.stderr);

    results[suite.name] = {
      success,
      output,
      duration
    };

    console.log(success ? '✓' : '✗');
  }

  // Generate report
  const report = generateReport(results);
  
  // Save report to file
  const reportPath = path.resolve(__dirname, '../test-report.txt');
  fs.writeFileSync(reportPath, report);

  // Print summary
  console.log('\nTest Execution Complete');
  console.log('----------------------');
  console.log(`Report saved to: ${reportPath}`);
  
  // Exit with appropriate code
  const hasFailures = Object.values(results).some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

// Run tests if this is the main module
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}