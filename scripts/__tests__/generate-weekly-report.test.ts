import { execSync } from 'child_process';
import fs from 'fs';
import {
  generateWeeklyReport,
  formatReport,
  sendReport,
  type WeeklyReport,
  type TestCommit
} from '../generate-weekly-report';
import { analyzeTestQuality } from '../analyze-test-quality';
import { analyzeTrends } from '../analyze-test-trends';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../analyze-test-quality');
jest.mock('../analyze-test-trends');

describe('Weekly Report Generator', () => {
  const mockCommits: TestCommit[] = [
    {
      hash: 'abc123',
      date: '2025-03-20T10:00:00Z',
      author: 'Test User',
      message: 'Add tests',
      testChanges: 2
    },
    {
      hash: 'def456',
      date: '2025-03-21T10:00:00Z',
      author: 'Test User',
      message: 'Fix flaky tests',
      testChanges: 3
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

  const mockTrends = {
    history: mockCommits.map(commit => ({
      commit,
      metrics: mockMetrics
    })),
    trends: {
      coverage: { direction: 'improving' as const, rate: 0.5 },
      quality: { direction: 'stable' as const, rate: 0 },
      flakiness: { direction: 'declining' as const, rate: -0.1 }
    },
    recommendations: ['Fix flaky tests']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (execSync as jest.Mock).mockImplementation((command: string) => {
      if (command.includes('git log')) {
        if (command.includes('--name-status')) {
          return 'A\tsrc/test/file1.test.ts\nM\tsrc/test/file2.test.ts\nD\tsrc/test/file3.test.ts';
        }
        return mockCommits.map(commit => 
          `${commit.hash}|${commit.date}|${commit.author}|${commit.message}\n` +
          'src/test/file1.test.ts\n'
        ).join('\n');
      }
      return '';
    });

    (analyzeTestQuality as jest.Mock).mockReturnValue(mockMetrics);
    (analyzeTrends as jest.Mock).mockResolvedValue(mockTrends);
  });

  describe('generateWeeklyReport', () => {
    it('should generate a complete weekly report', async () => {
      const report = await generateWeeklyReport();

      expect(report).toEqual(expect.objectContaining({
        date: expect.any(String),
        summary: expect.any(Object),
        currentMetrics: mockMetrics,
        trends: mockTrends,
        recommendations: expect.any(Array),
        commits: expect.arrayContaining([
          expect.objectContaining({
            hash: expect.any(String),
            testChanges: expect.any(Number)
          })
        ])
      }));
    });

    it('should include test changes summary', async () => {
      const report = await generateWeeklyReport();

      expect(report.summary).toEqual(expect.objectContaining({
        testsAdded: expect.any(Number),
        testsRemoved: expect.any(Number),
        coverageChange: expect.any(Number),
        qualityChange: expect.any(Number),
        flakinessChange: expect.any(Number)
      }));
    });

    it('should generate appropriate recommendations', async () => {
      const report = await generateWeeklyReport();
      
      expect(report.recommendations).toContain(
        expect.stringContaining('Test reliability is decreasing')
      );
      expect(report.recommendations).toContain(
        expect.stringContaining('coverage ratio is below target')
      );
    });
  });

  describe('formatReport', () => {
    const mockReport: WeeklyReport = {
      date: '2025-03-25',
      summary: {
        testsAdded: 2,
        testsRemoved: 1,
        coverageChange: 3.5,
        qualityChange: 0,
        flakinessChange: -0.7
      },
      currentMetrics: mockMetrics,
      trends: mockTrends,
      recommendations: ['Add more tests'],
      commits: mockCommits
    };

    it('should format the report with all sections', () => {
      const formatted = formatReport(mockReport);

      expect(formatted).toContain('Weekly Test Quality Report');
      expect(formatted).toContain('Summary');
      expect(formatted).toContain('Current Metrics');
      expect(formatted).toContain('Trends');
      expect(formatted).toContain('Recommendations');
      expect(formatted).toContain('Test-Related Commits');
    });

    it('should include all commits with proper formatting', () => {
      const formatted = formatReport(mockReport);

      mockReport.commits.forEach(commit => {
        expect(formatted).toContain(commit.hash.substring(0, 8));
        expect(formatted).toContain(commit.message);
        expect(formatted).toContain(`Test Changes: ${commit.testChanges}`);
      });
    });

    it('should format numbers with proper precision', () => {
      const formatted = formatReport(mockReport);

      expect(formatted).toContain('3.50%'); // coverageChange
      expect(formatted).toContain('85.00%'); // coverage
      expect(formatted).toContain('0.40'); // testToCodeRatio
    });
  });

  describe('sendReport', () => {
    const mockReport: WeeklyReport = {
      date: '2025-03-25',
      summary: {
        testsAdded: 2,
        testsRemoved: 1,
        coverageChange: 3.5,
        qualityChange: 0,
        flakinessChange: -0.7
      },
      currentMetrics: mockMetrics,
      trends: mockTrends,
      recommendations: ['Add more tests'],
      commits: mockCommits
    };

    it('should save report files', async () => {
      await sendReport(mockReport);

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-quality-20250325.json'),
        expect.any(String)
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-quality-20250325.txt'),
        expect.any(String)
      );
    });

    it('should handle email configuration', async () => {
      const originalEnv = process.env;
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_TO = 'team@example.com';

      const consoleSpy = jest.spyOn(console, 'log');
      await sendReport(mockReport);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Email sending'));

      process.env = originalEnv;
      consoleSpy.mockRestore();
    });
  });
});