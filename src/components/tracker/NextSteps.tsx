'use client';

import Link from './TrackerLink';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { Application, Stage } from '@/lib/tracker/types';
import { useTracker } from './TrackerProvider';
import { EmptyState, PageHeading, Panel, StageBadge } from './ui';

interface Suggestion { key: string; text: string; detail: string; application: Application; urgency: number }

const STAGE_CHECKLIST: Partial<Record<Stage, string[]>> = {
  Saved: ['Read the posting twice and note the three requirements you match best.', 'Tailor a resume version to this role in the Resumes tab.', 'Submit the application, then move it to Applied.'],
  Applied: ['Note the date you applied and who might be hiring.', 'If you hear nothing in about a week, send a short, polite follow-up.', 'Look for a person at the company to connect with.'],
  Screening: ['Prepare a 60-second story of who you are and why this role.', 'Have two or three questions ready about the team.', 'Confirm the time and add it as an interview.'],
  Interview: ['Re-read the job description and map each requirement to an example.', 'Prepare questions for each interviewer.', 'Send a thank-you note within a day of each conversation.'],
  Offer: ['Ask for the offer in writing and the decision deadline.', 'Compare compensation, growth, and fit against your other options.', 'Prepare a calm, specific response before you negotiate.'],
};

const DAY = 86_400_000;
function daysBetween(from: string, to = new Date()) { return Math.floor((to.getTime() - new Date(from).getTime()) / DAY); }

export function useSuggestions(applicationId?: string): Suggestion[] {
  const { snapshot } = useTracker();
  if (!snapshot) return [];
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
  const open = snapshot.applications.filter(app => !app.archived && !['Accepted', 'Rejected', 'Withdrawn'].includes(app.stage) && (!applicationId || app.id === applicationId));
  const byId = new Map(open.map(app => [app.id, app]));
  const result: Suggestion[] = [];
  for (const entry of snapshot.entries) {
    const app = entry.applicationId ? byId.get(entry.applicationId) : undefined;
    if (!app || entry.completed) continue;
    if (entry.kind === 'task' && entry.dueDate) {
      if (entry.dueDate < today) result.push({ key: entry.id, text: `Overdue: ${entry.title}`, detail: `Was due ${entry.dueDate}`, application: app, urgency: 0 });
      else if (entry.dueDate <= soon) result.push({ key: entry.id, text: entry.title, detail: entry.dueDate === today ? 'Due today' : `Due ${entry.dueDate}`, application: app, urgency: 1 });
    }
    if (entry.kind === 'interview' && entry.startAt) {
      const hours = (new Date(entry.startAt).getTime() - Date.now()) / 3_600_000;
      if (hours > -2 && hours < 24 * 7) result.push({ key: entry.id, text: `Prepare for ${entry.title}`, detail: new Date(entry.startAt).toLocaleString(), application: app, urgency: hours < 48 ? 0 : 1 });
    }
  }
  for (const app of open) {
    const idle = daysBetween(app.updatedAt);
    if (app.stage === 'Applied' && idle >= 7) result.push({ key: `${app.id}-follow`, text: `Follow up with ${app.company}`, detail: `No updates for ${idle} days`, application: app, urgency: 2 });
    if (app.stage === 'Saved' && idle >= 3) result.push({ key: `${app.id}-apply`, text: `Decide on ${app.role} at ${app.company}`, detail: 'Saved but not applied yet. Tailor your resume or archive it.', application: app, urgency: 3 });
    if (app.deadline && app.deadline >= today && app.deadline <= new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10)) result.push({ key: `${app.id}-deadline`, text: `Deadline for ${app.company}`, detail: `Closes ${app.deadline}`, application: app, urgency: 0 });
    if (app.stage === 'Interview' && !snapshot.entries.some(entry => entry.applicationId === app.id && entry.kind === 'interview' && !entry.completed)) result.push({ key: `${app.id}-schedule`, text: `Add your interview time for ${app.company}`, detail: 'So it shows up in your upcoming schedule.', application: app, urgency: 1 });
  }
  return result.sort((a, b) => a.urgency - b.urgency);
}

function SuggestionList({ items, showLinks }: { items: Suggestion[]; showLinks: boolean }) {
  return <ul className="vc-next-steps" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
    {items.map(item => <li key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderBottom: '1px solid rgba(100,116,139,.15)', paddingBottom: 12 }}>
      <div><strong>{item.text}</strong><p className="vc-help-text" style={{ margin: '2px 0 0' }}>{showLinks ? `${item.application.company} · ` : ''}{item.detail}</p></div>
      {showLinks && <Link className="vc-text-link" href={`/applications/${item.application.id}`}>Open<ArrowUpRight size={13} /></Link>}
    </li>)}
  </ul>;
}

/** Deterministic, rules-based guidance. No AI service involved. */
export default function NextSteps({ applicationId }: { applicationId?: string }) {
  const { snapshot } = useTracker();
  const items = useSuggestions(applicationId);
  if (!snapshot) return null;
  const application = applicationId ? snapshot.applications.find(app => app.id === applicationId) : undefined;
  const checklist = application ? STAGE_CHECKLIST[application.stage] : undefined;
  const body = <>
    <Panel title={applicationId ? 'What needs attention' : 'Your next moves'} subtitle="Worked out from your tasks, interviews, deadlines, and how long each application has been quiet.">
      {items.length ? <SuggestionList items={items} showLinks={!applicationId} /> : <EmptyState title="You’re all caught up." description={snapshot.applications.length ? 'Nothing is overdue and nothing is waiting on a follow-up right now.' : 'Add or save a job and your next steps will show up here.'}>
        {!snapshot.applications.length && <Link href="/discover" className="vc-button vc-primary">Find jobs</Link>}
      </EmptyState>}
    </Panel>
    {application && checklist && <Panel title={`${application.stage}: a simple checklist`} subtitle="Typical next actions for this stage.">
      <div style={{ display: 'grid', gap: 10 }}>{checklist.map(step => <p key={step} className="vc-help-text" style={{ display: 'flex', gap: 8, margin: 0 }}><CheckCircle2 size={15} style={{ flex: 'none', marginTop: 2 }} />{step}</p>)}</div>
      <div style={{ marginTop: 12 }}><StageBadge stage={application.stage} /></div>
    </Panel>}
  </>;
  if (applicationId) return <div style={{ display: 'grid', gap: 16 }}>{body}</div>;
  return <>
    <PageHeading eyebrow="STAY ON TRACK" title="Your next moves." description="Clear, practical reminders drawn from your own applications. Everything here is computed on this device." />
    <div style={{ display: 'grid', gap: 16 }}>{body}</div>
  </>;
}
