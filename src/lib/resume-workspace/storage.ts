import type { ResumeBuilderProfile } from '@/app/types';
import { toResumeBuilderProfile } from '@/lib/resume-parser';
import { parseResumeFile } from '@/lib/resume-parser/server';
import type { ParsedResumeDocument, RoleSuggestion, SupportedResumeMimeType } from '@/lib/resume-parser';
import { createClient } from '@supabase/supabase-js';

export interface ReadUploadResult {
  mimeType: SupportedResumeMimeType;
  bytes: ArrayBuffer;
  text: string;
  parsedResume: ParsedResumeDocument;
  profile: ResumeBuilderProfile | undefined;
  suggestedRoles: RoleSuggestion;
}

export function privateResumeStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Private resume storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    .storage.from(process.env.SUPABASE_RESUME_BUCKET || 'resumes');
}

export async function readUpload(file: File): Promise<ReadUploadResult> {
  const { mimeType, bytes, text, parsedResume } = await parseResumeFile(file);
  return {
    mimeType,
    bytes,
    text,
    parsedResume,
    profile: toResumeBuilderProfile(parsedResume),
    suggestedRoles: parsedResume.suggestedRoles,
  };
}
