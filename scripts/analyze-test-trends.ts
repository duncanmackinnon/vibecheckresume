#!/usr/bin/env ts-node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { analyzeTestQuality, type TestQualityMetrics } from './analyze-test-quality';

interface CommitData {
  hash: string;
  date: string;
  author: string;
  message: string;
}

interface TestHistory {
  commit: CommitData;
  metrics: TestQualityMetrics;
}

interface TrendAnalysis {
  history: TestHistory[];
  trends: {
    coverage: {
      direction: 'improving' | 'declining' | 'stable';
      rate: number;
    };
    quality: {
      direction: 'improving' | 'declining' | 'stable';
      rate: number;
    };
    flakiness: {
      direction: 'improving' | 'declining' | 'stable';
      rate: number;
    };
  };
  recommendations: string[];
}

function getRecentCommits(days = 30): CommitData[] {
  const format = '--format={"hash": "%H", "date": "%aI", "author": "%aN", "message": "%s"}';
  const since = `--since="${days} days ago"`;
  const command = `git log ${format} ${since}`;

  const output = execSync(command).toString().trim();
  return output.split('\n').map(line => JSON.parse(line));
}

async function analyzeCommit(commit: CommitData): Promise<TestHistory | null> {
  try {
    // Checkout commit
    execSync(`git checkout ${commit.hash} --quiet`);

    // Install dependencies
    execSync('npm install --quiet');

    // Run tests and analysis
    const metrics = analyzeTestQuality();

    return {
      commit,
      metrics
    };
  } catch (error) {
    console.error(`Failed to analyze commit ${commit.hash}:`, error);
    return null;
  }
}

function calculateTrends(history: TestHistory[]): TrendAnalysis['trends'] {
  if (history.length < 2) {
    return {
      coverage: { direction: 'stable', rate: 0 },
      quality: { direction: 'stable', rate: 0 },
      flakiness: { direction: 'stable', rate: 0 }
    };
  }

  const first = history[0];
  const last = history[history.length - 1];
  const days = (new Date(last.commit.date).getTime() - new Date(first.commit.date).getTime()) / (1000 * 60 * 60 * 24);

  const coverageChange = (last.metrics.coverage.lines - first.metrics.coverage.lines) / days;
  const qualityChange = (last.metrics.maintainability - first.metrics.maintainability) / days;
  const flakinessChange = (first.metrics.flakiness - last.metrics.flakiness) / days;

  return {
    coverage: {
      direction: coverageChange > 0.1 ? 'improving' : coverageChange < -0.1 ? 'declining' : 'stable',
      rate: coverageChange
    },
    quality: {
      direction: qualityChange > 0.1 ? 'improving' : qualityChange < -0.1 ? 'declining' : 'stable',
      rate: qualityChange
    },
    flakiness: {
      direction: flakinessChange > 0.1 ? 'improving' : flakinessChange < -0.1 ? 'declining' : 'stable',
      rate: flakinessChange
    }
  };
}

function generateRecommendations(analysis: TrendAnalysis): string[] {
  const recommendations: string[] = [];

  if (analysis.trends.coverage.direction === 'declining') {
    recommendations.push(
      'Coverage is declining. Consider:',
      '• Adding tests for new features',
      '• Identifying and covering untested code paths',
      '• Implementing test automation in CI/CD'
    );
  }

  if (analysis.trends.quality.direction === 'declining') {
    recommendations.push(
      'Code quality is declining. Consider:',
      '• Reviewing and refactoring complex tests',
      '• Improving test maintainability',
      '• Adding more unit tests vs integration tests'
    );
  }

  if (analysis.trends.flakiness.direction === 'declining') {
    recommendations.push(
      'Test reliability is declining. Consider:',
      '• Identifying and fixing flaky tests',
      '• Adding retry mechanisms for unstable tests',
      '• Improving test isolation'
    );
  }

  return recommendations;
}

function generateReport(analysis: TrendAnalysis): string {
  const report = [
    'Test Quality Trend Analysis',
    '=========================',
    '',
    'Coverage Trend',
    '-------------',
    `Direction: ${analysis.trends.coverage.direction}`,
    `Rate: ${analysis.trends.coverage.rate.toFixed(2)}% per day`,
    '',
    'Quality Trend',
    '------------',
    `Direction: ${analysis.trends.quality.direction}`,
    `Rate: ${analysis.trends.quality.rate.toFixed(2)} points per day`,
    '',
    'Flakiness Trend',
    '--------------',
    `Direction: ${analysis.trends.flakiness.direction}`,
    `Rate: ${analysis.trends.flakiness.rate.toFixed(2)}% per day`,
    '',
    'History',
    '-------'
  ];

  analysis.history.forEach(entry => {
    report.push(
      `\nCommit: ${entry.commit.hash.substring(0, 8)}`,
      `Date: ${entry.commit.date}`,
      `Coverage: ${entry.metrics.coverage.lines.toFixed(2)}%`,
      `Quality: ${entry.metrics.maintainability.toFixed(2)}`,
      `Flakiness: ${(entry.metrics.flakiness * 100).toFixed(2)}%`
    );
  });

  report.push(
    '',
    'Recommendations',
    '---------------'
  );

  analysis.recommendations.forEach(rec => {
    report.push(rec);
  });

  return report.join('\n');
}

async function analyzeTrends(days: number): Promise<TrendAnalysis> {
  const commits = getRecentCommits(days);
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

  try {
    const history: TestHistory[] = [];
    
    for (const commit of commits) {
      const result = await analyzeCommit(commit);
      if (result) {
        history.push(result);
      }
    }

    const trends = calculateTrends(history);
    const recommendations = generateRecommendations({ history, trends, recommendations: [] });

    return { history, trends, recommendations };
  } finally {
    // Return to original branch
    execSync(`git checkout ${currentBranch} --quiet`);
  }
}

// Run analysis if executed directly
if (require.main === module) {
  const days = parseInt(process.argv[2]) || 30;

  analyzeTrends(days)
    .then(analysis => {
      const report = generateReport(analysis);
      
      // Save detailed analysis
      fs.writeFileSync(
        'test-trends-analysis.json',
        JSON.stringify(analysis, null, 2)
      );
      
      // Save readable report
      fs.writeFileSync('test-trends-report.txt', report);
      
      console.log(report);
      console.log('\nDetailed analysis saved to test-trends-analysis.json');
    })
    .catch(error => {
      console.error('Error analyzing trends:', error);
      process.exit(1);
    });
}

export {
  analyzeTrends,
  generateReport,
  type TrendAnalysis,
  type TestHistory
};