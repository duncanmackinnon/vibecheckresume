import { execSync } from 'child_process';
import fs from 'fs';
import {
  analyzeTrends,
  generateReport,
  type TrendAnalysis,
  type TestHistory
} from '../analyze-test-trends';
import { analyzeTestQuality } from '../analyze-test-quality';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../analyze-test-quality');

describe('Test Trends Analysis', () => {
  const mockCommits = [
    {
      hash: 'abc123',
      date: '2025-03-20T10:00:00Z',
      author: 'Test User',
      message: 'Initial commit'
    },
    {
      hash: 'def456',
      date: '2025-03-25T10:00:00Z',
      author: 'Test User',
      message: 'Add tests'
    }
  ];

  const mockMetrics = {
    coverage: {
      lines: 85,
      statements: 85,
      functions: 90,
      branches: 80
    },
    results: {
      total: 100,
      passed: 95,
      failed: 3,
      skipped: 2,
      duration: 5000
    },
    complexity: {
      cognitive: 10,
      cyclomatic: 15,
      halstead: 20
    },
    maintainability: 75,
    testToCodeRatio: 0.4,
    flakiness: 0.15,
    uncoveredLines: ['src/app/page.tsx:2']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock git commands
    (execSync as jest.Mock).mockImplementation((command: string) => {
      if (command.includes('git log')) {
        return mockCommits.map(commit => JSON.stringify(commit)).join('\n');
      }
      if (command.includes('git rev-parse')) {
        return 'main';
      }
      return '';
    });

    // Mock test analysis
    (analyzeTestQuality as jest.Mock).mockReturnValue(mockMetrics);
  });

  describe('analyzeTrends', () => {
    it('should analyze test quality trends over time', async () => {
      const analysis = await analyzeTrends(5);

      expect(analysis.history).toHaveLength(2);
      expect(analysis.trends).toEqual(expect.objectContaining({
        coverage: expect.any(Object),
        quality: expect.any(Object),
        flakiness: expect.any(Object)
      }));
    });

    it('should handle git command failures', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('Git error');
      });

      await expect(analyzeTrends(5)).rejects.toThrow();
    });

    it('should return to original branch after analysis', async () => {
      await analyzeTrends(5);

      expect(execSync).toHaveBeenCalledWith('git checkout main --quiet');
    });
  });

  describe('generateReport', () => {
    const mockAnalysis: TrendAnalysis = {
      history: mockCommits.map(commit => ({
        commit,
        metrics: mockMetrics
      })),
      trends: {
        coverage: { direction: 'improving', rate: 0.5 },
        quality: { direction: 'stable', rate: 0 },
        flakiness: { direction: 'declining', rate: -0.1 }
      },
      recommendations: [
        'Fix flaky tests',
        'Improve coverage'
      ]
    };

    it('should generate a formatted report', () => {
      const report = generateReport(mockAnalysis);

      expect(report).toContain('Test Quality Trend Analysis');
      expect(report).toContain('Coverage Trend');
      expect(report).toContain('Quality Trend');
      expect(report).toContain('Flakiness Trend');
      expect(report).toContain('Recommendations');
    });

    it('should include history in the report', () => {
      const report = generateReport(mockAnalysis);

      mockAnalysis.history.forEach(entry => {
        expect(report).toContain(entry.commit.hash.substring(0, 8));
        expect(report).toContain(entry.commit.date);
      });
    });

    it('should format numbers correctly', () => {
      const report = generateReport(mockAnalysis);

      expect(report).toContain('0.50% per day');
      expect(report).toContain('85.00%');
    });

    it('should include all recommendations', () => {
      const report = generateReport(mockAnalysis);

      mockAnalysis.recommendations.forEach(rec => {
        expect(report).toContain(rec);
      });
    });
  });

  describe('main execution', () => {
    beforeEach(() => {
      // Mock file system operations
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    });

    it('should save analysis results to files', async () => {
      // Mock process.argv
      const originalArgv = process.argv;
      process.argv = ['node', 'analyze-test-trends.ts', '5'];

      // Execute main function
      await require('../analyze-test-trends');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test-trends-analysis.json',
        expect.any(String)
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test-trends-report.txt',
        expect.any(String)
      );

      // Restore process.argv
      process.argv = originalArgv;
    });

    it('should handle analysis errors gracefully', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();
      (analyzeTestQuality as jest.Mock).mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      // Execute main function
      await require('../analyze-test-trends');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });
});