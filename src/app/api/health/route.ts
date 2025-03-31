import { NextRequest } from 'next/server';
import { validateApiKey } from '@/app/lib/utils';
import fs from 'fs';
import path from 'path';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: number;
  version: string;
  environment: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  tests: {
    lastRun: string | null;
    coverage: {
      lines: number;
      statements: number;
      functions: number;
      branches: number;
    } | null;
    results: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    } | null;
  };
  services: {
    openai: boolean;
    database: boolean;
    filesystem: boolean;
  };
}

function loadTestResults(): HealthStatus['tests'] {
  try {
    // Load coverage data
    const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
    const testResultsPath = path.join(process.cwd(), 'test-results', 'latest.json');
    
    let coverage = null;
    let results = null;
    let lastRun = null;

    if (fs.existsSync(coveragePath)) {
      const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      coverage = {
        lines: coverageData.total.lines.pct,
        statements: coverageData.total.statements.pct,
        functions: coverageData.total.functions.pct,
        branches: coverageData.total.branches.pct
      };
    }

    if (fs.existsSync(testResultsPath)) {
      const testData = JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
      lastRun = testData.timestamp;
      results = {
        total: testData.numTotalTests,
        passed: testData.numPassedTests,
        failed: testData.numFailedTests,
        skipped: testData.numPendingTests
      };
    }

    return {
      lastRun,
      coverage,
      results
    };
  } catch (error) {
    console.error('Error loading test results:', error);
    return {
      lastRun: null,
      coverage: null,
      results: null
    };
  }
}

async function checkServices(): Promise<HealthStatus['services']> {
  const services = {
    openai: false,
    database: true, // We're not using a database yet
    filesystem: false
  };

  // Check OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  services.openai = validateApiKey(apiKey);

  // Check filesystem
  try {
    fs.accessSync(process.cwd(), fs.constants.R_OK | fs.constants.W_OK);
    services.filesystem = true;
  } catch {
    services.filesystem = false;
  }

  return services;
}

export async function GET(request: NextRequest) {
  try {
    const testInfo = loadTestResults();
    const services = await checkServices();

    const health: HealthStatus = {
      status: 'ok',
      timestamp: Date.now(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      tests: testInfo,
      services
    };

    // Set status to error if any critical service is down
    if (!services.openai || !services.filesystem) {
      health.status = 'error';
    }

    // Add cache control headers
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    return new Response(JSON.stringify(health), {
      status: health.status === 'ok' ? 200 : 503,
      headers
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return new Response(
      JSON.stringify({
        status: 'error',
        timestamp: Date.now(),
        error: 'Health check failed'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
}

export async function HEAD(request: NextRequest) {
  try {
    const services = await checkServices();
    const status = services.openai && services.filesystem ? 200 : 503;

    return new Response(null, {
      status,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}