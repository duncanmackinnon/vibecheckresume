#!/usr/bin/env ts-node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface CoverageData {
  total: {
    lines: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
  };
  [key: string]: any;
}

interface CoverageSummary {
  overall: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  };
  files: Array<{
    file: string;
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  }>;
}

function runTests(): void {
  console.log('Running tests with coverage...');
  
  const result = spawnSync('npm', ['run', 'test:ci'], {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('Tests failed');
    process.exit(1);
  }
}

function loadCoverageData(): CoverageData {
  const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-final.json');
  
  if (!fs.existsSync(coveragePath)) {
    throw new Error('Coverage data not found. Run tests first.');
  }

  return JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
}

function generateSummary(data: CoverageData): CoverageSummary {
  const summary: CoverageSummary = {
    overall: {
      lines: data.total.lines.pct,
      statements: data.total.statements.pct,
      functions: data.total.functions.pct,
      branches: data.total.branches.pct
    },
    files: []
  };

  Object.entries(data)
    .filter(([key]) => key !== 'total')
    .forEach(([file, coverage]) => {
      summary.files.push({
        file,
        lines: coverage.lines.pct,
        statements: coverage.statements.pct,
        functions: coverage.functions.pct,
        branches: coverage.branches.pct
      });
    });

  // Sort files by line coverage
  summary.files.sort((a, b) => b.lines - a.lines);

  return summary;
}

function generateReport(summary: CoverageSummary): string {
  const threshold = 80; // Minimum acceptable coverage

  const report = [
    'Test Coverage Report',
    '===================',
    '',
    'Overall Coverage',
    '---------------',
    `Lines      : ${formatPercentage(summary.overall.lines)}`,
    `Statements : ${formatPercentage(summary.overall.statements)}`,
    `Functions  : ${formatPercentage(summary.overall.functions)}`,
    `Branches   : ${formatPercentage(summary.overall.branches)}`,
    '',
    'Files Below Threshold',
    '-------------------'
  ];

  const lowCoverageFiles = summary.files.filter(file => 
    file.lines < threshold ||
    file.statements < threshold ||
    file.functions < threshold ||
    file.branches < threshold
  );

  if (lowCoverageFiles.length === 0) {
    report.push('All files meet minimum coverage threshold! 🎉');
  } else {
    lowCoverageFiles.forEach(file => {
      report.push(`\n${file.file}:`);
      report.push(`  Lines      : ${formatPercentage(file.lines)}`);
      report.push(`  Statements : ${formatPercentage(file.statements)}`);
      report.push(`  Functions  : ${formatPercentage(file.functions)}`);
      report.push(`  Branches   : ${formatPercentage(file.branches)}`);
    });
  }

  report.push('\nTest Results by Directory');
  report.push('----------------------');

  const byDirectory = groupByDirectory(summary.files);
  Object.entries(byDirectory).forEach(([dir, files]) => {
    const avgCoverage = calculateAverageCoverage(files);
    report.push(`\n${dir}:`);
    report.push(`  Average Coverage: ${formatPercentage(avgCoverage)}%`);
    report.push(`  Files: ${files.length}`);
  });

  return report.join('\n');
}

function formatPercentage(value: number): string {
  const formatted = value.toFixed(2);
  const color = value >= 80 ? '[32m' : value >= 60 ? '[33m' : '[31m';
  return `${color}${formatted}%[0m`;
}

function groupByDirectory(files: CoverageSummary['files']): Record<string, typeof files> {
  return files.reduce((acc, file) => {
    const dir = path.dirname(file.file);
    acc[dir] = acc[dir] || [];
    acc[dir].push(file);
    return acc;
  }, {} as Record<string, typeof files>);
}

function calculateAverageCoverage(files: CoverageSummary['files']): number {
  const sum = files.reduce((acc, file) => acc + file.lines, 0);
  return sum / files.length;
}

function saveSummary(summary: CoverageSummary): void {
  const coverageDir = path.join(process.cwd(), 'coverage');
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(coverageDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

async function main() {
  try {
    runTests();
    const data = loadCoverageData();
    const summary = generateSummary(data);
    const report = generateReport(summary);
    
    // Save summary data
    saveSummary(summary);

    // Save report
    fs.writeFileSync('coverage-report.txt', report);
    console.log('\nCoverage report generated successfully!');
    console.log('See coverage-report.txt for details');

    // Exit with error if coverage is below threshold
    const hasLowCoverage = Object.values(summary.overall).some(value => value < 80);
    process.exit(hasLowCoverage ? 1 : 0);
  } catch (error) {
    console.error('Error generating coverage report:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}