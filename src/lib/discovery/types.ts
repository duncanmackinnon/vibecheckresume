import type { StoredRecord } from '@/lib/tracker/types';

export interface DiscoveryPreferences {
  roles: string[];
  locations: string[];
  workStyles: string[];
  employmentTypes: string[];
  additionalContext: string;
}
export interface DiscoverySource { url: string; title: string }
export interface DiscoveredJob {
  company: string;
  role: string;
  location: string;
  workStyle: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  compensation: string;
  summary: string;
  url: string;
  sources: DiscoverySource[];
}
export interface JobMatchData extends DiscoveredJob {
  discoveryRunId: string;
  discoveredAt: string;
  lastSeenAt: string;
  savedApplicationId: string | null;
}
export type JobMatch = StoredRecord<JobMatchData>;
export interface DiscoveryRunData {
  type: 'search';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  trigger: 'manual' | 'scheduled';
  provider?: 'platform';
  preferences: DiscoveryPreferences;
  fingerprint: string;
  scheduleGeneration: string | null;
  connectionId?: string | null;
  connectionGeneration?: number | null;
  matchIds: string[];
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  workflowRunId: string | null;
}
export type DiscoveryRun = StoredRecord<DiscoveryRunData>;
export interface DiscoveryScheduleData {
  type: 'schedule';
  status: 'inactive' | 'starting' | 'active' | 'failed';
  generation: string;
  fingerprint: string;
  cadence: 'manual' | 'daily' | 'weekly';
  nextRunAt: string | null;
  workflowRunId: string | null;
  sequence: number;
  error: string | null;
}
export type DiscoverySchedule = StoredRecord<DiscoveryScheduleData>;
export interface DiscoveryOverview {
  matches: JobMatch[];
  runs: DiscoveryRun[];
  schedule: DiscoverySchedule | null;
  preferences: DiscoveryPreferences | null;
  consent: boolean;
  configured: boolean;
  provider?: 'platform';
  scheduleConfigured?: boolean;
  profileComplete: boolean;
  websiteUrl: string;
}
