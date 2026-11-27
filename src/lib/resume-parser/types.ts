import type { SupportedResumeMimeType } from './formats';

export interface RawPositionedSpan {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  hasEOL?: boolean;
  href?: string;
}

export interface LayoutLink {
  label: string;
  url: string;
}

export interface LayoutLine {
  text: string;
  leftText: string;
  rightText?: string;
  x: number;
  y: number;
  page: number;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  isUpperCase: boolean;
  hasBullet: boolean;
  indent: number;
  gapAbove: number;
  column: 'header' | 'main' | 'sidebar';
  links: LayoutLink[];
  headingLevel?: number;
}

export type LayoutTopology = 'single-column' | 'two-column' | 'structured-markup' | 'plain-text';

export interface LayoutDocument {
  lines: LayoutLine[];
  pageWidth: number;
  pageHeight: number;
  layoutType: LayoutTopology;
  extractedLinkAnnotations: number;
}

export type SectionKind =
  | 'header'
  | 'summary'
  | 'experience'
  | 'projects'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'awards'
  | 'publications'
  | 'volunteering'
  | 'other';

export interface DocumentSection {
  kind: SectionKind;
  title: string;
  rawHeading?: string;
  lines: LayoutLine[];
}

export interface TypedLink {
  kind: 'github' | 'linkedin' | 'portfolio' | 'email' | 'other';
  label?: string;
  url: string;
  display: string;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  location?: string;
  dateRange?: string;
  isCurrent: boolean;
  bullets: string[];
  rawHeader?: string;
}

export interface ProjectEntry {
  name: string;
  roleOrSubtitle?: string;
  technologies: string[];
  links: string[];
  dateRange?: string;
  bullets: string[];
}

export interface EducationEntry {
  institution: string;
  degree?: string;
  field?: string;
  location?: string;
  graduationDate?: string;
  gpa?: string;
  details: string[];
}

export interface SkillCategory {
  category: string;
  items: string[];
}

export type RoleSuggestionSource = 'headline' | 'experience' | 'projects_education' | 'none';

export interface RoleSuggestion {
  roles: string[];
  primaryRole?: string;
  formatted: string;
  source: RoleSuggestionSource;
  confidence: number;
}

export interface ParsedResumeDocument {
  schemaVersion: 1;
  sourceFormat: SupportedResumeMimeType;
  layoutType: LayoutTopology;
  extractedLinkAnnotations: number;
  canonicalText: string;
  fullName?: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: TypedLink[];
  summary?: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  skillCategories: SkillCategory[];
  flatSkills: string[];
  certifications: string[];
  awards: string[];
  otherSections: Array<{ title: string; lines: string[] }>;
  sections: DocumentSection[];
  suggestedRoles: RoleSuggestion;
}
