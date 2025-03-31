import { Analysis } from '../types';
import { ConfigurationError } from './errors';
import { Buffer } from 'buffer';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

// PDF.js worker setup
const pdfjsLib = await import('pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js';

// Polyfill for AbortSignal.any()
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  
  function onAbort() {
    controller.abort();
    for (const signal of signals) {
      signal.removeEventListener('abort', onAbort);
    }
  }

  for (const signal of signals) {
    if (signal.aborted) {
      onAbort();
      break;
    }
    signal.addEventListener('abort', onAbort);
  }

  return controller.signal;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MAX_TOKENS = 60000; // Stay well under 65536 limit
const AVG_CHARS_PER_TOKEN = 4; // Rough estimate for token counting
// Configuration optimized for thorough analysis
const CHUNK_SIZE = 10000;     // Smaller chunks for better processing
const MIN_CHUNK_SIZE = 5000;  // Minimum meaningful chunk size
const TIMEOUT_MS = 75000;     // Extended timeout for thorough processing
const INITIAL_TIMEOUT = 45000; // Longer initial timeout
const MAX_RETRIES = 2;        // Fewer retries to fail fast
const RETRY_DELAY = 3000;     // Quick retry for responsiveness
const DEEPSEEK_MODEL = 'deepseek-chat'; // Large context model for better analysis. No such thing as -32k
const MAX_LENGTH = 32000;     // Maximum text length to process

interface DeepSeekMessage {
  role: 'system' | 'user';
  content: string;
}

interface DeepSeekResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

interface SkillMatch {
  name: string;
  match: boolean;
  notes?: string;
}

interface ComparisonResponse {
  matchedSkills: SkillMatch[];
  missingSkills: string[];
  score: number;
  matchNotes?: string;
}

// Initialize DeepSeek client
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  throw new ConfigurationError('DeepSeek API key is not configured');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

async function summarizeText(text: string, signal?: AbortSignal): Promise<string> {
  if (!text || text.trim().length === 0) {
    throw new Error('Empty text provided for summarization');
  }

  // Clean and normalize text first
  const cleanText = text
    .replace(/^%PDF.*\n/g, '')
    .replace(/[\x00-\x1F\x7F-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into meaningful sections
  const sections = cleanText.split(/\n\s*\n/).filter(s => s.trim().length > 50);
  console.log(`Found ${sections.length} meaningful sections in resume`);

  // Process sections in batches of 2-3 for better context
  const batchSize = 3;
  let combinedSummary = '';

  for (let i = 0; i < sections.length; i += batchSize) {
    const batch = sections.slice(i, i + batchSize).join('\n\n');
    const batchSummary = await callDeepSeek([{
      role: 'system',
      content: `Extract key technical details from this resume section:
      - Skills with experience levels
      - Job titles and responsibilities
      - Education and certifications
      - Notable achievements
      Return in bullet point format`
    }, {
      role: 'user',
      content: batch
    }], signal);

    combinedSummary += batchSummary + '\n\n';
  }

  return combinedSummary.trim();
}

async function callDeepSeek(messages: DeepSeekMessage[], signal?: AbortSignal, requireJson: boolean = false): Promise<string> {
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (totalTokens > MAX_TOKENS) {
    throw new Error(`Request too large (${totalTokens} tokens). Max allowed: ${MAX_TOKENS}`);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      // Start with shorter timeout, increase on retries
      const currentTimeout = attempt === 0 ? INITIAL_TIMEOUT : TIMEOUT_MS;
      const timeoutId = setTimeout(() => {
        console.log(`Request timeout after ${currentTimeout}ms (attempt ${attempt + 1})`);
        controller.abort();
      }, currentTimeout);

      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: Math.min(4096, MAX_TOKENS - totalTokens),
          stream: false, // Disable streaming for faster response
          ...(requireJson && { response_format: { type: "json_object" } })
        }),
        signal: signal ? anySignal([signal, controller.signal]) : controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek API error: ${response.statusText} - ${errorBody}`);
      }

      const data: DeepSeekResponse = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt + 1} failed:`, error);

      // Don't retry if it's an abort from the parent signal
      if (signal?.aborted) {
        break;
      }

      // Progressive backoff with detailed logging
      const delay = RETRY_DELAY * Math.pow(2, attempt);
      console.log(`Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('DeepSeek API call failed after retries');
}

async function analyzeJobDescription(jd: string, signal?: AbortSignal): Promise<{
  requiredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
}> {
  const summary = await summarizeText(jd, signal);

  const messages: DeepSeekMessage[] = [{
    role: 'system',
    content: `Extract key technical requirements from this job description.

Look for:
1. Technical skills (programming languages, tools, frameworks)
2. Domain knowledge (ML, web dev, cloud, etc.)
3. Experience levels with specific technologies
4. Required certifications or qualifications

Be thorough but fair - include both explicit and implicit requirements.

Include 'json' in response. Format as:
{
  "requiredSkills": "skill1 (3+ years), skill2, skill3 (expert)",
  "responsibilities": ["Key technical responsibility 1", "Technical task 2"],
  "qualifications": ["Required qualification 1", "Technical certification 2"]
}`
  }, {
    role: 'user',
    content: summary
  }];

  const result = await callDeepSeek(messages, signal, true); // Enable JSON formatting
  const parsed = JSON.parse(result);

  return {
    requiredSkills: parsed.requiredSkills?.split(',').map((s: string) => s.trim()) || [],
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
    qualifications: Array.isArray(parsed.qualifications) ? parsed.qualifications : []
  };
}

async function extractTextFromPDF(pdfFile: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js';

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    disableFontFace: true,
    disableAutoFetch: true
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() + '\n';
    }

    clearTimeout(timeout);

    if (!fullText.trim()) {
      throw new Error('PDF appears to be empty or unreadable');
    }

    const wordCount = fullText.split(/\s+/).length;
    console.log(`Extracted resume text (${wordCount} words):`, fullText.substring(0, 200) + '...');

    if (wordCount < 50) {
      throw new Error('PDF contains insufficient text content (less than 50 words)');
    }

    return fullText;
  } catch (error) {
    clearTimeout(timeout);
    console.error('PDF parsing failed:', error);
    throw new Error('Failed to parse PDF. Please try another file.');
  }
}

export const analyzeResume = async (
  formData: FormData,
  signal?: AbortSignal
): Promise<Analysis> => {
  const resumeFile = formData.get('resume') as File;
  const jobDescription = formData.get('jobDescription') as string;

  if (!resumeFile || !jobDescription) {
    throw new Error('Missing required input');
  }

  let resumeText = '';
  try {
    resumeText = resumeFile.type === 'application/pdf'
      ? await extractTextFromPDF(resumeFile)
      : await resumeFile.text();
  } catch (error) {
    console.error('File processing error:', error);
    throw new Error(`Failed to process file: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    // First summarize the resume
    const resumeSummary = await summarizeText(resumeText, signal);

    // Analyze job description
    const jdAnalysis = await analyzeJobDescription(jobDescription, signal);

    // Compare summarized resume to job requirements
    const messages: DeepSeekMessage[] = [{
      role: 'system',
      content: `Provide an optimistic skill match analysis between resume and job requirements.
Required skills: ${jdAnalysis.requiredSkills.join(', ')}

Scoring Guidelines:
1. Start score at 65 (baseline competency)
2. For each skill match:
   - Exact match: +7 points
   - Related/similar tech: +5 points
   - Domain knowledge: +3 points
3. For missing skills:
   - Critical missing: -4 points
   - Nice-to-have missing: -2 points
4. Bonus points:
   - Relevant experience: +5
   - Advanced expertise: +5
   - Industry match: +5
Maximum score: 100

Consider these matches:
- Version variations (e.g., React 16 vs 18)
- Tech family (Node.js counts for JavaScript)
- Framework similarities (Vue experience helps with React)
- Tool alternatives (GitLab ~ GitHub)
- Implicit skills (AWS Lambda implies serverless)

Include 'json' in response. Format exactly as:
{
  "matchedSkills": [
    {"name": "skill1", "match": true, "notes": "Strong match - 5 years experience"},
    {"name": "skill2", "match": true, "notes": "Related experience via similar tech"}
  ],
  "missingSkills": ["skill3"],
  "score": 85,
  "matchNotes": "Analysis of skills match against job requirements",
  "formatSuggestions": [
    "Reorganize skills section by proficiency",
    "Add project impact metrics",
    "Highlight most relevant experience first"
  ]
}`
    }, {
      role: 'user',
      content: `Complete Resume Details:
----------------
${resumeSummary}
----------------

Job Description Key Points:
----------------
Skills Required: ${jdAnalysis.requiredSkills.join(', ')}
Responsibilities: ${jdAnalysis.responsibilities.join('\n- ')}
Qualifications: ${jdAnalysis.qualifications.join('\n- ')}
----------------

Compare the resume details against these requirements, noting any matches, partial matches, or missing skills.
Be thorough in analyzing the resume content before scoring.
Handle technology variations intelligently (e.g. Git/GitHub, React/ReactJS).
Group similar technologies together in analysis.
Return consistent scoring for identical inputs.`
    }];

    const comparison = JSON.parse(await callDeepSeek(messages, signal, true)); // Enable JSON format

    // Process assessment
    const assessment = {
      score: comparison.score || 65, // Default to baseline score
      matchedSkills: comparison.matchedSkills || [],
      missingSkills: comparison.missingSkills || [],
      recommendations: {
        improvements: comparison.missingSkills?.map((skill: string) =>
          `Consider gaining experience with ${skill}`) || [],
        skillGaps: [],
        format: comparison.formatSuggestions || [
          'Reorganize skills section by relevance',
          'Add quantifiable achievements',
          'Tailor summary to job requirements'
        ]
      },
      detailedAnalysis: comparison.matchNotes || 'Analysis completed successfully',
      modifiedResume: '',
      isChunked: true,
      formatSuggestions: comparison.formatSuggestions || [
        'Use bullet points for key achievements',
        'Include metrics where possible',
        'Highlight technical skills prominently'
      ]
    };

    // Ensure score stays within bounds
    assessment.score = Math.min(100, Math.max(0, assessment.score));

    return assessment;
  } catch (error) {
    console.error('Analysis error:', error);
    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};