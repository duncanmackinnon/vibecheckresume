import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');
jest.mock('path');

const mockCoverageData = {
  total: {
    lines: { total: 100, covered: 85, pct: 85 },
    statements: { total: 120, covered: 102, pct: 85 },
    functions: { total: 30, covered: 27, pct: 90 },
    branches: { total: 40, covered: 36, pct: 90 }
  },
  'src/app/page.tsx': {
    lines: { total: 50, covered: 45, pct: 90 },
    statements: { total: 60, covered: 54, pct: 90 },
    functions: { total: 15, covered: 14, pct: 93.33 },
    branches: { total: 20, covered: 18, pct: 90 }
  },
  'src/app/lib/utils.ts': {
    lines: { total: 30, covered: 20, pct: 66.67 },
    statements: { total: 35, covered: 25, pct: 71.43 },
    functions: { total: 10, covered: 7, pct: 70 },
    branches: { total: 15, covered: 10, pct: 66.67 }
  }
};

describe('Coverage Generator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (path.join as jest.Mock).mockImplementation((...parts) => parts.join('/'));
    (path.dirname as jest.Mock).mockImplementation(file => file.split('/').slice(0, -1).join('/'));
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockCoverageData));
    (spawnSync as jest.Mock).mockReturnValue({ status: 0 });
  });

  describe('runTests', () => {
    it('should execute tests with coverage', () => {
      const { runTests } = require('../generate-coverage');
      runTests();

      expect(spawnSync).toHaveBeenCalledWith(
        'npm',
        ['run', 'test:ci'],
        expect.any(Object)
      );
    });

    it('should exit on test failure', () => {
      (spawnSync as jest.Mock).mockReturnValue({ status: 1 });
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      const { runTests } = require('../generate-coverage');
      runTests();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  describe('generateSummary', () => {
    it('should generate correct summary from coverage data', () => {
      const { generateSummary } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);

      expect(summary.overall).toEqual({
        lines: 85,
        statements: 85,
        functions: 90,
        branches: 90
      });

      expect(summary.files).toHaveLength(2);
      expect(summary.files[0].file).toBe('src/app/page.tsx');
      expect(summary.files[0].lines).toBe(90);
    });

    it('should sort files by coverage', () => {
      const { generateSummary } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);

      expect(summary.files[0].lines).toBeGreaterThan(summary.files[1].lines);
    });
  });

  describe('generateReport', () => {
    it('should include overall coverage statistics', () => {
      const { generateSummary, generateReport } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);
      const report = generateReport(summary);

      expect(report).toContain('Overall Coverage');
      expect(report).toContain('85.00%');
      expect(report).toContain('90.00%');
    });

    it('should identify files below threshold', () => {
      const { generateSummary, generateReport } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);
      const report = generateReport(summary);

      expect(report).toContain('Files Below Threshold');
      expect(report).toContain('src/app/lib/utils.ts');
    });

    it('should include directory summaries', () => {
      const { generateSummary, generateReport } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);
      const report = generateReport(summary);

      expect(report).toContain('Test Results by Directory');
      expect(report).toContain('src/app');
    });
  });

  describe('saveSummary', () => {
    it('should create coverage directory if not exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      const { generateSummary, saveSummary } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);
      
      saveSummary(summary);

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should save summary to file', () => {
      const { generateSummary, saveSummary } = require('../generate-coverage');
      const summary = generateSummary(mockCoverageData);
      
      saveSummary(summary);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('summary.json'),
        expect.any(String)
      );
    });
  });

  describe('main function', () => {
    it('should generate and save coverage report', async () => {
      const { main } = require('../generate-coverage');
      
      await main();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'coverage-report.txt',
        expect.any(String)
      );
    });

    it('should exit with error on low coverage', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      const lowCoverageData = {
        ...mockCoverageData,
        total: {
          lines: { total: 100, covered: 70, pct: 70 },
          statements: { total: 120, covered: 84, pct: 70 },
          functions: { total: 30, covered: 21, pct: 70 },
          branches: { total: 40, covered: 28, pct: 70 }
        }
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(lowCoverageData));
      
      const { main } = require('../generate-coverage');
      await main();

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });
});