import fs from 'fs';
import path from 'path';
import {
  loadFixture,
  loadResumeFixture,
  loadJobDescriptionFixture,
  loadAnalysisFixture,
  loadFixtures,
  createTempFixture,
  cleanupTempFixtures,
  listFixtures,
  hasFixture,
  getFixtureMetadata
} from '../fixtureLoader';
import type { Analysis } from '@/app/types';

describe('Fixture Loader', () => {
  afterEach(() => {
    cleanupTempFixtures();
    jest.clearAllMocks();
  });

  describe('loadFixture', () => {
    it('should load a text fixture', () => {
      const content = loadFixture('resume.txt');
      expect(typeof content).toBe('string');
      expect(content).toContain('John Doe');
    });

    it('should load and parse a JSON fixture', () => {
      const content = loadFixture<Analysis>('analysisResult.json', { parse: true });
      expect(typeof content).toBe('object');
      expect(content.score).toBeDefined();
      expect(Array.isArray(content.matchedSkills)).toBe(true);
    });

    it('should throw error for non-existent fixture', () => {
      expect(() => loadFixture('nonexistent.txt')).toThrow('Fixture file not found');
    });

    it('should throw error for invalid JSON', () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');
      expect(() => loadFixture('test.json', { parse: true })).toThrow('Failed to parse');
    });
  });

  describe('loadResumeFixture', () => {
    it('should load the resume fixture', () => {
      const resume = loadResumeFixture();
      expect(resume).toContain('Software Engineer');
      expect(resume).toContain('EXPERIENCE');
    });
  });

  describe('loadJobDescriptionFixture', () => {
    it('should load the job description fixture', () => {
      const jobDescription = loadJobDescriptionFixture();
      expect(jobDescription).toContain('Senior Full Stack Engineer');
      expect(jobDescription).toContain('Required Skills');
    });
  });

  describe('loadAnalysisFixture', () => {
    it('should load and parse the analysis fixture', () => {
      const analysis = loadAnalysisFixture();
      expect(analysis.score).toBeDefined();
      expect(analysis.matchedSkills).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
    });
  });

  describe('loadFixtures', () => {
    it('should load multiple fixtures', () => {
      const fixtures = loadFixtures(['resume.txt', 'jobDescription.txt']);
      expect(fixtures['resume.txt']).toBeDefined();
      expect(fixtures['jobDescription.txt']).toBeDefined();
    });
  });

  describe('createTempFixture', () => {
    it('should create a temporary fixture file', () => {
      const content = 'Test content';
      const fileName = createTempFixture(content);
      expect(fileName).toMatch(/^temp-\d+\.txt$/);
      expect(hasFixture(fileName)).toBe(true);

      const loadedContent = loadFixture(fileName);
      expect(loadedContent).toBe(content);
    });

    it('should support custom extensions', () => {
      const fileName = createTempFixture('{}', '.json');
      expect(fileName).toMatch(/^temp-\d+\.json$/);
    });
  });

  describe('listFixtures', () => {
    it('should list all available fixtures', () => {
      const fixtures = listFixtures();
      expect(fixtures).toContain('resume.txt');
      expect(fixtures).toContain('jobDescription.txt');
      expect(fixtures).toContain('analysisResult.json');
    });
  });

  describe('getFixtureMetadata', () => {
    it('should return fixture metadata', () => {
      const metadata = getFixtureMetadata('resume.txt');
      expect(metadata.name).toBe('resume.txt');
      expect(metadata.size).toBeGreaterThan(0);
      expect(metadata.extension).toBe('.txt');
      expect(metadata.created instanceof Date).toBe(true);
      expect(metadata.modified instanceof Date).toBe(true);
    });

    it('should throw error for non-existent fixture', () => {
      expect(() => getFixtureMetadata('nonexistent.txt')).toThrow('Fixture file not found');
    });
  });

  describe('cleanup', () => {
    it('should remove all temporary fixtures', () => {
      // Create some temp fixtures
      createTempFixture('test1');
      createTempFixture('test2');
      
      // Clean up
      cleanupTempFixtures();
      
      // Check that temp files are gone
      const fixtures = listFixtures();
      expect(fixtures.filter(f => f.startsWith('temp-'))).toHaveLength(0);
    });
  });
});