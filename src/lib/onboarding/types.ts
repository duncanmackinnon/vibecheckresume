import type { StoredRecord } from '@/lib/tracker/types';
import type { StarterResumeAnswers } from './starter-resume';
import type { OnboardingScreen } from './session';

export interface OnboardingDraftData {
  profile: OnboardingProfileData;
  screen: OnboardingScreen;
  answers: StarterResumeAnswers;
  builtResume: boolean;
  builderStep: number;
}
export type SavedOnboardingDraft = StoredRecord<OnboardingDraftData>;

export interface JobPreferences {
  roles: string;
  locations: string;
  workModes: ('remote' | 'hybrid' | 'onsite')[];
  employmentTypes: ('full-time' | 'part-time' | 'contract' | 'internship')[];
  additionalContext: string;
}
export interface OnboardingProfileData {
  displayName: string;
  step: 'name' | 'resume' | 'build' | 'preferences' | 'connect' | 'complete';
  resumePath: 'upload' | 'build' | null;
  sourceResumeId: string | null;
  preferences: JobPreferences;
  cadence: 'manual' | 'daily' | 'weekly';
  discoveryConsent: boolean;
  completedAt: string | null;
}
export type OnboardingProfile = OnboardingProfileData;
export type SavedOnboardingProfile = StoredRecord<OnboardingProfileData>;
export function createOnboardingProfile(displayName = ''): OnboardingProfileData {
  return { displayName, step: 'name', resumePath: null, sourceResumeId: null,
    preferences: { roles: '', locations: '', workModes: [], employmentTypes: [], additionalContext: '' },
    cadence: 'manual', discoveryConsent: false, completedAt: null };
}
