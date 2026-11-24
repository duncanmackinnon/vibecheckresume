import { createOnboardingProfile, type OnboardingProfileData } from './types';
import { createStarterResumeAnswers, type StarterResumeAnswers } from './starter-resume';
import { draftProfileSchema, unfinishedAnswersSchema } from './schemas';

export const ONBOARDING_SESSION_KEY = 'vibecheck:onboarding:v1';
export const SESSION_SOURCE_RESUME_KEY = 'vibecheck:session-resume:v1';
export type OnboardingScreen = 'name' | 'choose' | 'upload' | 'build' | 'preferences' | 'connect' | 'cadence' | 'finish';
export interface SessionSourceResume {
  schemaVersion: 1;
  filename: string;
  mimeType: 'text/plain' | 'application/pdf';
  origin: 'builder' | 'upload';
  text: string;
  pendingPdfBase64?: string;
  generatedResume?: import('@/app/types').GeneratedResume;
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
  preview: boolean;
  pendingSignIn: boolean;
  ownerId: string | null;
}
export function createOnboardingSession(): OnboardingSession {
  return { schemaVersion: 1, profile: createOnboardingProfile(), screen: 'name', answers: createStarterResumeAnswers(), builtResume: false, builderStep:0, selectedFile: null, preview: false, pendingSignIn: false, ownerId: null };
}
export function readOnboardingSession(): OnboardingSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ONBOARDING_SESSION_KEY);
    if (!raw || raw.length > 500_000) return null;
    const data = JSON.parse(raw) as OnboardingSession;
    if (data.schemaVersion !== 1 || typeof data.profile?.displayName !== 'string' || data.profile.displayName.length > 120 || !['name','choose','upload','build','preferences','connect','cadence','finish'].includes(data.screen)) return null;
    const defaults = createOnboardingSession();
    const profile = draftProfileSchema.safeParse((({completedAt:_completedAt,...input})=>input)({...defaults.profile,...data.profile,preferences:{...defaults.profile.preferences,...data.profile.preferences}}));
    const answers = unfinishedAnswersSchema.safeParse({...defaults.answers,...data.answers});
    if(!profile.success || !answers.success || (data.ownerId!=null && typeof data.ownerId!=='string') || (data.builderStep!==undefined && (!Number.isInteger(data.builderStep)||data.builderStep<0||data.builderStep>5)))return null;
    return { ...defaults, ...data, screen:data.screen === 'connect' ? 'cadence' : data.screen, ownerId:data.ownerId||null, profile:{...profile.data,completedAt:typeof data.profile.completedAt==='string'?data.profile.completedAt:null}, answers:answers.data };
  } catch { return null; }
}
export function writeOnboardingSession(value: OnboardingSession): boolean {
  try { sessionStorage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(value)); window.dispatchEvent(new Event('onboarding:updated')); return true; } catch { return false; }
}
export function clearOnboardingSession() { try { sessionStorage.removeItem(ONBOARDING_SESSION_KEY); window.dispatchEvent(new Event('onboarding:updated')); } catch {} }
export function readSessionSourceResume(): SessionSourceResume | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_SOURCE_RESUME_KEY);
    if (!raw || raw.length > 4_000_000) return null;
    const data = JSON.parse(raw) as SessionSourceResume;
    if (data?.schemaVersion !== 1 || typeof data.filename !== 'string' || !['text/plain', 'application/pdf'].includes(data.mimeType)) return null;
    return data;
  } catch { return null; }
}
export function writeSessionSourceResume(value: SessionSourceResume): boolean {
  try { sessionStorage.setItem(SESSION_SOURCE_RESUME_KEY, JSON.stringify(value)); window.dispatchEvent(new Event('onboarding:updated')); return true; } catch { return false; }
}
export function clearSessionSourceResume() { try { sessionStorage.removeItem(SESSION_SOURCE_RESUME_KEY); window.dispatchEvent(new Event('onboarding:updated')); } catch {} }
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
