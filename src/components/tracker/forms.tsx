'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { STAGES, type Application, type TrackerEntry, type Stage } from '@/lib/tracker/types';
import { useTracker } from './TrackerProvider';
import { Modal } from './ui';
import { localDateTimeToIso, inputLocalDateTime } from './time';

export function ApplicationForm({ open, onOpenChange, application, initialStage }: { open: boolean; onOpenChange: (open: boolean) => void; application?: Application; initialStage?: Stage }) {
  const { mutate } = useTracker();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) setError(''); }, [open]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    const input: Record<string, unknown> = Object.fromEntries(data);
    input.tags = String(input.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
    input.appliedDate = input.appliedDate || null;
    input.deadline = input.deadline || null;
    if (application) { input.id = application.id; input.expectedVersion = application.version; }
    setSaving(true);
    try { const result = await mutate(application ? 'update_application' : 'create_application', input, application ? 'Application updated' : 'A new opportunity, saved') as Application; onOpenChange(false); if (!application && result?.id) router.push(`/applications/${result.id}`); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the application.'); } finally { setSaving(false); }
  }
  return <Modal open={open} onOpenChange={onOpenChange} title={application ? 'Edit application' : 'Make room for an opportunity'} description="Start with the company and role. Add the rest whenever you’re ready."><form key={application?.version || "new"} className="vc-form" onSubmit={submit}><div className="vc-form-grid"><label>Company <span>*</span><input name="company" autoFocus required maxLength={200} placeholder="e.g. Figma" defaultValue={application?.company} /></label><label>Role <span>*</span><input name="role" required maxLength={200} placeholder="e.g. Product Designer" defaultValue={application?.role} /></label><label>Stage<select name="stage" defaultValue={application?.stage || initialStage || 'Saved'}>{STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label><label>Priority<select name="priority" defaultValue={application?.priority || 'medium'}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Location<input name="location" placeholder="City, country, or remote" defaultValue={application?.location} /></label><label>Compensation<input name="compensation" placeholder="e.g. $100–130k CAD" defaultValue={application?.compensation} /></label><label>Applied on<input type="date" name="appliedDate" defaultValue={application?.appliedDate || ''} /></label><label>Application deadline<input type="date" name="deadline" defaultValue={application?.deadline || ''} /></label></div><label>Job posting<input type="url" name="jobUrl" placeholder="https://…" defaultValue={application?.jobUrl} /></label><label>Tags <span className="vc-field-hint">Separate with commas</span><input name="tags" placeholder="Remote, dream team, referral" defaultValue={application?.tags.join(', ')} /></label><label>Job description<textarea name="jobDescription" rows={5} placeholder="Paste the description here for reference and resume tailoring." defaultValue={application?.jobDescription} /></label>{error && <p className="vc-form-error" role="alert">{error}</p>}<div className="vc-form-footer"><button type="button" className="vc-button vc-secondary" onClick={() => onOpenChange(false)}>Cancel</button><button disabled={saving} className="vc-button vc-primary">{saving ? 'Saving…' : application ? 'Save changes' : 'Save application'}</button></div></form></Modal>;
}

export function EntryForm({ kind, applicationId, entry, open, onOpenChange }: { kind: 'note' | 'contact' | 'task' | 'interview'; applicationId?: string; entry?: TrackerEntry; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { snapshot, mutate } = useTracker();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timezone = entry?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const input: Record<string, unknown> = { ...values, applicationId: applicationId || values.applicationId };
    if (entry) { delete input.applicationId; input.id = entry.id; input.expectedVersion = entry.version; }
    try {
      if (kind === 'task') input.dueDate = values.dueDate || null;
      if (kind === 'interview') { input.startAt = localDateTimeToIso(String(values.startAt), String(values.timezone)); input.endAt = values.endAt ? localDateTimeToIso(String(values.endAt), String(values.timezone)) : null; if (input.endAt && String(input.endAt) <= String(input.startAt)) throw new Error('The end time must be after the start time.'); }
      setSaving(true);
      const action = kind === 'note' ? (entry ? 'update_note' : 'add_note') : `${entry ? 'update' : 'create'}_${kind}`;
      await mutate(action, input, `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${entry ? 'updated' : 'saved'}`);
      onOpenChange(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); } finally { setSaving(false); }
  }
  return <Modal open={open} onOpenChange={onOpenChange} title={`${entry ? 'Edit' : 'Add'} ${kind === 'task' ? 'a next step' : kind === 'note' ? 'a note' : `an${kind === 'interview' ? '' : ''} ${kind}`}`.replace('an contact', 'a contact')}><form className="vc-form" onSubmit={submit}>{!applicationId && <label>Application<select name="applicationId" required defaultValue={entry?.applicationId || ''}><option value="" disabled>Choose an application</option>{snapshot?.applications.filter(app => !app.archived).map(app => <option value={app.id} key={app.id}>{app.company} · {app.role}</option>)}</select></label>}<label>{kind === 'contact' ? 'Name' : 'Title'}<input name="title" required autoFocus maxLength={300} placeholder={kind === 'task' ? 'e.g. Send a thoughtful follow-up' : kind === 'interview' ? 'e.g. Meet the design team' : kind === 'contact' ? 'Full name' : 'A little context for later'} defaultValue={entry?.title} /></label>{kind === 'task' && <label>Due date<input type="date" name="dueDate" defaultValue={entry?.dueDate || ''} /></label>}{kind === 'contact' && <><label>Role or relationship<input name="contactRole" placeholder="Recruiter, hiring manager, referral…" defaultValue={entry?.contactRole} /></label><div className="vc-form-grid"><label>Email<input type="email" name="email" defaultValue={entry?.email} /></label><label>Phone<input type="tel" name="phone" defaultValue={entry?.phone} /></label></div><label>Profile link<input type="url" name="url" placeholder="https://…" defaultValue={entry?.url} /></label></>}{kind === 'interview' && <><div className="vc-form-grid"><label>Starts<input type="datetime-local" required name="startAt" defaultValue={inputLocalDateTime(entry?.startAt || null, timezone)} /></label><label>Ends<input type="datetime-local" name="endAt" defaultValue={inputLocalDateTime(entry?.endAt || null, timezone)} /></label></div><label>Timezone<input name="timezone" required defaultValue={timezone} list="vc-timezones" /><datalist id="vc-timezones">{['America/Toronto', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'].map(zone => <option value={zone} key={zone} />)}</datalist></label><label>Meeting link<input type="url" name="url" placeholder="https://…" defaultValue={entry?.url} /></label></>}<label>{kind === 'interview' ? 'Preparation notes' : 'Notes'}<textarea name="body" rows={4} placeholder={kind === 'interview' ? 'Who you’ll meet, questions to ask, and stories to share.' : 'Anything you’d like to remember.'} defaultValue={entry?.body} /></label>{error && <p className="vc-form-error" role="alert">{error}</p>}<div className="vc-form-footer"><button type="button" className="vc-button vc-secondary" onClick={() => onOpenChange(false)}>Cancel</button><button disabled={saving} className="vc-button vc-primary">{saving ? 'Saving…' : 'Save'}</button></div></form></Modal>;
}
