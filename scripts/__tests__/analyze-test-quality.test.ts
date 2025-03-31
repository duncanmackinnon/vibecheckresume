import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  analyzeTestQuality,
  generateReport,
  type TestQualityMetrics
} from '../analyze-test-quality';

jest.mock('fs');
jest.mock('path');
jest.mock('child_process');

describe('Test Quality Analysis', () => {
  const mockCoverageData = {
    total: {
      lines: { pct: 85 },
      statements: { pct: 85 },
      functions: { pct: 90 },
      branches: { pct: 80 }
    }
  };

  const mockTestResults = {
    numTotalTests: 100,
    numPassedTests: 95,
    numFailedTests: 3,
    numPendingTests: 2,
    testDuration: 5000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (execSync as jest.Mock).mockReturnValue('100');
  });

  describe('analyzeTestQuality', () => {
    beforeEach(() => {
      (fs.readFileSync as jest.Mock)
        .mockImplementation((filePath: string) => {
          if (filePath.includes('coverage-summary.json')) {
            return JSON.stringify(mockCoverageData);
          }
          if (filePath.includes('latest.json')) {
            return JSON.stringify(mockTestResults);
          }
          if (filePath.includes('lcov.info')) {
            return 'SF:src/app/page.tsx\nDA:1,1\nDA:2,0\nDA:3,1\n';
          }
          throw new Error('Unexpected file read');
        });
    });

    it('should analyze test quality metrics', () => {
      const metrics = analyzeTestQuality();

      expect(metrics).toEqual(expect.objectContaining({
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
        }
      }));
    });

    it('should handle missing coverage data', () => {
      (fs.existsSync as jest.Mock)
        .mockImplementation(path => !path.includes('coverage-summary.json'));

      expect(() => analyzeTestQuality()).toThrow('Coverage data not found');
    });

    it('should handle missing test results', () => {
      (fs.existsSync as jest.Mock)
        .mockImplementation(path => !path.includes('latest.json'));

      expect(() => analyzeTestQuality()).toThrow('Test results not found');
    });

    it('should identify uncovered lines', () => {
      const metrics = analyzeTestQuality();
      expect(metrics.uncoveredLines).toContain('src/app/page.tsx:2');
    });

    it('should calculate test to code ratio', () => {
      (execSync as jest.Mock)
        .mockImplementationOnce(() => '200\n')  // test lines
        .mockImplementationOnce(() => '400\n'); // code lines

      const metrics = analyzeTestQuality();
      expect(metrics.testToCodeRatio).toBe(0.5);
    });
  });

  describe('generateReport', () => {
    const mockMetrics: TestQualityMetrics = {
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

    it('should generate a report with all sections', () => {
      const report = generateReport(mockMetrics);

      expect(report).toContain('Test Quality Analysis Report');
      expect(report).toContain('Coverage Metrics');
      expect(report).toContain('Test Results');
      expect(report).toContain('Quality Metrics');
      expect(report).toContain('Areas for Improvement');
    });

    it('should include recommendations for low metrics', () => {
      const report = generateReport({
        ...mockMetrics,
        coverage: {
          ...mockMetrics.coverage,
          lines: 70
        }
      });

      expect(report).toContain('Improve line coverage');
    });

    it('should format numbers correctly', () => {
      const report = generateReport(mockMetrics);

      expect(report).toContain('85.00%'); // Coverage
      expect(report).toContain('0.40');   // Test/Code Ratio
      expect(report).toContain('15.00%'); // Flakiness
    });

    it('should list uncovered lines', () => {
      const report = generateReport(mockMetrics);

      expect(report).toContain('Uncovered Lines:');
      expect(report).toContain('src/app/page.tsx:2');
    });

    it('should handle metrics with no issues', () => {
      const goodMetrics: TestQualityMetrics = {
        ...mockMetrics,
        coverage: {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95
        },
        testToCodeRatio: 0.8,
        flakiness: 0,
        maintainability: 90,
        uncoveredLines: []
      };

      const report = generateReport(goodMetrics);
      expect(report).not.toContain('Improve');
      expect(report).not.toContain('Uncovered Lines:');
    });
  });
});