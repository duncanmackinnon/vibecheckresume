#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface CoverageStats {
  lines: number;
  functions: number;
  branches: number;
}

interface PRStats {
  coverage: {
    before: CoverageStats;
    after: CoverageStats;
    change: CoverageStats;
  };
  tests: {
    added: number;
    removed: number;
    modified: number;
  };
  quality: {
    maintainability: number;
    complexity: number;
    flakiness: number;
  };
  impactedAreas: string[];
}

function getCurrentBranch(): string {
  return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
}

function getBaseBranch(): string {
  return process.env.CI_BASE_BRANCH || 'main';
}

function getPRNumber(): string | null {
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    return event.pull_request?.number?.toString() || null;
  }
  return null;
}

function getTestStats(ref: string): CoverageStats {
  try {
    execSync(`git checkout ${ref} --quiet`);
    execSync('npm run test:ci', { stdio: 'pipe' });

    const coverageFile = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
    const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8')).total;

    return {
      lines: coverage.lines.pct,
      functions: coverage.functions.pct,
      branches: coverage.branches.pct
    };
  } catch {
    return { lines: 0, functions: 0, branches: 0 };
  }
}

function getTestChanges(): PRStats['tests'] {
  const baseBranch = getBaseBranch();
  const diffOutput = execSync(`git diff ${baseBranch} --name-status`).toString();

  return diffOutput
    .split('\n')
    .filter(line => line.match(/\.(test|spec)\.(ts|tsx)$/))
    .reduce((acc, line) => {
      const [status] = line.split('\t');
      if (status === 'A') acc.added++;
      if (status === 'D') acc.removed++;
      if (status === 'M') acc.modified++;
      return acc;
    }, { added: 0, removed: 0, modified: 0 });
}

function getQualityMetrics(): PRStats['quality'] {
  const qualityReport = path.join(process.cwd(), 'test-quality-report.json');
  
  try {
    execSync('npm run quality', { stdio: 'pipe' });
    const report = JSON.parse(fs.readFileSync(qualityReport, 'utf8'));
    return {
      maintainability: report.maintainability,
      complexity: report.complexity,
      flakiness: report.flakiness
    };
  } catch {
    return { maintainability: 0, complexity: 0, flakiness: 0 };
  }
}

function getImpactedAreas(): string[] {
  const baseBranch = getBaseBranch();
  const diffOutput = execSync(`git diff ${baseBranch} --name-only`).toString();
  
  return diffOutput
    .split('\n')
    .filter(Boolean)
    .map(file => {
      const parts = file.split('/');
      return parts.length > 2 ? parts[1] : parts[0];
    })
    .filter((area, index, self) => self.indexOf(area) === index);
}

function generateStatsMarkdown(stats: PRStats): string {
  const trend = (value: number) => {
    if (value > 0) return '📈';
    if (value < 0) return '📉';
    return '➡️';
  };

  return `
## Test Coverage & Quality Metrics

### Coverage Changes
| Metric    | Before | After | Change |
|-----------|--------|-------|--------|
| Lines     | ${stats.coverage.before.lines.toFixed(2)}% | ${stats.coverage.after.lines.toFixed(2)}% | ${trend(stats.coverage.change.lines)} ${stats.coverage.change.lines.toFixed(2)}% |
| Functions | ${stats.coverage.before.functions.toFixed(2)}% | ${stats.coverage.after.functions.toFixed(2)}% | ${trend(stats.coverage.change.functions)} ${stats.coverage.change.functions.toFixed(2)}% |
| Branches  | ${stats.coverage.before.branches.toFixed(2)}% | ${stats.coverage.after.branches.toFixed(2)}% | ${trend(stats.coverage.change.branches)} ${stats.coverage.change.branches.toFixed(2)}% |

### Test Changes
- ✨ Added: ${stats.tests.added}
- 🗑️ Removed: ${stats.tests.removed}
- 📝 Modified: ${stats.tests.modified}

### Quality Metrics
- 🏗️ Maintainability: ${stats.quality.maintainability.toFixed(2)}
- 🔄 Complexity: ${stats.quality.complexity.toFixed(2)}
- ⚠️ Flakiness: ${(stats.quality.flakiness * 100).toFixed(2)}%

### Impacted Areas
${stats.impactedAreas.map(area => `- ${area}`).join('\n')}

<details>
<summary>Quality Analysis Details</summary>

\`\`\`
Quality Score: ${stats.quality.maintainability.toFixed(2)}/100
Flaky Tests: ${stats.tests.modified > 0 ? '⚠️ Modified tests may need review' : '✅ No potential flaky tests'}
Coverage Trend: ${stats.coverage.change.lines >= 0 ? '✅ Maintaining/Improving' : '⚠️ Decreasing'}
\`\`\`
</details>
`;
}

async function updatePRDescription() {
  // Get current stats
  const currentBranch = getCurrentBranch();
  const baseBranch = getBaseBranch();
  const prNumber = getPRNumber();

  if (!prNumber) {
    console.error('No PR number found. Are you running in a PR context?');
    process.exit(1);
  }

  try {
    // Get stats before changes
    console.log('Getting base branch stats...');
    const beforeStats = getTestStats(baseBranch);

    // Get stats after changes
    console.log('Getting current branch stats...');
    execSync(`git checkout ${currentBranch} --quiet`);
    const afterStats = getTestStats(currentBranch);

    const stats: PRStats = {
      coverage: {
        before: beforeStats,
        after: afterStats,
        change: {
          lines: afterStats.lines - beforeStats.lines,
          functions: afterStats.functions - beforeStats.functions,
          branches: afterStats.branches - beforeStats.branches
        }
      },
      tests: getTestChanges(),
      quality: getQualityMetrics(),
      impactedAreas: getImpactedAreas()
    };

    // Generate markdown
    const markdown = generateStatsMarkdown(stats);

    // Update PR description using GitHub API
    if (process.env.GITHUB_TOKEN) {
      const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/pulls/${prNumber}`;
      execSync(`curl -X PATCH ${url} \
        -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"body": ${JSON.stringify(markdown)}}'`);
      
      console.log('PR description updated successfully!');
    } else {
      console.log('No GITHUB_TOKEN found. Printing markdown instead:');
      console.log(markdown);
    }
  } catch (error) {
    console.error('Error updating PR description:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  updatePRDescription().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export {
  updatePRDescription,
  generateStatsMarkdown,
  type PRStats,
  type CoverageStats
};