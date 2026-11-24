import { createClient } from '@supabase/supabase-js';
import { extractPdfText } from '@/app/lib/pdfUtils';
import { validateUpload } from './validation';

export function privateResumeStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Private resume storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    .storage.from(process.env.SUPABASE_RESUME_BUCKET || 'resumes');
}

export async function readUpload(file: File) {
  const mimeType = validateUpload(file);
  const bytes = await file.arrayBuffer();
  if (mimeType === 'application/pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('This file does not contain a valid PDF.');
  }
  const text = (mimeType === 'application/pdf' ? await extractPdfText(file) : new TextDecoder('utf-8', { fatal: true }).decode(bytes)).replace(/\0/g, '').trim();
  if (text.length < 25) throw new Error('The resume has too little readable text. Use a text-based PDF or TXT resume.');
  if (text.length > 250000) throw new Error('The resume text is too long. Upload a shorter resume.');
  return { mimeType, bytes, text };
}
