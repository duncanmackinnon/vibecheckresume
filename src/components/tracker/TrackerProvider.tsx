'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { TrackerSnapshot } from '@/lib/tracker/types';
import { clearOnboardingSession, readOnboardingSession } from '@/lib/onboarding/session';

interface TrackerContextValue {
  snapshot: TrackerSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (action: string, input: Record<string, unknown>, success?: string) => Promise<unknown>;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<TrackerSnapshot | null>(null);
  const refreshingRef = useRef(false);
  const refreshQueued = useRef(false);
  const retries = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      refreshQueued.current = true;
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const response = await fetch('/api/tracker', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        if (response.status === 401) {
          clearOnboardingSession();
          current.current = null;
          setSnapshot(null);
          throw new Error('Sign in to open your private workspace.');
        }
        throw new Error('Your workspace could not be reached. Check your connection and try again.');
      }
      const data = (await response.json()) as TrackerSnapshot;
      const localDraft = readOnboardingSession();
      if (localDraft?.ownerId && localDraft.ownerId !== data.user.id) clearOnboardingSession();
      current.current = data;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your workspace.');
    } finally {
      refreshingRef.current = false;
      setLoading(false);
      setRefreshing(false);
      if (refreshQueued.current) {
        refreshQueued.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('tracker:refresh', focus);
    window.addEventListener('onboarding:updated', focus);
    window.addEventListener('popstate', focus);
    const interval = window.setInterval(focus, 30000);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('tracker:refresh', focus);
      window.removeEventListener('onboarding:updated', focus);
      window.removeEventListener('popstate', focus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const mutate = useCallback(
    async (action: string, input: Record<string, unknown>, success = 'Saved to your workspace') => {
      if (!current.current) throw new Error('Sign in to save changes.');
      const fingerprint = JSON.stringify({ action, input });
      const idempotencyKey = retries.current.get(fingerprint) || crypto.randomUUID();
      retries.current.set(fingerprint, idempotencyKey);
      try {
        const response = await fetch('/api/tracker/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, input, idempotencyKey }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            await refresh();
            throw new Error('This record changed elsewhere. The latest version is loaded; please try your edit again.');
          }
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : data.error?.message || 'The change could not be saved. Please try again.',
          );
        }
        retries.current.delete(fingerprint);
        await refresh();
        toast.success(success);
        return data.result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save.');
        throw err;
      }
    },
    [refresh],
  );

  return (
    <TrackerContext.Provider value={{ snapshot, loading, refreshing, error, refresh, mutate }}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  const context = useContext(TrackerContext);
  if (!context) throw new Error('TrackerProvider is required');
  return context;
}
