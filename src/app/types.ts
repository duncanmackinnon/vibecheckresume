export interface Recommendations {
  improvements: string[];
  strengths: string[];
  skillGaps: string[];
  format: string[];
  isChunked?: boolean;
}

export interface EvaluationCategory {
  id: string;
  label: string;
  score: number;
  max: number;
  evidence: string;
}

export interface EvaluationBonus {
  score: number;
  max: number;
  evidence: string;
}

export interface EvaluationDeductions {
  score: number;
  evidence: string;
}

export interface AnalysisEvaluation {
  categories: EvaluationCategory[];
  bonus: EvaluationBonus;
  deductions: EvaluationDeductions;
  fairnessNotes: string[];
}

export interface ResumeSections {
  basics: string[];
  work: string[];
  education: string[];
  skills: string[];
  projects: string[];
  awardsCertifications: string[];
}

export type RoleRequirementStatus = 'matched' | 'partial' | 'missing';

export interface RoleRequirement {
  text: string;
  status: RoleRequirementStatus;
  evidence: string;
}

export type PriorityActionImpact = 'medium' | 'high';
export type PriorityActionEffort = 'low' | 'medium' | 'high';

export interface PriorityAction {
  categoryId: string;
  title: string;
  rationale: string;
  impact: PriorityActionImpact;
  effort: PriorityActionEffort;
  exampleRewrite?: string;
}

export interface ResumeBuilderProfile {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: string[];
  headline?: string;
  summary?: string;
  workHighlights: string[];
  education: string[];
  skills: string[];
  projects: string[];
  awardsCertifications: string[];
}

export type ResumeGenerationAnswers = Record<string, string>;

export interface ResumeGenerationQuestion {
  id: string;
  label: string;
  prompt: string;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
}

export interface GeneratedResumePreviewItem {
  heading: string;
  subheading?: string;
  meta?: string;
  date?: string;
  details: string[];
}

export interface GeneratedResumePreviewSection {
  title: string;
  items: GeneratedResumePreviewItem[];
}

export interface GeneratedResumePreviewSkillGroup {
  label: string;
  skills: string[];
}

export interface GeneratedResumePreview {
  fullName: string;
  contact: string[];
  headline?: string;
  summary?: string;
  sections: GeneratedResumePreviewSection[];
  skillGroups: GeneratedResumePreviewSkillGroup[];
}

export interface GeneratedResume {
  latex: string;
  preview: GeneratedResumePreview;
  tailoringNotes: string[];
  assumptions: string[];
  followUpQuestions: string[];
}

export interface Analysis {
  score: number;
  matchedSkills: Array<{ name: string; match: boolean }>;
  missingSkills: string[];
  recommendations: Recommendations;
  detailedAnalysis: string;
  evaluation?: AnalysisEvaluation;
  resumeSections?: ResumeSections;
  resumeBuilderProfile?: ResumeBuilderProfile;
  roleRequirements?: RoleRequirement[];
  priorityActions?: PriorityAction[];
  isChunked?: boolean;
}
