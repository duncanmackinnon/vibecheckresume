import { generateReport, TestResult } from '../test-all';
import { spawnSync } from 'child_process';
import fs from 'fs';

jest.mock('child_process');
jest.mock('fs');

const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;

describe('Test Runner', () => {
  describe('generateReport', () => {
    const mockResults: Record<string, TestResult> = {
      'Test Suite 1': {
        success: true,
        output: 'All tests passed',
        duration: 1500 // 1.5 seconds
      },
      'Test Suite 2': {
        success: false,
        output: 'Some tests failed\nError details here',
        duration: 2500 // 2.5 seconds
      }
    };

    it('should generate a report with correct summary', () => {
      const report = generateReport(mockResults);

      // Check summary information
      expect(report).toContain('Total Suites: 2');
      expect(report).toContain('Passed: 1');
      expect(report).toContain('Failed: 1');
      expect(report).toContain('Total Duration: 0m 4s');
    });

    it('should include test suite details', () => {
      const report = generateReport(mockResults);

      // Check individual suite details
      expect(report).toContain('Test Suite 1');
      expect(report).toContain('Status: PASS');
      expect(report).toContain('Duration: 0m 1s');

      expect(report).toContain('Test Suite 2');
      expect(report).toContain('Status: FAIL');
      expect(report).toContain('Duration: 0m 2s');
    });

    it('should include error output only for failed tests', () => {
      const report = generateReport(mockResults);

      // Should not include output for successful tests
      expect(report).not.toContain('All tests passed');

      // Should include output for failed tests
      expect(report).toContain('Some tests failed');
      expect(report).toContain('Error details here');
    });
  });

  describe('runTests command execution', () => {
    beforeEach(() => {
      mockSpawnSync.mockReset();
      mockWriteFileSync.mockReset();
    });

    it('should execute npm test commands', async () => {
      // Mock successful test execution
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Tests completed successfully',
        stderr: '',
        pid: 123,
        output: ['Tests completed successfully'],
        signal: null
      });

      const { runTests } = require('../test-all');
      await runTests();

      // Verify npm commands were executed
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'npm',
        ['run', 'test:ci'],
        expect.any(Object)
      );

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'npm',
        ['run', 'test:openai'],
        expect.any(Object)
      );

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'npm',
        ['run', 'test:errors'],
        expect.any(Object)
      );
    });

    it('should handle test failures', async () => {
      // Mock a test failure
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'Test failed',
        pid: 123,
        output: ['Test failed'],
        signal: null
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const { runTests } = require('../test-all');
      
      await runTests();

      // Verify process exits with error code
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should generate and save report file', async () => {
      // Mock successful test execution
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Tests completed successfully',
        stderr: '',
        pid: 123,
        output: ['Tests completed successfully'],
        signal: null
      });

      const { runTests } = require('../test-all');
      await runTests();

      // Verify report was saved
      expect(mockWriteFileSync).toHaveBeenCalled();
      const savedContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(savedContent).toContain('Test Execution Report');
    });
  });
});