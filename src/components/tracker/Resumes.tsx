'use client';

import { FileText } from 'lucide-react';
import ResumeLibrary from '@/components/resume-workspace/ResumeLibrary';
import LegacyResumeImport from '@/components/resume-workspace/LegacyResumeImport';
import SessionResumeStudio from '@/components/resume-workspace/SessionResumeStudio';
import { useTracker } from './TrackerProvider';
import { PageHeading } from './ui';

export default function Resumes() {
  const { snapshot, refresh } = useTracker();
  if (!snapshot) return null;

  return (
    <>
      <PageHeading
        eyebrow="YOUR STORY, WELL TOLD"
        title="A resume for every possibility."
        description="Keep your original resumes here, test fit against any JD, and save tailored versions inside each application."
      />
      <div className="vc-resume-intro">
        <FileText size={21} />
        <span>
          Every generated version keeps the job description and answers it was made from. Choose the version you actually
          submitted inside the application.
        </span>
      </div>
      <div className="vc-settings-stack">
        <ResumeLibrary storageConfigured={snapshot.capabilities.storage} onRefresh={refresh} />
        <SessionResumeStudio
          mode="library"
          signedIn
          aiConfigured={snapshot.capabilities.deepseek}
          savedSources={snapshot.resumes.map((resume) => ({ id: resume.id, filename: resume.filename }))}
          onLibrarySaved={refresh}
        />
        <LegacyResumeImport demo={false} applications={snapshot.applications} onImported={refresh} />
      </div>
    </>
  );
}
