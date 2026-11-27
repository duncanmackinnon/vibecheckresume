import type { Analysis, GeneratedResume, ResumeGenerationAnswers } from '@/app/types';
import { SUPPORTED_RESUME_MIMES, type ParsedResumeDocument, type RoleSuggestion, type SupportedResumeMimeType } from '@/lib/resume-parser';
import { createOnboardingProfile, type OnboardingProfileData } from './types';
import { createStarterResumeAnswers, type StarterResumeAnswers } from './starter-resume';
import { draftProfileSchema, unfinishedAnswersSchema } from './schemas';

export const ONBOARDING_SESSION_KEY = 'vibecheck:onboarding:v1';
export const SESSION_SOURCE_RESUME_KEY = 'vibecheck:session-resume:v1';
export const SESSION_WIZARD_RESULT_KEY = 'vibecheck:wizard-result:v1';
export type OnboardingScreen = 'name' | 'choose' | 'upload' | 'build' | 'target' | 'report' | 'builder' | 'result' | 'preferences' | 'connect' | 'cadence' | 'finish';
export interface WizardTargetDraft {
  role: string;
  company: string;
  jobUrl: string;
  jobDescription: string;
  contactDetails: string;
}
export interface WizardResumeResult {
  schemaVersion: 1;
  mode?: 'tailored' | 'builder' | 'kept';
  generatedResume: GeneratedResume | null;
  analysis: Analysis | null;
  analysisMode?: 'ai' | 'deterministic';
  generateMode?: 'ai' | 'deterministic';
  answers: ResumeGenerationAnswers;
  company: string;
  targetRole: string;
  jobUrl: string;
  jobDescription: string;
  updatedAt: string;
}
export interface SessionSourceResume {
  schemaVersion: 1;
  filename: string;
  mimeType: SupportedResumeMimeType;
  origin: 'builder' | 'upload';
  text: string;
  rawText?: string;
  pendingPdfBase64?: string;
  parsedResume?: ParsedResumeDocument;
  suggestedRoles?: RoleSuggestion;
  generatedResume?: GeneratedResume;
  updatedAt: string;
}
export interface OnboardingSession {
  schemaVersion: 1;
  profile: OnboardingProfileData;
  screen: OnboardingScreen;
  answers: StarterResumeAnswers;
  builtResume: boolean;
  builderStep: number;
  selectedFile: { name: string; size: number } | null;
  wizardTarget: WizardTargetDraft;
  preview: boolean;
  pendingSignIn: boolean;
  ownerId: string | null;
}
export function createWizardTargetDraft(): WizardTargetDraft {
  return { role: '', company: '', jobUrl: '', jobDescription: '', contactDetails: '' };
}
export function createOnboardingSession(): OnboardingSession {
  return { schemaVersion: 1, profile: createOnboardingProfile(), screen: 'name', answers: createStarterResumeAnswers(), builtResume: false, builderStep: 0, selectedFile: null, wizardTarget: createWizardTargetDraft(), preview: false, pendingSignIn: false, ownerId: null };
}
export function readOnboardingSession(): OnboardingSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ONBOARDING_SESSION_KEY);
    if (!raw || raw.length > 500_000) return null;
    const data = JSON.parse(raw) as OnboardingSession;
    if (data.schemaVersion !== 1 || typeof data.profile?.displayName !== 'string' || data.profile.displayName.length > 120 || !['name','choose','upload','build','target','report','builder','result','preferences','connect','cadence','finish'].includes(data.screen)) return null;
    const defaults = createOnboardingSession();
    const profile = draftProfileSchema.safeParse((({completedAt:_completedAt,...input})=>input)({...defaults.profile,...data.profile,preferences:{...defaults.profile.preferences,...data.profile.preferences}}));
    const answers = unfinishedAnswersSchema.safeParse({...defaults.answers,...data.answers});
    if(!profile.success || !answers.success || (data.ownerId!=null && typeof data.ownerId!=='string') || (data.builderStep!==undefined && (!Number.isInteger(data.builderStep)||data.builderStep<0||data.builderStep>5)))return null;
    const rawTarget = (data.wizardTarget && typeof data.wizardTarget === 'object' ? data.wizardTarget : {}) as Partial<WizardTargetDraft>;
    const wizardTarget: WizardTargetDraft = {
      role: typeof rawTarget.role === 'string' ? rawTarget.role.slice(0, 200) : '',
      company: typeof rawTarget.company === 'string' ? rawTarget.company.slice(0, 160) : '',
      jobUrl: typeof rawTarget.jobUrl === 'string' ? rawTarget.jobUrl.slice(0, 500) : '',
      jobDescription: typeof rawTarget.jobDescription === 'string' ? rawTarget.jobDescription.slice(0, 40_000) : '',
      contactDetails: typeof rawTarget.contactDetails === 'string' ? rawTarget.contactDetails.slice(0, 1000) : '',
    };
    return { ...defaults, ...data, wizardTarget, screen:data.screen === 'connect' ? 'cadence' : data.screen, ownerId:data.ownerId||null, profile:{...profile.data,completedAt:typeof data.profile.completedAt==='string'?data.profile.completedAt:null}, answers:answers.data };
  } catch { return null; }
}
export function writeOnboardingSession(value: OnboardingSession): boolean {
  try { localStorage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(value)); window.dispatchEvent(new Event('onboarding:updated')); return true; } catch { return false; }
}
export function clearOnboardingSession() { try { localStorage.removeItem(ONBOARDING_SESSION_KEY); window.dispatchEvent(new Event('onboarding:updated')); } catch {} }
export function readSessionSourceResume(): SessionSourceResume | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_SOURCE_RESUME_KEY);
    if (!raw || raw.length > 4_000_000) return null;
    const data = JSON.parse(raw) as SessionSourceResume;
    if (
      data?.schemaVersion !== 1 ||
      typeof data.filename !== 'string' ||
      !SUPPORTED_RESUME_MIMES.includes(data.mimeType as SupportedResumeMimeType)
    ) {
      return null;
    }
    return data;
  } catch { return null; }
}
export function writeSessionSourceResume(value: SessionSourceResume): boolean {
  try { localStorage.setItem(SESSION_SOURCE_RESUME_KEY, JSON.stringify(value)); window.dispatchEvent(new Event('onboarding:updated')); return true; } catch { return false; }
}
export function clearSessionSourceResume() { try { localStorage.removeItem(SESSION_SOURCE_RESUME_KEY); window.dispatchEvent(new Event('onboarding:updated')); } catch {} }
export function readWizardResult(): WizardResumeResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_WIZARD_RESULT_KEY);
    if (!raw || raw.length > 2_000_000) return null;
    const data = JSON.parse(raw) as WizardResumeResult;
    const hasGenerated = Boolean(data?.generatedResume?.preview?.fullName && typeof data.generatedResume.latex === 'string');
    const isKept = data?.mode === 'kept';
    const hasAnalysis = Boolean(data?.analysis && typeof data.analysis.score === 'number');
    if (data?.schemaVersion !== 1 || (!hasGenerated && !isKept && !hasAnalysis)) return null;
    return data;
  } catch { return null; }
}
export function writeWizardResult(value: WizardResumeResult): boolean {
  try { localStorage.setItem(SESSION_WIZARD_RESULT_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function clearWizardResult() { try { localStorage.removeItem(SESSION_WIZARD_RESULT_KEY); } catch {} }
/** Anonymous sign-in intent may be adopted once; private drafts never cross identities. */
export function sessionForOwner(session: OnboardingSession | null, ownerId: string | null): OnboardingSession | null {
  if (!session || (session.ownerId && session.ownerId !== ownerId)) return null;
  if (ownerId && !session.ownerId && !session.pendingSignIn) return null;
  return { ...session, ownerId, pendingSignIn: false };
}
export function profileScreen(profile: OnboardingProfileData): OnboardingScreen {
  if (profile.step === 'resume') return profile.resumePath === 'upload' ? 'upload' : 'choose';
  if (profile.step === 'connect') return 'cadence';
  if (profile.step === 'complete') return 'finish';
  return profile.step;
}
