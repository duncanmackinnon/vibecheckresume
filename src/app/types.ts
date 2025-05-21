export interface Recommendations {
  improvements: string[];
  strengths: string[];
  skillGaps: string[];
  format: string[];
  isChunked?: boolean;
}

export interface Analysis {
  score: number;
  matchedSkills: Array<{ name: string; match: boolean }>;
  missingSkills: string[];
  recommendations: Recommendations;
  detailedAnalysis: string;
  isChunked?: boolean;
}