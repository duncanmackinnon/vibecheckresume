import {
  generateResume,
  generateJobDescription,
  generateAnalysis,
  generateFixtures
} from '../fixtureGenerator';
import { hasFixture, loadFixture, cleanupTempFixtures } from '../fixtureLoader';
import type { Analysis } from '@/app/types';

describe('Fixture Generator', () => {
  afterEach(() => {
    cleanupTempFixtures();
  });

  describe('generateResume', () => {
    it('should generate a resume with default options', () => {
      const resume = generateResume();
      expect(typeof resume).toBe('string');
      expect(resume).toContain('Software Engineer');
      expect(resume).toContain('SKILLS');
      expect(resume).toContain('EXPERIENCE');
      expect(resume).toContain('EDUCATION');
    });

    it('should respect custom options', () => {
      const resume = generateResume({
        yearsOfExperience: 3,
        skillCount: 4,
        projectCount: 2,
        prefix: 'Custom'
      });

      expect(resume).toContain('Custom Engineer');
      expect(resume).toContain('3+ years of experience');
      expect(resume.match(/Custom Company [12]/g)?.length).toBe(2);
    });
  });

  describe('generateJobDescription', () => {
    it('should generate a job description with default options', () => {
      const jobDescription = generateJobDescription();
      expect(typeof jobDescription).toBe('string');
      expect(jobDescription).toContain('Senior Software Engineer');
      expect(jobDescription).toContain('Required Skills:');
      expect(jobDescription).toContain('Nice to Have:');
    });

    it('should respect custom options', () => {
      const jobDescription = generateJobDescription({
        requiredSkillCount: 3,
        niceToHaveSkillCount: 2,
        seniority: 'lead',
        prefix: 'Custom'
      });

      expect(jobDescription).toContain('Lead Software Engineer');
      expect(jobDescription).toContain('Custom Company');
      
      const requiredSkills = jobDescription.split('Required Skills:')[1]
        .split('Nice to Have:')[0]
        .split('\n')
        .filter(line => line.trim().startsWith('-'));
      expect(requiredSkills).toHaveLength(3);
    });
  });

  describe('generateAnalysis', () => {
    it('should generate an analysis with default options', () => {
      const analysis = generateAnalysis();
      expect(analysis.score).toBeGreaterThanOrEqual(60);
      expect(analysis.score).toBeLessThanOrEqual(100);
      expect(analysis.matchedSkills).toBeDefined();
      expect(analysis.missingSkills).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
      expect(analysis.detailedAnalysis).toBeDefined();
    });

    it('should respect custom options', () => {
      const analysis = generateAnalysis({
        score: 75,
        matchedSkillCount: 3,
        missingSkillCount: 2,
        recommendationCount: 2
      });

      expect(analysis.score).toBe(75);
      expect(analysis.matchedSkills).toHaveLength(3);
      expect(analysis.missingSkills).toHaveLength(2);
      expect(analysis.recommendations.improvements).toHaveLength(2);
    });

    it('should generate valid recommendations', () => {
      const analysis = generateAnalysis();
      
      expect(analysis.recommendations?.improvements?.every(r => r.startsWith('Learn'))).toBe(true);
      expect(analysis.recommendations?.strengths?.every(r => r.includes('experience'))).toBe(true);
      expect(analysis.recommendations?.skillGaps?.every(r => r.includes('Missing'))).toBe(true);
      expect(analysis.recommendations.format).toHaveLength(3);
    });
  });

  describe('generateFixtures', () => {
    it('should generate and save all fixtures', () => {
      const {
        resumeFile,
        jobDescriptionFile,
        analysisFile,
        resume,
        jobDescription,
        analysis
      } = generateFixtures({ prefix: 'test' });

      // Check files were created
      expect(hasFixture(resumeFile)).toBe(true);
      expect(hasFixture(jobDescriptionFile)).toBe(true);
      expect(hasFixture(analysisFile)).toBe(true);

      // Check content matches
      expect(loadFixture(resumeFile)).toBe(resume);
      expect(loadFixture(jobDescriptionFile)).toBe(jobDescription);
      expect(loadFixture<Analysis>(analysisFile, { parse: true })).toEqual(analysis);
    });

    it('should create files with correct extensions', () => {
      const { resumeFile, jobDescriptionFile, analysisFile } = generateFixtures();

      expect(resumeFile).toMatch(/\.txt$/);
      expect(jobDescriptionFile).toMatch(/\.txt$/);
      expect(analysisFile).toMatch(/\.json$/);
    });

    it('should cleanup temporary files after test', () => {
      const { resumeFile } = generateFixtures();
      expect(hasFixture(resumeFile)).toBe(true);
      
      cleanupTempFixtures();
      expect(hasFixture(resumeFile)).toBe(false);
    });
  });
});