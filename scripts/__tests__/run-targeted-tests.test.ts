import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import {
  getChangedFiles,
  getTestSuitesToRun,
  runTestSuites,
  saveTestResults
} from '../run-targeted-tests';

jest.mock('child_process');
jest.mock('fs');

describe('Targeted Test Runner', () => {
  const mockChangedFiles = [
    'src/components/Button.tsx',
    'src/app/lib/utils.ts',
    'src/app/api/analyze/route.ts'
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (execSync as jest.Mock).mockReturnValue(mockChangedFiles.join('\n'));
  });

  describe('getChangedFiles', () => {
    it('should return list of changed files from git', () => {
      const files = getChangedFiles();
      expect(files).toEqual(mockChangedFiles);
      expect(execSync).toHaveBeenCalledWith('git diff --name-only HEAD');
    });

    it('should handle git command errors', () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('Git error');
      });

      const files = getChangedFiles();
      expect(files).toEqual([]);
    });
  });

  describe('getTestSuitesToRun', () => {
    it('should identify relevant test suites based on changed files', () => {
      const suites = getTestSuitesToRun(mockChangedFiles);
      
      // Should include component, utils, and API tests
      expect(suites).toHaveLength(3);
      expect(suites.map(s => s.description)).toContain('Component tests');
      expect(suites.map(s => s.description)).toContain('Utility function tests');
      expect(suites.map(s => s.description)).toContain('API endpoint tests');
    });

    it('should not duplicate test suites', () => {
      const files = [
        'src/components/Button.tsx',
        'src/components/Input.tsx'
      ];

      const suites = getTestSuitesToRun(files);
      expect(suites).toHaveLength(1);
      expect(suites[0].description).toBe('Component tests');
    });

    it('should handle files with no matching test suites', () => {
      const files = ['README.md', 'docs/guide.md'];
      const suites = getTestSuitesToRun(files);
      expect(suites).toHaveLength(0);
    });
  });

  describe('runTestSuites', () => {
    it('should run specified test suites', () => {
      (spawnSync as jest.Mock).mockReturnValue({ status: 0 });

      const suites = getTestSuitesToRun(mockChangedFiles);
      const success = runTestSuites(suites);

      expect(success).toBe(true);
      expect(spawnSync).toHaveBeenCalledTimes(3);
    });

    it('should handle test failures', () => {
      (spawnSync as jest.Mock).mockReturnValue({ status: 1 });

      const suites = getTestSuitesToRun(mockChangedFiles);
      const success = runTestSuites(suites);

      expect(success).toBe(false);
    });

    it('should handle empty suite list', () => {
      const success = runTestSuites([]);
      expect(success).toBe(true);
      expect(spawnSync).not.toHaveBeenCalled();
    });
  });

  describe('saveTestResults', () => {
    const mockDate = new Date('2025-03-25T12:00:00Z');

    beforeEach(() => {
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should save test results to file', () => {
      const suites = getTestSuitesToRun(mockChangedFiles);
      saveTestResults(suites, true);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test-results'),
        expect.any(Object)
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('targeted-2025-03-25T12:00:00.000Z.json'),
        expect.any(String)
      );

      const savedContent = JSON.parse(
        (fs.writeFileSync as jest.Mock).mock.calls[0][1]
      );

      expect(savedContent).toEqual({
        timestamp: mockDate.toISOString(),
        success: true,
        suites: expect.any(Array),
        changedFiles: mockChangedFiles
      });
    });

    it('should create results directory if it doesn\'t exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const suites = getTestSuitesToRun(mockChangedFiles);
      saveTestResults(suites, true);

      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });
});