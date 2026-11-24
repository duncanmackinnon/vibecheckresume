import { createHash } from 'node:crypto';
import type { OnboardingProfileData } from '@/lib/onboarding/types';
import type { DiscoveryPreferences } from './types';

const split = (value: string) => value.split(/[,\n;]/).map(item => item.trim()).filter(Boolean).slice(0, 10);
export function discoveryPreferences(profile: OnboardingProfileData): DiscoveryPreferences {
  return {
    roles: split(profile.preferences.roles), locations: split(profile.preferences.locations),
    workStyles: profile.preferences.workModes, employmentTypes: profile.preferences.employmentTypes,
    additionalContext: profile.preferences.additionalContext.slice(0, 2000),
  };
}
export function preferenceFingerprint(profile: OnboardingProfileData): string {
  return createHash('sha256').update(JSON.stringify({ preferences: discoveryPreferences(profile), cadence: profile.cadence, consent: profile.discoveryConsent, complete: !!profile.completedAt })).digest('hex');
}
export function searchPreferenceFingerprint(profile: OnboardingProfileData): string {
  return createHash('sha256').update(JSON.stringify(discoveryPreferences(profile))).digest('hex');
}
export function discoveryRecordId(ownerId: string, key: string): string {
  const hex = createHash('sha256').update(`${ownerId}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function cadenceMilliseconds(cadence: 'daily' | 'weekly'): number { return (cadence === 'daily' ? 1 : 7) * 86400000; }
