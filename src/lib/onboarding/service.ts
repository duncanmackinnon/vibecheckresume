import { createHash } from 'node:crypto';
import { createRecord, getRecord, idempotent, listRecords, updateRecord, withOwnerTransaction } from '@/lib/tracker/store';
import { TrackerError } from '@/lib/tracker/errors';
import type { SourceResumeData, StoredRecord } from '@/lib/tracker/types';
import { buildStarterResume } from './starter-resume';
import { onboardingRequestSchema } from './schemas';
import { createOnboardingProfile, type OnboardingProfileData, type OnboardingDraftData } from './types';

function profileId(ownerId: string) {
  const hex = createHash('sha256').update(`onboarding:${ownerId}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export async function getOnboardingProfile(ownerId: string): Promise<StoredRecord<OnboardingProfileData> | null> {
  return (await listRecords<OnboardingProfileData>(ownerId, 'profile'))[0] || null;
}
export async function saveOnboarding(ownerId: string, request: unknown) {
  const parsed = onboardingRequestSchema.parse(request);
  return idempotent(ownerId, parsed.idempotencyKey, parsed.action, parsed, async () => {
    if (parsed.action === 'save_draft') {
      const currentDraft = (await listRecords<OnboardingDraftData>(ownerId, 'onboarding_draft'))[0];
      if (currentDraft ? parsed.expectedVersion !== currentDraft.version : parsed.expectedVersion !== undefined) throw new TrackerError('Your draft changed in another window. Reload to restore the latest saved draft.',409,'CONFLICT');
      if (parsed.input.profile.sourceResumeId) await getRecord(ownerId,'source_resume',parsed.input.profile.sourceResumeId);
      const draft = currentDraft ? await updateRecord(ownerId,'onboarding_draft',currentDraft.id,parsed.input,currentDraft.version) : await createRecord(ownerId,'onboarding_draft',parsed.input,{id:profileId(`draft:${ownerId}`)});
      return {draft};
    }
    const current = await getOnboardingProfile(ownerId);
    if (parsed.action === 'save_starter_resume') {
      const draft = buildStarterResume(parsed.input.answers);
      // Derive the source and exports on the server; browser-supplied document output is never trusted.
      const resume = await createRecord(ownerId, 'source_resume', {
        filename: draft.filename, mimeType: 'text/plain', size: Buffer.byteLength(draft.sourceText, 'utf8'),
        storagePath: '', text: draft.sourceText, origin: 'builder', starterAnswers: draft.answers, generatedResume: draft.generatedResume,
      });
      // Saving a document is immutable and does not overwrite a concurrently edited profile.
      return { resume, profile: current };
    }
    const input = parsed.input;
    if (current && parsed.expectedVersion !== current.version) throw new TrackerError('Your onboarding changed in another tab. Refresh before saving again.', 409, 'CONFLICT');
    if (!current && parsed.expectedVersion !== undefined) throw new TrackerError('Refresh before saving this profile.', 409, 'CONFLICT');
    if (input.sourceResumeId) await getRecord<SourceResumeData>(ownerId, 'source_resume', input.sourceResumeId);
    const data: OnboardingProfileData = { ...input, completedAt: input.step === 'complete' ? current?.data.completedAt || new Date().toISOString() : current?.data.completedAt || null };
    const profile = current ? await updateRecord(ownerId, 'profile', current.id, data, current.version)
      : await createRecord(ownerId, 'profile', {...createOnboardingProfile(), ...data}, {id: profileId(ownerId)});
    return { profile };
  });
}

export async function onboardingState(ownerId: string) {
  return withOwnerTransaction(ownerId, async () => {
    const [profile, connections, drafts] = await Promise.all([getOnboardingProfile(ownerId), listRecords(ownerId, 'connection'),listRecords<OnboardingDraftData>(ownerId,'onboarding_draft')]);
    return { userId:ownerId, profile, draft:drafts.length ? drafts[0] : null, connection: connections[0]?.data || {enabled: true, lastUsedAt: null} };
  });
}
