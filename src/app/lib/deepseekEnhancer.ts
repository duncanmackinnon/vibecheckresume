import { Analysis } from '../types';
import { analyzeResume as localAnalyze } from './localAnalysis';

// Defer OpenAI initialization to runtime
let openai: any = null;

async function initializeOpenAI() {
  if (!openai) {
    try {
      console.log('Initializing OpenAI client...');
      const { default: OpenAI } = await import('openai');
      
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY is not configured');
      }

      openai = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/',
      });
      console.log('OpenAI client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
      throw new Error('Failed to initialize AI client');
    }
  }
  return openai;
}

/**
 * Ensures an object is serializable to JSON
 */
function ensureSerializable<T>(obj: T): T {
  // Use JSON parse/stringify to remove any non-serializable content
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Enhances the local analysis with AI-powered insights
 */
async function enhanceAnalysis(
  resumeText: string,
  jobDescription: string,
  localAnalysis: Analysis
): Promise<Analysis> {
  try {
    console.log('Starting AI enhancement...');
    const client = await initializeOpenAI();

    const prompt = `
Analyze this resume and job description match:

Job Description Summary:
${jobDescription.substring(0, 500)}...

Resume Summary:
${resumeText.substring(0, 500)}...

Current Analysis:
- Match Score: ${localAnalysis.score}%
- Matched Skills: ${localAnalysis.matchedSkills.filter(s => s.match).map(s => s.name).join(', ')}
- Missing Skills: ${localAnalysis.missingSkills.join(', ')}

Please provide:
1. Career alignment analysis
2. Specific experience enhancement suggestions
3. Industry-specific recommendations
4. Skills presentation improvements
5. Achievement quantification suggestions`;

    try {
      console.log('Sending request to Deepseek API...');
      const completion = await client.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "deepseek-chat",  // Using the correct model name
      });

      // Ensure we have valid response data
      if (!completion?.choices?.[0]?.message?.content) {
        console.warn('Invalid or empty AI response, falling back to local analysis');
        return ensureSerializable(localAnalysis);
      }

      const aiInsights = completion.choices[0].message.content;
      console.log('Received AI insights, length:', aiInsights.length);

      // Create enhanced analysis with validated data
      const enhancedAnalysis: Analysis = {
        ...localAnalysis,
        detailedAnalysis: `
${localAnalysis.detailedAnalysis}

AI-Enhanced Insights:
${aiInsights}`.trim(),
        recommendations: {
          improvements: [
            ...(localAnalysis.recommendations?.improvements || []),
            ...extractImprovements(aiInsights)
          ],
          strengths: [
            ...(localAnalysis.recommendations?.strengths || []),
            ...extractStrengths(aiInsights)
          ],
          skillGaps: localAnalysis.recommendations?.skillGaps || [],
          format: localAnalysis.recommendations?.format || [],
        }
      };

      // Ensure the enhanced analysis is serializable
      return ensureSerializable(enhancedAnalysis);
    } catch (apiError: any) {
      console.error('DeepSeek API error:', {
        error: apiError,
        status: apiError?.status,
        message: apiError?.message,
        response: apiError?.response
      });
      
      console.warn('API call failed, falling back to local analysis');
      return ensureSerializable(localAnalysis);
    }
  } catch (error) {
    console.error('AI enhancement failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return ensureSerializable(localAnalysis);
  }
}

function extractImprovements(aiInsights: string): string[] {
  try {
    const improvements: string[] = [];
    const lines = aiInsights.split('\n');
    
    let isImprovementSection = false;
    for (const line of lines) {
      if (line.toLowerCase().includes('improve') || line.toLowerCase().includes('suggest')) {
        isImprovementSection = true;
      } else if (line.trim() === '') {
        isImprovementSection = false;
      } else if (isImprovementSection && line.trim().startsWith('-')) {
        improvements.push(line.trim().substring(1).trim());
      }
    }

    return improvements;
  } catch (error) {
    console.error('Error extracting improvements:', error);
    return [];
  }
}

function extractStrengths(aiInsights: string): string[] {
  try {
    const strengths: string[] = [];
    const lines = aiInsights.split('\n');
    
    let isStrengthSection = false;
    for (const line of lines) {
      if (line.toLowerCase().includes('strength') || line.toLowerCase().includes('advantage')) {
        isStrengthSection = true;
      } else if (line.trim() === '') {
        isStrengthSection = false;
      } else if (isStrengthSection && line.trim().startsWith('-')) {
        strengths.push(line.trim().substring(1).trim());
      }
    }

    return strengths;
  } catch (error) {
    console.error('Error extracting strengths:', error);
    return [];
  }
}

/**
 * Main analysis function that combines local and AI-enhanced analysis
 */
export async function analyzeWithAI(resumeText: string, jobDescription: string): Promise<Analysis> {
  try {
    console.log('Starting analysis process...');
    
    // First perform local analysis
    const localResults = localAnalyze(resumeText, jobDescription);
    
    // Only attempt AI enhancement if content is substantial
    if (resumeText.length < 100 || jobDescription.length < 100) {
      console.log('Content too short for AI analysis, using local analysis');
      return ensureSerializable(localResults);
    }

    // Attempt AI enhancement
    return await enhanceAnalysis(resumeText, jobDescription, localResults);
  } catch (error) {
    console.error('Analysis failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    // Fallback to local analysis
    return ensureSerializable(localAnalyze(resumeText, jobDescription));
  }
}