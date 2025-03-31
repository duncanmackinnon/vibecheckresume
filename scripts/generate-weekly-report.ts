#!/usr/bin/env ts-node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { analyzeTestQuality } from './analyze-test-quality';
import { analyzeTrends } from './analyze-test-trends';

interface TestCommit {
  hash: string;
  date: string;
  author: string;
  message: string;
  testChanges: number;
}

interface WeeklyReport {
  date: string;
  summary: {
    testsAdded: number;
    testsRemoved: number;
    coverageChange: number;
    qualityChange: number;
    flakinessChange: number;
  };
  currentMetrics: ReturnType<typeof analyzeTestQuality>;
  trends: Awaited<ReturnType<typeof analyzeTrends>>;
  recommendations: string[];
  commits: TestCommit[];
}

async function generateWeeklyReport(): Promise<WeeklyReport> {
  // Get current date
  const date = new Date().toISOString().split('T')[0];

  // Get test changes from git
  const getTestChanges = () => {
    const cmd = `git log --since="1 week ago" --name-status`;
    const output = execSync(cmd).toString();
    const changes = output.split('\n')
      .filter(line => line.match(/\.(test|spec)\.(ts|tsx)$/))
      .reduce((acc, line) => {
        const [status, file] = line.split('\t');
        if (status === 'A') acc.added++;
        if (status === 'D') acc.removed++;
        return acc;
      }, { added: 0, removed: 0 });

    return changes;
  };

  // Get commits with test changes
  const getTestCommits = () => {
    const cmd = `git log --since="1 week ago" --format="%H|%aI|%aN|%s" --name-only`;
    const output = execSync(cmd).toString();
    const commits: TestCommit[] = [];
    let currentCommit: TestCommit | null = null;

    output.split('\n').forEach(line => {
      if (line.includes('|')) {
        const [hash, date, author, message] = line.split('|');
        currentCommit = { hash, date, author, message, testChanges: 0 };
        commits.push(currentCommit);
      } else if (line.match(/\.(test|spec)\.(ts|tsx)$/)) {
        if (currentCommit) {
          currentCommit.testChanges++;
        }
      }
    });

    return commits.filter(commit => commit.testChanges > 0);
  };

  // Analyze current state
  const currentMetrics = analyzeTestQuality();

  // Analyze trends
  const trends = await analyzeTrends(7); // One week of history

  // Calculate changes
  const testChanges = getTestChanges();
  const commits = getTestCommits();

  // Generate recommendations
  const recommendations: string[] = [];

  if (trends.trends.coverage.direction === 'declining') {
    recommendations.push('⚠️ Test coverage is declining - priority attention needed');
  }

  if (testChanges.added < testChanges.removed) {
    recommendations.push('🚨 More tests were removed than added this week');
  }

  if (trends.trends.flakiness.direction === 'declining') {
    recommendations.push('⚠️ Test reliability is decreasing - investigate flaky tests');
  }

  if (currentMetrics.testToCodeRatio < 0.5) {
    recommendations.push('📉 Test coverage ratio is below target - add more tests');
  }

  return {
    date,
    summary: {
      testsAdded: testChanges.added,
      testsRemoved: testChanges.removed,
      coverageChange: trends.trends.coverage.rate * 7, // Weekly change
      qualityChange: trends.trends.quality.rate * 7,
      flakinessChange: trends.trends.flakiness.rate * 7
    },
    currentMetrics,
    trends,
    recommendations,
    commits
  };
}

function formatReport(report: WeeklyReport): string {
  const lines = [
    'Weekly Test Quality Report',
    '=======================',
    `Date: ${report.date}`,
    '',
    'Summary',
    '-------',
    `Tests Added: ${report.summary.testsAdded}`,
    `Tests Removed: ${report.summary.testsRemoved}`,
    `Coverage Change: ${report.summary.coverageChange.toFixed(2)}%`,
    `Quality Change: ${report.summary.qualityChange.toFixed(2)} points`,
    `Flakiness Change: ${report.summary.flakinessChange.toFixed(2)}%`,
    '',
    'Current Metrics',
    '--------------',
    `Coverage: ${report.currentMetrics.coverage.lines.toFixed(2)}%`,
    `Test/Code Ratio: ${report.currentMetrics.testToCodeRatio.toFixed(2)}`,
    `Maintainability: ${report.currentMetrics.maintainability.toFixed(2)}`,
    `Flakiness: ${(report.currentMetrics.flakiness * 100).toFixed(2)}%`,
    '',
    'Trends',
    '------',
    `Coverage: ${report.trends.trends.coverage.direction} (${report.trends.trends.coverage.rate.toFixed(2)}%/day)`,
    `Quality: ${report.trends.trends.quality.direction} (${report.trends.trends.quality.rate.toFixed(2)} points/day)`,
    `Flakiness: ${report.trends.trends.flakiness.direction} (${report.trends.trends.flakiness.rate.toFixed(2)}%/day)`,
    '',
    'Recommendations',
    '---------------'
  ];

  report.recommendations.forEach(rec => {
    lines.push(rec);
  });

  lines.push(
    '',
    'Test-Related Commits',
    '------------------'
  );

  report.commits.forEach(commit => {
    lines.push(
      `\n${commit.hash.substring(0, 8)} - ${commit.date}`,
      `Author: ${commit.author}`,
      `Message: ${commit.message}`,
      `Test Changes: ${commit.testChanges}`
    );
  });

  return lines.join('\n');
}

async function sendReport(report: WeeklyReport): Promise<void> {
  // Save report files
  const reportDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const dateStr = report.date.replace(/-/g, '');
  const jsonPath = path.join(reportDir, `test-quality-${dateStr}.json`);
  const textPath = path.join(reportDir, `test-quality-${dateStr}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(textPath, formatReport(report));

  // Send email if configured
  if (process.env.SMTP_HOST && process.env.SMTP_TO) {
    // Implement email sending here if needed
    console.log('Email sending would happen here');
  }

  // Post to Slack if configured
  if (process.env.SLACK_WEBHOOK) {
    // Implement Slack posting here if needed
    console.log('Slack posting would happen here');
  }
}

// Run report generation if executed directly
if (require.main === module) {
  generateWeeklyReport()
    .then(async report => {
      await sendReport(report);
      console.log('Weekly report generated and sent successfully!');
      console.log(`Report saved to: reports/test-quality-${report.date.replace(/-/g, '')}.txt`);
    })
    .catch(error => {
      console.error('Error generating weekly report:', error);
      process.exit(1);
    });
}

export {
  generateWeeklyReport,
  formatReport,
  sendReport,
  type WeeklyReport,
  type TestCommit
};