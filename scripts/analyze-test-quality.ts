#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface CoverageData {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface TestQualityMetrics {
  coverage: CoverageData;
  results: TestResults;
  complexity: {
    cognitive: number;
    cyclomatic: number;
    halstead: number;
  };
  maintainability: number;
  testToCodeRatio: number;
  flakiness: number;
  uncoveredLines: string[];
}

function loadCoverageData(): CoverageData {
  const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(coveragePath)) {
    throw new Error('Coverage data not found. Run tests first.');
  }

  const data = JSON.parse(fs.readFileSync(coveragePath, 'utf8')).total;
  return {
    lines: data.lines.pct,
    statements: data.statements.pct,
    functions: data.functions.pct,
    branches: data.branches.pct
  };
}

function getTestResults(): TestResults {
  const resultsPath = path.join(process.cwd(), 'test-results', 'latest.json');
  if (!fs.existsSync(resultsPath)) {
    throw new Error('Test results not found. Run tests first.');
  }

  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  return {
    total: data.numTotalTests,
    passed: data.numPassedTests,
    failed: data.numFailedTests,
    skipped: data.numPendingTests,
    duration: data.testDuration
  };
}

function calculateComplexityMetrics(): TestQualityMetrics['complexity'] {
  try {
    // Use complexity analysis tools if available
    return {
      cognitive: 0, // Placeholder for actual complexity analysis
      cyclomatic: 0,
      halstead: 0
    };
  } catch {
    return {
      cognitive: 0,
      cyclomatic: 0,
      halstead: 0
    };
  }
}

function findUncoveredLines(): string[] {
  const lcovPath = path.join(process.cwd(), 'coverage', 'lcov.info');
  if (!fs.existsSync(lcovPath)) {
    return [];
  }

  const lcov = fs.readFileSync(lcovPath, 'utf8');
  const uncovered: string[] = [];

  // Parse lcov file to find uncovered lines
  const files = lcov.split('SF:');
  files.slice(1).forEach(file => {
    const lines = file.split('\n');
    const fileName = lines[0].trim();
    let inDaSection = false;

    lines.forEach(line => {
      if (line.startsWith('DA:')) {
        inDaSection = true;
        const [_, lineNum, hits] = line.split(':')[1].split(',');
        if (hits === '0') {
          uncovered.push(`${fileName}:${lineNum}`);
        }
      } else if (inDaSection) {
        inDaSection = false;
      }
    });
  });

  return uncovered;
}

function calculateTestToCodeRatio(): number {
  try {
    const testLines = execSync(
      'find src -name "*.test.ts*" -exec wc -l {} \\; | awk \'{total += $1} END {print total}\''
    ).toString();
    
    const codeLines = execSync(
      'find src -name "*.ts*" ! -name "*.test.ts*" -exec wc -l {} \\; | awk \'{total += $1} END {print total}\''
    ).toString();

    return parseInt(testLines) / parseInt(codeLines);
  } catch {
    return 0;
  }
}

function calculateFlakiness(): number {
  try {
    // Run tests multiple times and check for inconsistencies
    const runs = 3;
    let failedRuns = 0;

    for (let i = 0; i < runs; i++) {
      try {
        execSync('npm run test:ci', { stdio: 'pipe' });
      } catch {
        failedRuns++;
      }
    }

    return failedRuns / runs;
  } catch {
    return 0;
  }
}

export function analyzeTestQuality(): TestQualityMetrics {
  const coverage = loadCoverageData();
  const results = getTestResults();
  const complexity = calculateComplexityMetrics();
  const maintainability = 100 - (complexity.cognitive * 0.2 + complexity.cyclomatic * 0.3 + complexity.halstead * 0.5);
  const testToCodeRatio = calculateTestToCodeRatio();
  const flakiness = calculateFlakiness();
  const uncoveredLines = findUncoveredLines();

  return {
    coverage,
    results,
    complexity,
    maintainability,
    testToCodeRatio,
    flakiness,
    uncoveredLines
  };
}

export function generateReport(metrics: TestQualityMetrics): string {
  const report = [
    'Test Quality Analysis Report',
    '==========================',
    '',
    'Coverage Metrics',
    '----------------',
    `Lines       : ${metrics.coverage.lines.toFixed(2)}%`,
    `Statements  : ${metrics.coverage.statements.toFixed(2)}%`,
    `Functions   : ${metrics.coverage.functions.toFixed(2)}%`,
    `Branches    : ${metrics.coverage.branches.toFixed(2)}%`,
    '',
    'Test Results',
    '------------',
    `Total Tests : ${metrics.results.total}`,
    `Passed     : ${metrics.results.passed}`,
    `Failed     : ${metrics.results.failed}`,
    `Skipped    : ${metrics.results.skipped}`,
    `Duration   : ${(metrics.results.duration / 1000).toFixed(2)}s`,
    '',
    'Quality Metrics',
    '--------------',
    `Test/Code Ratio : ${metrics.testToCodeRatio.toFixed(2)}`,
    `Maintainability : ${metrics.maintainability.toFixed(2)}`,
    `Flakiness      : ${(metrics.flakiness * 100).toFixed(2)}%`,
    '',
    'Areas for Improvement',
    '--------------------'
  ];

  if (metrics.uncoveredLines.length > 0) {
    report.push('Uncovered Lines:');
    metrics.uncoveredLines.forEach(line => report.push(`  - ${line}`));
  }

  // Add recommendations
  report.push('', 'Recommendations:', '--------------');
  
  if (metrics.coverage.lines < 80) {
    report.push('• Improve line coverage');
  }
  if (metrics.coverage.branches < 80) {
    report.push('• Add more branch coverage');
  }
  if (metrics.testToCodeRatio < 0.5) {
    report.push('• Increase test coverage ratio');
  }
  if (metrics.flakiness > 0.1) {
    report.push('• Address flaky tests');
  }
  if (metrics.maintainability < 70) {
    report.push('• Improve test maintainability');
  }

  return report.join('\n');
}

// Run analysis if executed directly
if (require.main === module) {
  try {
    const metrics = analyzeTestQuality();
    const report = generateReport(metrics);
    
    // Save report
    const outputPath = 'test-quality-report.txt';
    fs.writeFileSync(outputPath, report);
    
    console.log(report);
    console.log(`\nReport saved to ${outputPath}`);
  } catch (error) {
    console.error('Error analyzing test quality:', error);
    process.exit(1);
  }
}