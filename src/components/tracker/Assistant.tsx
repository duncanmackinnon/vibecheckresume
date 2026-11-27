'use client';

import AssistantPanel from '@/components/assistant/AssistantPanel';
import { useTracker } from './TrackerProvider';
import { PageHeading } from './ui';
import NextSteps from './NextSteps';

export default function Assistant() {
  const { snapshot, refresh } = useTracker();
  if (!snapshot) return null;
  if (!snapshot.capabilities.openai) return <NextSteps />;
  return (
    <>
      <PageHeading
        eyebrow="THINK IT THROUGH, TOGETHER"
        title="A little help with your next move."
        description="Find an application, organize your next steps, or put your thoughts into words."
      />
      <AssistantPanel onChange={() => void refresh()} />
    </>
  );
}
