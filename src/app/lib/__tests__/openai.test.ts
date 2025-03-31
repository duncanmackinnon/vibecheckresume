import { analyzeResume } from '../openai';

describe('OpenAI Integration', () => {
  const mockResume = `
John Doe
Software Engineer
Email: john@example.com

Skills:
- JavaScript
- React
- Node.js
- TypeScript

Experience:
Software Engineer at Tech Co (2020-Present)
- Developed web applications using React and TypeScript
- Implemented RESTful APIs using Node.js
`;

  const mockJobDescription = `
Senior Software Engineer

Requirements:
- 5+ years of experience with JavaScript and React
- Strong knowledge of TypeScript
- Experience with Node.js and RESTful APIs
- Familiarity with AWS and cloud services
- Experience with Python (required)
- Knowledge of Docker and Kubernetes
`;

  it('should analyze resume against job description', async () => {
    try {
      console.log('Starting OpenAI integration test...');
      
      const result = await analyzeResume({
        resumeText: mockResume,
        jobDescription: mockJobDescription
      });

      console.log('Analysis result:', result);

      expect(result).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.matchedSkills)).toBe(true);
      expect(Array.isArray(result.missingSkills)).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(typeof result.detailedAnalysis).toBe('string');

    } catch (error) {
      console.error('Test failed:', error);
      throw error;
    }
  }, 30000); // Increased timeout for API call
});