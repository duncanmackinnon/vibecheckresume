export interface Skill {
  name: string;
  match: boolean;
}

export interface AnalysisResult {
  score: number;
  matchedSkills: Skill[];
  missingSkills: string[];
}

export interface ResumeAnalysis {
  result: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
}