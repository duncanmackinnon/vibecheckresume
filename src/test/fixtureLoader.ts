import fs from 'fs';
import path from 'path';
import type { Analysis } from '@/app/types';

/**
 * Configuration for fixture loading
 */
interface FixtureConfig {
  encoding?: BufferEncoding;
  parse?: boolean;
}

/**
 * Default configuration
 */
const defaultConfig: FixtureConfig = {
  encoding: 'utf8',
  parse: false
};

/**
 * Base path for test fixtures
 */
const FIXTURES_PATH = path.join(process.cwd(), 'src', 'test', 'mockData');

/**
 * Convert buffer or string to string
 */
function ensureString(content: string | Buffer): string {
  if (Buffer.isBuffer(content)) {
    return content.toString('utf8');
  }
  return content;
}

/**
 * Load a fixture file
 */
export function loadFixture<T = string>(
  fileName: string,
  config: FixtureConfig = defaultConfig
): T {
  const filePath = path.join(FIXTURES_PATH, fileName);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${fileName}`);
  }

  const rawContent = fs.readFileSync(filePath, {
    encoding: config.encoding
  });

  const content = ensureString(rawContent);

  if (config.parse) {
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new Error(`Failed to parse fixture file ${fileName}: ${error}`);
    }
  }

  return content as unknown as T;
}

/**
 * Load resume content
 */
export function loadResumeFixture(): string {
  return loadFixture('resume.txt');
}

/**
 * Load job description content
 */
export function loadJobDescriptionFixture(): string {
  return loadFixture('jobDescription.txt');
}

/**
 * Load analysis result
 */
export function loadAnalysisFixture(): Analysis {
  return loadFixture<Analysis>('analysisResult.json', { parse: true });
}

/**
 * Load multiple fixtures
 */
export function loadFixtures<T = string>(
  fileNames: string[],
  config: FixtureConfig = defaultConfig
): Record<string, T> {
  return fileNames.reduce((acc, fileName) => ({
    ...acc,
    [fileName]: loadFixture<T>(fileName, config)
  }), {});
}

/**
 * Create a temporary fixture file
 */
export function createTempFixture(
  content: string,
  extension: string = '.txt'
): string {
  const tempFileName = `temp-${Date.now()}${extension}`;
  const tempFilePath = path.join(FIXTURES_PATH, tempFileName);
  
  fs.writeFileSync(tempFilePath, content, 'utf8');
  
  return tempFileName;
}

/**
 * Clean up temporary fixtures
 */
export function cleanupTempFixtures(): void {
  const files = fs.readdirSync(FIXTURES_PATH);
  
  files
    .filter(file => file.startsWith('temp-'))
    .forEach(file => {
      fs.unlinkSync(path.join(FIXTURES_PATH, file));
    });
}

/**
 * Get all available fixtures
 */
export function listFixtures(): string[] {
  return fs.readdirSync(FIXTURES_PATH);
}

/**
 * Check if a fixture exists
 */
export function hasFixture(fileName: string): boolean {
  return fs.existsSync(path.join(FIXTURES_PATH, fileName));
}

/**
 * Get fixture metadata
 */
export function getFixtureMetadata(fileName: string) {
  const filePath = path.join(FIXTURES_PATH, fileName);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${fileName}`);
  }

  const stats = fs.statSync(filePath);
  
  return {
    name: fileName,
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    extension: path.extname(fileName)
  };
}

// Clean up temporary fixtures when the process exits
process.on('exit', cleanupTempFixtures);