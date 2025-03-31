import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  generateStatsMarkdown,
  updatePRDescription,
  type PRStats,
  type CoverageStats
} from '../update-pr-stats';

jest.mock('fs');
jest.mock('path');
jest.mock('child_process');

describe('PR Stats Updater', () => {
  const mockStats: PRStats = {
    coverage: {
      before: {
        lines: 80,
        functions: 85,
        branches: 75
      },
      after: {
        lines: 85,
        functions: 90,
        branches: 80
      },
      change: {
        lines: 5,
        functions: 5,
        branches: 5
      }
    },
    tests: {
      added: 5,
      removed: 2,
      modified: 3
    },
    quality: {
      maintainability: 85,
      complexity: 12,
      flakiness: 0.02
    },
    impactedAreas: ['components', 'utils']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (execSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) return 'feature-branch\n';
      if (cmd.includes('git diff')) return 'src/components/test.tsx\nsrc/utils/helper.ts\n';
      return '';
    });
  });

  describe('generateStatsMarkdown', () => {
    it('should generate markdown with all sections', () => {
      const markdown = generateStatsMarkdown(mockStats);

      expect(markdown).toContain('Test Coverage & Quality Metrics');
      expect(markdown).toContain('Coverage Changes');
      expect(markdown).toContain('Test Changes');
      expect(markdown).toContain('Quality Metrics');
      expect(markdown).toContain('Impacted Areas');
    });

    it('should include coverage trends with correct icons', () => {
      const markdown = generateStatsMarkdown(mockStats);

      expect(markdown).toContain('📈'); // Improving metrics
      expect(markdown).toContain('85.00%');
      expect(markdown).toContain('80.00%');
    });

    it('should format numbers correctly', () => {
      const markdown = generateStatsMarkdown(mockStats);

      expect(markdown).toContain('85.00%');
      expect(markdown).toContain('2.00%'); // Flakiness
      expect(markdown).toContain('12.00'); // Complexity
    });

    it('should include test change statistics', () => {
      const markdown = generateStatsMarkdown(mockStats);

      expect(markdown).toContain('Added: 5');
      expect(markdown).toContain('Removed: 2');
      expect(markdown).toContain('Modified: 3');
    });

    it('should list impacted areas', () => {
      const markdown = generateStatsMarkdown(mockStats);

      mockStats.impactedAreas.forEach(area => {
        expect(markdown).toContain(`- ${area}`);
      });
    });
  });

  describe('updatePRDescription', () => {
    const mockCoverage: CoverageStats = {
      lines: 85,
      functions: 90,
      branches: 80
    };

    beforeEach(() => {
      process.env.GITHUB_EVENT_PATH = '/path/to/event.json';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_TOKEN = 'mock-token';
      
      (fs.readFileSync as jest.Mock)
        .mockImplementation((path: string) => {
          if (path === process.env.GITHUB_EVENT_PATH) {
            return JSON.stringify({ pull_request: { number: 123 } });
          }
          if (path.includes('coverage-summary.json')) {
            return JSON.stringify({
              total: {
                lines: { pct: mockCoverage.lines },
                functions: { pct: mockCoverage.functions },
                branches: { pct: mockCoverage.branches }
              }
            });
          }
          if (path.includes('test-quality-report.json')) {
            return JSON.stringify(mockStats.quality);
          }
          throw new Error(`Unexpected file read: ${path}`);
        });
    });

    afterEach(() => {
      delete process.env.GITHUB_EVENT_PATH;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_TOKEN;
    });

    it('should update PR description when running in CI', async () => {
      await updatePRDescription();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('curl -X PATCH'),
        expect.any(Object)
      );
    });

    it('should handle missing PR number', async () => {
      delete process.env.GITHUB_EVENT_PATH;
      
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();
      await updatePRDescription();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('should handle test coverage retrieval errors', async () => {
      (execSync as jest.Mock)
        .mockImplementationOnce(() => 'main')  // git rev-parse
        .mockImplementationOnce(() => {        // npm run test:ci
          throw new Error('Test failed');
        });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();

      await updatePRDescription();

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);

      consoleSpy.mockRestore();
      mockExit.mockRestore();
    });

    it('should print markdown when GITHUB_TOKEN is not set', async () => {
      delete process.env.GITHUB_TOKEN;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await updatePRDescription();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test Coverage & Quality Metrics')
      );
      consoleSpy.mockRestore();
    });
  });
});