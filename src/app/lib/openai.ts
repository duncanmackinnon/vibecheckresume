import { OpenAI } from 'openai';
import { Analysis } from '../types';
import { ConfigurationError, handleOpenAIError, formatError } from './errors';
import { analyzeResume as localAnalyze } from './localAnalysis';

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.MOCK_OPENAI_RESPONSES === 'true';

// Initialize Deepseek client
const apiKey = process.env.DEEPSEEK_API_KEY;

console.log('OpenAI API Key from env:', apiKey ? '***' + apiKey.slice(-4) : 'NOT FOUND');

let openai: OpenAI | null = null;

if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length !== 51) {
  if (!isTestEnv) {
    throw new ConfigurationError('OpenAI API key is not configured or invalid');
  } else {
    console.warn('Skipping OpenAI initialization in test mode');
  }
} else {
  const openaiConfig = {
    apiKey,
    organization: process.env.OPENAI_ORG_ID
  };

  console.log('OpenAI Client Configuration:', {
    ...openaiConfig,
    apiKey: openaiConfig.apiKey ? '***' + openaiConfig.apiKey.slice(-4) : undefined
  });

  openai = new OpenAI(openaiConfig);
}

interface OpenAISkill {
  name: string;
  match: boolean;
}

interface OpenAIResponse {
  score: number;
  matchedSkills: OpenAISkill[];
  missingSkills: string[];
  recommendations: {
    improvements: string[];
    strengths: string[];
    skillGaps: string[];
    format: string[];
  };
  detailedAnalysis: string;
}

export interface ResumeAnalysisPrompt {
  resumeText: string;
  jobDescription: string;
  signal?: AbortSignal;
}

export async function analyzeResume({ resumeText, jobDescription, signal }: ResumeAnalysisPrompt): Promise<Analysis> {
  const startTime = Date.now();
  console.log('Starting resume analysis...');
  
  // Fallback to local analysis in tests or when OpenAI is not configured
  if (!openai) {
    return localAnalyze(resumeText, jobDescription);
  }
  
  // Optimize input for token limits
  const MAX_TOKENS = 12000; // Leave room for response
  const CHARS_PER_TOKEN = 4; // Approximate
  const MAX_TEXT_LENGTH = MAX_TOKENS * CHARS_PER_TOKEN;
  
  const preprocess = (text: string) => {
    // Remove excessive whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Remove redundant newlines
    text = text.replace(/\n{3,}/g, '\n\n');
    return text;
  };

  resumeText = preprocess(resumeText);
  jobDescription = preprocess(jobDescription);

  const totalLength = resumeText.length + jobDescription.length;
  if (totalLength > MAX_TEXT_LENGTH) {
    const ratio = MAX_TEXT_LENGTH / totalLength;
    const newResumeLength = Math.floor(resumeText.length * ratio);
    const newJobDescLength = Math.floor(jobDescription.length * ratio);
    
    console.warn(`Content too long (${totalLength} chars), scaling to fit token limit...`);
    console.warn(`Resume: ${resumeText.length} -> ${newResumeLength} chars`);
    console.warn(`Job Description: ${jobDescription.length} -> ${newJobDescLength} chars`);
    
    resumeText = resumeText.slice(0, newResumeLength);
    jobDescription = jobDescription.slice(0, newJobDescLength);
  }

  const prompt = `As an expert resume analyst, provide a detailed comparison between this resume and job description.
  Focus on key requirements, skills alignment, and actionable feedback.

  RESPONSE REQUIREMENTS:
  1. Must be valid JSON format matching this schema:
  {
    "matchScore": number (0-100),
    "strengths": string[],
    "weaknesses": string[],
    "missingSkills": string[],
    "recommendations": string[],
    "detailedAnalysis": string (500-1000 words)
  }
  2. detailedAnalysis must be comprehensive (500-1000 words)
  3. All arrays should contain 3-5 items minimum

  RESUME CONTENT:
  ${resumeText}

  JOB REQUIREMENTS:
  ${jobDescription}

  ANALYSIS REQUIREMENTS:
  1. Calculate match score (0-100) considering:
     - Required skills coverage (weight: 40%)
     - Experience level alignment (weight: 30%)
     - Education requirements (weight: 20%)
     - Cultural fit indicators (weight: 10%)
  2. Provide specific examples from the resume where possible
  3. Highlight both technical and soft skills
     - Education requirements match
  2. Extract and verify skill matches
  3. Identify gaps in required skills
  4. Provide specific improvement recommendations
  5. Highlight candidate strengths
  6. Suggest format enhancements
  7. Include comprehensive match analysis

Respond with valid JSON in this exact format:
{
  "score": number,
  "matchedSkills": [{"name": string, "match": boolean}],
  "missingSkills": [string],
  "recommendations": {
    "improvements": [string],
    "strengths": [string],
    "skillGaps": [string],
    "format": [string]
  },
  "detailedAnalysis": string
}`;

  try {
    console.log('Sending request to OpenAI...');
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-16k",
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
      ...(signal ? { signal } : {})
    });

    console.log(`OpenAI request completed in ${Date.now() - startTime}ms`);
    
    // Validate response structure
    if (!response?.choices?.[0]?.message?.content) {
      console.error('Invalid OpenAI response structure:', response);
      throw new Error('Invalid response structure from OpenAI');
    }
    
    const content = response.choices[0].message.content;
    console.log('OpenAI response content length:', content.length);

    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    if (content.length < 50) {
      console.error('Suspiciously short response from OpenAI:', content);
      throw new Error('Response from OpenAI appears truncated');
    }

    // Parse and validate response structure
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse OpenAI response:', e);
      throw new Error('Invalid JSON response from OpenAI');
    }

    const requiredFields = [
      'matchScore',
      'strengths',
      'weaknesses',
      'missingSkills',
      'recommendations',
      'detailedAnalysis'
    ];
    
    for (const field of requiredFields) {
      if (!(field in result)) {
        console.error('Missing required field in response:', field);
        throw new Error(`Response missing required field: ${field}`);
      }
    }

    if (typeof result.matchScore !== 'number' ||
        result.matchScore < 0 ||
        result.matchScore > 100) {
      console.error('Invalid matchScore:', result.matchScore);
      throw new Error('Invalid matchScore value');
    }

    return result;

    try {
      const result = JSON.parse(content) as OpenAIResponse;
      console.log('Successfully parsed OpenAI response');
      
      // Validate and sanitize response
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format: expected object');
      }

      if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
        throw new Error('Invalid score: must be a number between 0 and 100');
      }

      if (!Array.isArray(result.matchedSkills) || !result.matchedSkills.every(skill =>
        skill && typeof skill === 'object' && 'name' in skill && 'match' in skill)) {
        throw new Error('Invalid matchedSkills: each skill must have name and match properties');
      }

      if (!Array.isArray(result.missingSkills) || !result.missingSkills.every(skill => typeof skill === 'string')) {
        throw new Error('Invalid missingSkills: must be an array of strings');
      }

      if (!result.recommendations || typeof result.recommendations !== 'object') {
        throw new Error('Invalid recommendations: must be an object');
      }

      const requiredArrays = ['improvements', 'strengths', 'skillGaps', 'format'] as const;
      for (const key of requiredArrays) {
        const value = result.recommendations[key];
        if (!Array.isArray(value)) {
          throw new Error(`Invalid recommendations.${key}: must be an array, got ${typeof value}`);
        }
        if (!value.every(item => typeof item === 'string')) {
          throw new Error(`Invalid recommendations.${key}: all items must be strings`);
        }
      }
      
      const analysis: Analysis = {
        score: Math.max(0, Math.min(100, result.score)),
        matchedSkills: result.matchedSkills.map((skill: OpenAISkill) => ({
          name: String(skill.name || ''),
          match: Boolean(skill.match)
        })),
        missingSkills: result.missingSkills.map(String),
        recommendations: {
          improvements: (result.recommendations.improvements || []).map(String),
          strengths: (result.recommendations.strengths || []).map(String),
          skillGaps: (result.recommendations.skillGaps || []).map(String),
          format: (result.recommendations.format || []).map(String)
        },
        detailedAnalysis: String(result.detailedAnalysis)
      };
      const processingTime = Date.now() - startTime;
      console.log('Analysis completed in %dms:', processingTime, {
        score: analysis.score,
        matchedSkillsCount: analysis.matchedSkills?.length ?? 0,
        missingSkillsCount: analysis.missingSkills?.length ?? 0,
        recommendationsCount: {
          improvements: analysis.recommendations?.improvements?.length ?? 0,
          strengths: analysis.recommendations?.strengths?.length ?? 0,
          skillGaps: analysis.recommendations?.skillGaps?.length ?? 0,
          format: analysis.recommendations?.format?.length ?? 0
        }
      });

      return analysis;
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Raw response:', content);
      throw new Error('Failed to parse analysis results');
    }
  } catch (error) {
    console.error('OpenAI Analysis Error:', error);
    const formattedError = formatError(error);
    throw new Error(formattedError);
  }
}
