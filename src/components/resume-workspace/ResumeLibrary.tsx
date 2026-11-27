'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import ResumePreview from '@/components/ResumePreview';
import type { StoredRecord } from '@/lib/tracker/types';
import type { ResumeWorkspaceSummaryData, SourceResume } from '@/lib/resume-workspace/types';
import { fetchResumeLibrary, readableDate, resumeRequest } from './client';

export default function ResumeLibrary({
  onRefresh,
  storageConfigured = true,
}: {
  onRefresh?: () => void;
  storageConfigured?: boolean;
}) {
  const [data, setData] = useState<ResumeWorkspaceSummaryData | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<StoredRecord<SourceResume> | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await fetchResumeLibrary());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load resumes.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  useEffect(() => {
    if (selectedSource) previewHeading.current?.focus();
  }, [selectedSource]);

  async function openSource(id: string) {
    setOpeningId(id);
    setError('');
    try {
      const source = await resumeRequest<StoredRecord<SourceResume>>('get_resume', { id, kind: 'source_resume' });
      if (!source.data.generatedResume) {
        throw new Error('This resume does not have a saved preview. Download the original to view it.');
      }
      setSelectedSource(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this resume.');
    } finally {
      setOpeningId(null);
    }
  }

  async function upload(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError('Choose a resume up to 8 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const bytes = await file.arrayBuffer();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      const fingerprint = `${file.name}:${sha256}`;
      if (uploadAttempt.current?.fingerprint !== fingerprint) {
        uploadAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }

      if (!storageConfigured) {
        const form = new FormData();
        form.append('resume', file);
        form.append('idempotencyKey', uploadAttempt.current.key);
        const response = await fetch('/api/resumes', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed.');
      } else {
        const input = {
          filename: file.name,
          mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain'),
          size: file.size,
          sha256,
          idempotencyKey: uploadAttempt.current.key,
        };
        const uploadRequest = async (action: 'prepare' | 'complete') => {
          const response = await fetch('/api/resumes/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, input }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Upload failed.');
          return result;
        };
        const prepared = await uploadRequest('prepare');
        if (!prepared.complete) {
          const transfer = await fetch(prepared.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': input.mimeType, 'x-upsert': 'false', 'Cache-Control': 'max-age=0' },
            body: bytes,
          });
          if (!transfer.ok) {
            const failure = await transfer.json().catch(() => ({}));
            if (!/already exists|duplicate/i.test(failure.message || failure.error || '')) {
              throw new Error('The file transfer failed. Select the same resume to retry.');
            }
          }
          await uploadRequest('complete');
        }
      }

      await refresh();
      onRefresh?.();
      toast.success('Resume saved to your private library');
      if (fileRef.current) fileRef.current.value = '';
      uploadAttempt.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="vc-resume-library space-y-6">
      <section className="clay-panel p-5 sm:p-6" aria-labelledby="library-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="library-title" className="text-xl font-bold">
              Your resume library
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload once, then tailor a copy for each application. Originals stay in your private workspace.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="clay-button px-4 py-3 text-sm font-semibold text-white"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Saving resume…' : 'Upload resume'}
            </button>
            <input
              ref={fileRef}
              aria-label="Resume file"
              tabIndex={-1}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Text-based PDF or TXT · Up to 8 MB</p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {!data && !error && (
          <p role="status" className="mt-5 text-sm text-slate-500">
            Loading your resumes…
          </p>
        )}
        {data?.sources.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-teal-200 p-8 text-center">
            <p className="font-semibold">Start with the resume you have.</p>
            <p className="mt-2 text-sm text-slate-500">Your original will be available inside every application.</p>
          </div>
        )}
        <ul className="mt-5 divide-y divide-slate-200/70">
          {data?.sources.map((resume) => (
            <li key={resume.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{resume.data.filename}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {resume.data.origin === 'builder' ? 'Created from your answers · ' : ''}
                  {Math.max(1, Math.round(resume.data.size / 1024))} KB · Added {readableDate(resume.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(resume.data.hasPreview || resume.data.origin === 'builder') && (
                  <button
                    type="button"
                    className="clay-secondary-button px-4 py-2 text-sm font-semibold"
                    disabled={!!openingId}
                    onClick={() => void openSource(resume.id)}
                  >
                    {openingId === resume.id ? 'Opening resume…' : 'Review resume'}
                  </button>
                )}
                <a
                  className="clay-secondary-button px-4 py-2 text-sm font-semibold"
                  href={`/api/resumes/${resume.id}?download=1`}
                >
                  {resume.data.origin === 'builder' ? 'Download text' : 'Download original'}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {selectedSource?.data.generatedResume && (
        <section className="clay-panel p-5 sm:p-6" aria-labelledby="saved-starter-title">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="saved-starter-title" ref={previewHeading} tabIndex={-1} className="text-xl font-bold">
                Your starting resume
              </h2>
              <p className="mt-1 text-sm text-slate-600">{selectedSource.data.filename}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSource.data.starterAnswers && (
                <Link
                  className="clay-secondary-button px-4 py-2 text-sm font-semibold"
                  href={`/onboarding?editResume=${encodeURIComponent(selectedSource.id)}`}
                >
                  Edit answers
                </Link>
              )}
              <button
                type="button"
                className="clay-secondary-button px-4 py-2 text-sm font-semibold"
                onClick={() => setSelectedSource(null)}
              >
                Close preview
              </button>
            </div>
          </div>
          <div className="vc-library-resume-preview">
            <ResumePreview key={selectedSource.id} generatedResume={selectedSource.data.generatedResume} />
          </div>
        </section>
      )}

      {!!data?.versions.length && (
        <section className="clay-panel p-5 sm:p-6">
          <h2 className="text-xl font-bold">Tailored versions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Every generation is saved. Open its application to preview or export.
          </p>
          <ul className="mt-4 divide-y divide-slate-200/70">
            {data.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap justify-between gap-3 py-4">
                <div>
                  <p className="font-semibold">{version.data.headline || version.data.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{readableDate(version.createdAt)}</p>
                </div>
                <Link
                  className="clay-secondary-button px-4 py-2 text-sm font-semibold"
                  href={`/applications/${version.applicationId}?resumeVersion=${version.id}#resume-workspace`}
                >
                  Open version
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
