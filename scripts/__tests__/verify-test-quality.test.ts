import fs from 'fs';
import { execSync } from 'child_process';
import {
  verifyTestQuality,
  type QualityStandards,
  type VerificationResult
} from '../verify-test-quality';
import { analyzeTestQuality } from '../analyze-test-quality';
import { analyzeTrends } from '../analyze-test-trends';

jest.mock('fs');
jest.mock('child_process');
jest.mock('../analyze-test-quality');
jest.mock('../analyze-test-trends');

describe('Test Quality Verification', () => {
  const mockStandardsMd = `
| Metric     | Minimum | Target | Critical |
|------------|---------|--------|----------|
| Lines      | 80%     | 90%    | 70%      |
| Functions  | 85%     | 95%    | 75%      |

| Metric           | Minimum | Target | Maximum |
|-----------------|---------|--------|---------|
| Test/Code Ratio | 0.5     | 0.7    | N/A     |

| Metric           | Minimum | Target | Maximum |
|-----------------|---------|--------|---------|
| Maintainability | 70      | 85     | N/A     |
| Flakiness       | N/A     | 0%     | 1%      |
`;

  const mockQualityResult = {
    coverage: {
      lines: 85,
      functions: 90,
      branches: 80,
      statements: 85
    },
    maintainability: 75,
    flakiness: 0.5,
    testToCodeRatio: 0.6
  };

  const mockTrends = {
    trends: {
      coverage: { direction: 'stable' as const, rate: 0 },
      quality: { direction: 'stable' as const, rate: 0 },
      flakiness: { direction: 'stable' as const, rate: 0 }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (fs.readFileSync as jest.Mock).mockReturnValue(mockStandardsMd);
    (analyzeTestQuality as jest.Mock).mockReturnValue(mockQualityResult);
    (analyzeTrends as jest.Mock).mockResolvedValue(mockTrends);
    (execSync as jest.Mock).mockReturnValue('10');
  });

  describe('verifyTestQuality', () => {
    it('should pass when all metrics meet standards', async () => {
      const result = await verifyTestQuality();

      expect(result.passed).toBe(true);
      expect(result.critical).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should flag critical coverage violations', async () => {
      (analyzeTestQuality as jest.Mock).mockReturnValue({
        ...mockQualityResult,
        coverage: {
          ...mockQualityResult.coverage,
          lines: 65 // Below critical threshold
        }
      });

      const result = await verifyTestQuality();

      expect(result.critical).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          metric: 'lines coverage',
          severity: 'critical'
        })
      );
    });

    it('should flag warning level violations', async () => {
      (analyzeTestQuality as jest.Mock).mockReturnValue({
        ...mockQualityResult,
        maintainability: 65 // Below minimum
      });

      const result = await verifyTestQuality();

      expect(result.passed).toBe(false);
      expect(result.critical).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          metric: 'maintainability',
          severity: 'warning'
        })
      );
    });

    it('should provide recommendations for violations', async () => {
      (analyzeTestQuality as jest.Mock).mockReturnValue({
        ...mockQualityResult,
        flakiness: 1.5 // Above maximum
      });

      const result = await verifyTestQuality();

      expect(result.recommendations).toContain(
        expect.stringContaining('flaky tests')
      );
    });

    it('should check test ratio metrics', async () => {
      (execSync as jest.Mock)
        .mockReturnValueOnce('5') // unit tests
        .mockReturnValueOnce('5') // integration tests
        .mockReturnValueOnce('20'); // source files

      const result = await verifyTestQuality();

      expect(result.metrics.actual).toHaveProperty('testToCodeRatio');
      expect(result.metrics.actual).toHaveProperty('unitToIntegrationRatio');
    });

    it('should handle declining trends', async () => {
      (analyzeTrends as jest.Mock).mockResolvedValue({
        trends: {
          ...mockTrends.trends,
          coverage: { direction: 'declining', rate: -0.5 }
        }
      });

      const result = await verifyTestQuality();

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          metric: 'coverage trend'
        })
      );
      expect(result.recommendations).toContain(
        expect.stringContaining('Coverage is declining')
      );
    });

    it('should handle missing test files gracefully', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('No files found');
      });

      const result = await verifyTestQuality();

      expect(result.metrics.actual).toHaveProperty('testToCodeRatio', 0);
      expect(result.metrics.actual).toHaveProperty('assertionsPerTest', 0);
    });
  });

  describe('metrics calculation', () => {
    it('should calculate correct test/code ratio', async () => {
      (execSync as jest.Mock)
        .mockReturnValueOnce('10') // unit tests
        .mockReturnValueOnce('5')  // integration tests
        .mockReturnValueOnce('30'); // source files

      const result = await verifyTestQuality();

      expect(result.metrics.actual.testToCodeRatio).toBeCloseTo(0.33);
      expect(result.metrics.actual.unitToIntegrationRatio).toBe(2);
    });

    it('should calculate assertions per test', async () => {
      (execSync as jest.Mock)
        .mockReturnValueOnce('100') // assertions
        .mockReturnValueOnce('20');  // test files

      const result = await verifyTestQuality();

      expect(result.metrics.actual.assertionsPerTest).toBe(5);
    });
  });

  describe('quality standards parsing', () => {
    it('should parse standards from markdown', async () => {
      await verifyTestQuality();

      // Verify standards were parsed correctly
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('QUALITY_STANDARDS.md'),
        'utf8'
      );
    });

    it('should handle malformed standards file', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('Invalid markdown');

      const result = await verifyTestQuality();

      // Should use default values
      expect(result.metrics.required).toBeDefined();
    });
  });
});