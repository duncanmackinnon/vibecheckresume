#!/usr/bin/env ts-node
import { analyzeTestQuality } from './analyze-test-quality';
import { analyzeTrends } from './analyze-test-trends';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface QualityStandards {
  coverage: {
    lines: { min: number; target: number; critical: number };
    functions: { min: number; target: number; critical: number };
    branches: { min: number; target: number; critical: number };
    statements: { min: number; target: number; critical: number };
  };
  ratios: {
    testToCode: { min: number; target: number };
    unitToIntegration: { min: number; target: number; max: number };
    assertionsPerTest: { min: number; target: number; max: number };
    testFilesToSource: { min: number; target: number };
  };
  quality: {
    maintainability: { min: number; target: number };
    complexity: { max: number };
    flakiness: { max: number };
    testDuration: { target: number; max: number };
  };
}

interface VerificationResult {
  passed: boolean;
  critical: boolean;
  metrics: {
    actual: Record<string, number>;
    required: Record<string, number>;
  };
  violations: Array<{
    metric: string;
    actual: number;
    required: number;
    severity: 'critical' | 'warning' | 'info';
  }>;
  recommendations: string[];
}

// Load quality standards from docs
function loadStandards(): QualityStandards {
  const standardsPath = path.join(process.cwd(), 'docs', 'QUALITY_STANDARDS.md');
  const content = fs.readFileSync(standardsPath, 'utf8');
  
  // Parse the markdown tables to extract standards
  const tables = content.match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g) || [];
  const standards: any = {
    coverage: {},
    ratios: {},
    quality: {}
  };

  let currentSection = '';
  tables.forEach(table => {
    if (table.includes('Lines')) currentSection = 'coverage';
    if (table.includes('Test/Code')) currentSection = 'ratios';
    if (table.includes('Maintainability')) currentSection = 'quality';

    const [metric, min, target, max] = table
      .split('|')
      .filter(Boolean)
      .map(s => s.trim());

    if (metric && !metric.includes('-')) {
      standards[currentSection][metric.toLowerCase()] = {
        min: parseFloat(min) || 0,
        target: parseFloat(target) || 0,
        max: parseFloat(max) || Infinity
      };
    }
  });

  return standards as QualityStandards;
}

// Get test count metrics
function getTestCounts() {
  const findTests = (pattern: string) => {
    try {
      return execSync(`find src -name "${pattern}" | wc -l`)
        .toString()
        .trim();
    } catch {
      return '0';
    }
  };

  return {
    unit: parseInt(findTests('*.test.ts*')),
    integration: parseInt(findTests('*.spec.ts*')),
    e2e: parseInt(findTests('*.e2e.ts*')),
    source: parseInt(findTests('*.ts*')) -
      parseInt(findTests('*.test.ts*')) -
      parseInt(findTests('*.spec.ts*')) -
      parseInt(findTests('*.e2e.ts*'))
  };
}

// Count assertions in tests
function getAssertionCounts() {
  try {
    const grep = `grep -r "expect(" src/**/*.test.ts* src/**/*.spec.ts* | wc -l`;
    const tests = `find src -name "*.test.ts*" -o -name "*.spec.ts*" | wc -l`;
    
    const assertions = parseInt(execSync(grep).toString().trim());
    const testFiles = parseInt(execSync(tests).toString().trim());
    
    return {
      assertions,
      testFiles,
      assertionsPerTest: assertions / testFiles
    };
  } catch {
    return { assertions: 0, testFiles: 0, assertionsPerTest: 0 };
  }
}

async function verifyTestQuality(): Promise<VerificationResult> {
  const standards = loadStandards();
  const quality = analyzeTestQuality();
  const trends = await analyzeTrends(7); // Last week
  const counts = getTestCounts();
  const assertions = getAssertionCounts();

  const violations: VerificationResult['violations'] = [];
  const recommendations: string[] = [];
  let critical = false;

  // Check coverage
  Object.entries(quality.coverage).forEach(([metric, value]) => {
    const standard = standards.coverage[metric as keyof typeof standards.coverage];
    if (value < standard.critical) {
      violations.push({
        metric: `${metric} coverage`,
        actual: value,
        required: standard.critical,
        severity: 'critical'
      });
      critical = true;
      recommendations.push(`Critical: Improve ${metric} coverage (${value}% < ${standard.critical}%)`);
    } else if (value < standard.min) {
      violations.push({
        metric: `${metric} coverage`,
        actual: value,
        required: standard.min,
        severity: 'warning'
      });
      recommendations.push(`Increase ${metric} coverage to meet minimum requirement`);
    }
  });

  // Check ratios
  const testToCodeRatio = counts.unit / counts.source;
  if (testToCodeRatio < standards.ratios.testToCode.min) {
    violations.push({
      metric: 'test/code ratio',
      actual: testToCodeRatio,
      required: standards.ratios.testToCode.min,
      severity: 'warning'
    });
    recommendations.push('Add more tests to improve test/code ratio');
  }

  const unitToIntegrationRatio = counts.unit / (counts.integration || 1);
  if (unitToIntegrationRatio < standards.ratios.unitToIntegration.min) {
    violations.push({
      metric: 'unit/integration ratio',
      actual: unitToIntegrationRatio,
      required: standards.ratios.unitToIntegration.min,
      severity: 'warning'
    });
    recommendations.push('Add more unit tests relative to integration tests');
  }

  // Check quality metrics
  if (quality.maintainability < standards.quality.maintainability.min) {
    violations.push({
      metric: 'maintainability',
      actual: quality.maintainability,
      required: standards.quality.maintainability.min,
      severity: 'warning'
    });
    recommendations.push('Improve test maintainability score');
  }

  if (quality.flakiness > standards.quality.flakiness.max) {
    violations.push({
      metric: 'flakiness',
      actual: quality.flakiness,
      required: standards.quality.flakiness.max,
      severity: 'warning'
    });
    recommendations.push('Address flaky tests to improve reliability');
  }

  // Check trends
  if (trends.trends.coverage.direction === 'declining') {
    violations.push({
      metric: 'coverage trend',
      actual: trends.trends.coverage.rate,
      required: 0,
      severity: 'warning'
    });
    recommendations.push('Coverage is declining - investigate and address');
  }

  return {
    passed: violations.length === 0,
    critical,
    metrics: {
      actual: {
        coverage: quality.coverage.lines,
        maintainability: quality.maintainability,
        flakiness: quality.flakiness,
        testToCodeRatio,
        unitToIntegrationRatio,
        assertionsPerTest: assertions.assertionsPerTest
      },
      required: {
        coverage: standards.coverage.lines.min,
        maintainability: standards.quality.maintainability.min,
        flakiness: standards.quality.flakiness.max,
        testToCodeRatio: standards.ratios.testToCode.min,
        unitToIntegrationRatio: standards.ratios.unitToIntegration.min,
        assertionsPerTest: standards.ratios.assertionsPerTest.min
      }
    },
    violations,
    recommendations
  };
}

// Run verification if executed directly
if (require.main === module) {
  verifyTestQuality()
    .then(result => {
      console.log('\nTest Quality Verification Report');
      console.log('==============================');
      console.log('\nStatus:', result.passed ? '✅ PASSED' : result.critical ? '❌ CRITICAL' : '⚠️ WARNING');
      
      console.log('\nMetrics:');
      Object.entries(result.metrics.actual).forEach(([metric, value]) => {
        const required = result.metrics.required[metric];
        const status = value >= required ? '✓' : '✗';
        console.log(`${status} ${metric}: ${value.toFixed(2)} (required: ${required})`);
      });

      if (result.violations.length > 0) {
        console.log('\nViolations:');
        result.violations.forEach(v => {
          const icon = v.severity === 'critical' ? '❌' : '⚠️';
          console.log(`${icon} ${v.metric}: ${v.actual.toFixed(2)} (required: ${v.required})`);
        });
      }

      if (result.recommendations.length > 0) {
        console.log('\nRecommendations:');
        result.recommendations.forEach(r => console.log(`• ${r}`));
      }

      process.exit(result.critical ? 2 : result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Error verifying test quality:', error);
      process.exit(1);
    });
}

export { verifyTestQuality, type VerificationResult, type QualityStandards };