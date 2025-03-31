import { NextRequest } from 'next/server';
import { GET, HEAD } from '../health/route';
import fs from 'fs';
import path from 'path';
import { validateApiKey } from '@/app/lib/utils';

jest.mock('fs');
jest.mock('path');
jest.mock('@/app/lib/utils');

describe('Health Check API', () => {
  const mockCwd = '/mock/path';
  const mockTime = 1616161616161;
  const mockUptime = 3600;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (validateApiKey as jest.Mock).mockReturnValue(true);
    jest.spyOn(Date, 'now').mockReturnValue(mockTime);
    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    jest.spyOn(process, 'uptime').mockReturnValue(mockUptime);
    
    // Mock process.env
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      npm_package_version: '1.0.0'
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('GET handler', () => {
    const mockCoverageData = {
      total: {
        lines: { pct: 85 },
        statements: { pct: 85 },
        functions: { pct: 90 },
        branches: { pct: 80 }
      }
    };

    const mockTestResults = {
      timestamp: '2025-03-25T12:00:00.000Z',
      numTotalTests: 100,
      numPassedTests: 95,
      numFailedTests: 3,
      numPendingTests: 2
    };

    beforeEach(() => {
      (fs.readFileSync as jest.Mock)
        .mockImplementation((path) => {
          if (path.includes('coverage-summary.json')) {
            return JSON.stringify(mockCoverageData);
          }
          if (path.includes('latest.json')) {
            return JSON.stringify(mockTestResults);
          }
          throw new Error('Unexpected file read');
        });
    });

    it('should return healthy status when all services are up', async () => {
      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({
        status: 'ok',
        timestamp: mockTime,
        version: '1.0.0',
        environment: 'test',
        uptime: mockUptime
      }));
    });

    it('should include test coverage information', async () => {
      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.tests).toEqual(expect.objectContaining({
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
          skipped: 2
        },
        lastRun: mockTestResults.timestamp
      }));
    });

    it('should handle missing test results gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.tests).toEqual({
        lastRun: null,
        coverage: null,
        results: null
      });
    });

    it('should return error status when OpenAI is down', async () => {
      (validateApiKey as jest.Mock).mockReturnValue(false);
      
      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('error');
      expect(data.services.openai).toBe(false);
    });

    it('should return error status when filesystem is inaccessible', async () => {
      (fs.accessSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('error');
      expect(data.services.filesystem).toBe(false);
    });

    it('should include proper cache control headers', async () => {
      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toBe(
        'no-cache, no-store, must-revalidate'
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
    });
  });

  describe('HEAD handler', () => {
    it('should return 200 when services are healthy', async () => {
      const request = new NextRequest('http://localhost/api/health');
      const response = await HEAD(request);

      expect(response.status).toBe(200);
    });

    it('should return 503 when services are unhealthy', async () => {
      (validateApiKey as jest.Mock).mockReturnValue(false);
      
      const request = new NextRequest('http://localhost/api/health');
      const response = await HEAD(request);

      expect(response.status).toBe(503);
    });

    it('should return 500 on unexpected errors', async () => {
      (validateApiKey as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      
      const request = new NextRequest('http://localhost/api/health');
      const response = await HEAD(request);

      expect(response.status).toBe(500);
    });
  });
});