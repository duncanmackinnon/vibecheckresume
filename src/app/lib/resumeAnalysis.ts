import { Deepseek } from './deepseek';
import { Analysis } from '../types';
import { ConfigurationError } from './errors';

export interface ResumeAnalysisPrompt {
  resumeText: string;
  jobDescription: string;
  signal?: AbortSignal;
}

export async function analyzeResume({ resumeText, jobDescription, signal }: ResumeAnalysisPrompt): Promise<Analysis> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError('Deepseek API key is not configured');
  }

  const deepseek = new Deepseek({ apiKey });

  // Preprocess text
  const preprocess = (text: string) => text.replace(/\s+/g, ' ').trim().replace(/\n{3,}/g, '\n\n');
  const processedResume = preprocess(resumeText);
  const processedJobDesc = preprocess(jobDescription);

  const prompt = `As an expert resume analyst, provide a detailed comparison between this resume and job description.
  Focus on key requirements, skills alignment, and actionable feedback.

  RESPONSE REQUIREMENTS:
  1. Must be valid JSON format matching this schema:
  {
    "score": number (0-100),
    "matchedSkills": [{"name": string, "match": boolean}],
    "missingSkills": [string],
    "recommendations": {
      "improvements": [string],
      "strengths": [string],
      "skillGaps": [string],
      "format": [string]
    },
    "detailedAnalysis": string
  }

  RESUME CONTENT:
  ${processedResume}

  JOB REQUIREMENTS:
  ${processedJobDesc}`;

  try {
    const response = await deepseek.analyze({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an expert resume analyst and career advisor. Provide detailed, actionable analysis and recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      signal
    });

    if (!response?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response structure from Deepseek');
    }

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);

    // Validate response structure
    const requiredFields = ['score', 'matchedSkills', 'missingSkills', 'recommendations', 'detailedAnalysis'];
    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new Error(`Response missing required field: ${field}`);
      }
    }

    return result as Analysis;
  } catch (error) {
    console.error('Deepseek Analysis Error:', error);
    throw error;
  }
}