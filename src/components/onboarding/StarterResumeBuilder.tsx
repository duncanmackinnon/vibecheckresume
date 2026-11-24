'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ResumePreview from '@/components/ResumePreview';
import { buildStarterResume, validateStarterResume, type StarterResumeAnswers, type StarterResumeDraft } from '@/lib/onboarding/starter-resume';

interface StarterResumeBuilderProps {
  value: StarterResumeAnswers;
  onChange: (value: StarterResumeAnswers) => void;
  onComplete: (draft: StarterResumeDraft) => void | Promise<void>;
  onBack?: () => void;
  completionBusy?: boolean;
  currentStep?: number;
  onStepChange?: (step:number)=>void;
}

const steps = ['Contact', 'Introduction', 'Experience', 'Education', 'Projects', 'Review'];
const headings = ['How can employers reach you?', 'Introduce yourself in your own words.', 'What have you contributed to?', 'What have you learned?', 'What have you made or helped create?', 'Your starting resume is ready to review.'];
const descriptions = [
  'Add your name and at least one way to contact you. Your phone number and location are optional.',
  'A few specific skills or a short introduction are enough to get started. Use your own words.',
  'Paid work, volunteering, clubs, and other contributions can fit here. You can skip this step if you are applying for your first job.',
  'Include school, a course, training, or a qualification you actually completed or are currently working toward. This step is optional.',
  'Class assignments, personal projects, community work, and portfolios can show what you can do. This step is optional.',
  'This resume uses only the details you entered. Review it, edit anything you want, then continue.',
];

export default function StarterResumeBuilder({ value, onChange, onComplete, onBack, completionBusy = false, currentStep=0, onStepChange }: StarterResumeBuilderProps) {
  const [localStep, setStep] = useState(currentStep);
  const step=onStepChange?currentStep:localStep;
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const prefix = useId();
  const busy = saving || completionBusy;
  const preview = useMemo(() => { try { return buildStarterResume(value); } catch { return null; } }, [value]);
  useEffect(() => { heading.current?.focus(); }, [step]);

  function update<K extends keyof StarterResumeAnswers>(field: K, next: StarterResumeAnswers[K]) {
    onChange({ ...value, [field]: next }); setErrors([]);
  }
  function nextStep(target: number) {
    if (busy) return;
    if (target > step && step === 0) {
      const missing = [];
      if (!value.fullName.trim()) missing.push('Add your name.');
      if (![value.email, value.phone, value.links].some(answer => answer.trim())) missing.push('Add an email, phone number, or contact link.');
      if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) missing.push('Enter a valid email address.');
      if (missing.length) { setErrors(missing); return; }
    }
    if (target === steps.length - 1) {
      const issues = validateStarterResume(value);
      if (issues.length) { setErrors(issues); return; }
    }
    setErrors([]); if(onStepChange)onStepChange(target);else setStep(target);
  }
  async function complete() {
    const issues = validateStarterResume(value);
    if (issues.length) { setErrors(issues); return; }
    setSaving(true); setErrors([]);
    try { await onComplete(buildStarterResume(value)); }
    catch (error) { setErrors([error instanceof Error ? error.message : 'Your resume could not be saved. Please try again.']); }
    finally { setSaving(false); }
  }
  function field<K extends 'fullName' | 'headline' | 'email' | 'phone' | 'location' | 'links' | 'summary' | 'skills'>(name: K, label: string, placeholder: string, multiline = false) {
    const id = `${prefix}-${name}`;
    return <label className="ob-starter-field" htmlFor={id}><span>{label}</span>{multiline ? <textarea id={id} className="ob-input" value={value[name]} rows={name === 'summary' ? 5 : 3} maxLength={name === 'links' ? 2000 : 4000} placeholder={placeholder} disabled={busy} onChange={event => update(name, event.target.value)} /> : <input id={id} className="ob-input" value={value[name]} type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'} autoComplete={name === 'fullName' ? 'name' : name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'off'} maxLength={name === 'fullName' ? 120 : name === 'email' ? 254 : name === 'phone' ? 80 : 160} placeholder={placeholder} disabled={busy} onChange={event => update(name, event.target.value)} />}</label>;
  }

  return <section className="ob-starter" aria-labelledby={`${prefix}-heading`}>
    <div className="ob-starter-header">
      <p className="ob-starter-help">Build your starting resume · Step {step + 1} of {steps.length}</p>
      <h2 id={`${prefix}-heading`} ref={heading} tabIndex={-1}>{headings[step]}</h2>
      <p>{descriptions[step]}</p>
      <ol className="ob-starter-steps" aria-label="Resume builder steps">{steps.map((label, index) => <li key={label} data-current={index === step || undefined}><button type="button" className="ob-link" aria-current={index === step ? 'step' : undefined} disabled={busy} onClick={() => nextStep(index)}>{label}</button></li>)}</ol>
    </div>

    {errors.length > 0 && <div className="ob-starter-error" role="alert"><p>Check these details before continuing:</p><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}

    <form className="ob-starter-form" onSubmit={event => { event.preventDefault(); if (step === steps.length - 1) void complete(); else nextStep(step + 1); }}>
      {step === 0 && <div className="ob-starter-grid">
        {field('fullName', 'Full name', 'Your name')}
        {field('headline', 'Headline or target role (optional)', 'For example: Customer service assistant')}
        {field('email', 'Email', 'you@example.com')}
        {field('phone', 'Phone (optional)', 'Your preferred contact number')}
        {field('location', 'City or region (optional)', 'For example: Toronto, Ontario')}
        {field('links', 'Contact or portfolio links (optional)', 'One link per line', true)}
      </div>}

      {step === 1 && <div className="ob-starter-grid">
        {field('summary', 'Short introduction (optional)', 'Describe what you can do, what you are learning, or the kind of work you are seeking.', true)}
        {field('skills', 'Skills you can demonstrate', 'For example: customer service, spreadsheets, French. Use commas or one skill per line.', true)}
        <p className="ob-starter-help">You can leave the introduction blank. Include only skills or experience you would be comfortable discussing in an interview.</p>
      </div>}

      {step === 2 && <div>
        {value.experience.map((entry, index) => <fieldset className="ob-starter-entry" key={index}>
          <legend>Experience {index + 1}</legend>
          <div className="ob-starter-grid">
            <label className="ob-starter-field"><span>Role or contribution</span><input className="ob-input" value={entry.role} maxLength={160} disabled={busy} placeholder="For example: Volunteer coordinator" onChange={event => update('experience', value.experience.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>Organization or setting</span><input className="ob-input" value={entry.organization} maxLength={160} disabled={busy} placeholder="The actual organization, team, or setting" onChange={event => update('experience', value.experience.map((item, i) => i === index ? { ...item, organization: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>Dates (optional)</span><input className="ob-input" value={entry.dates} maxLength={100} disabled={busy} placeholder="For example: September 2024 – June 2025" onChange={event => update('experience', value.experience.map((item, i) => i === index ? { ...item, dates: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>What did you do or achieve?</span><textarea className="ob-input" value={entry.highlights} rows={4} maxLength={8000} disabled={busy} placeholder="Use one specific contribution per line. Add results only when you know them." onChange={event => update('experience', value.experience.map((item, i) => i === index ? { ...item, highlights: event.target.value } : item))} /></label>
          </div>
          <button type="button" className="ob-link" disabled={busy} onClick={() => update('experience', value.experience.filter((_, i) => i !== index))}>Remove experience {index + 1}</button>
        </fieldset>)}
        <button type="button" className="ob-button ob-secondary" disabled={busy || value.experience.length >= 10} onClick={() => update('experience', [...value.experience, { role: '', organization: '', dates: '', highlights: '' }])}>Add experience</button>
      </div>}

      {step === 3 && <div>
        {value.education.map((entry, index) => <fieldset className="ob-starter-entry" key={index}>
          <legend>Education or training {index + 1}</legend>
          <div className="ob-starter-grid">
            <label className="ob-starter-field"><span>Course or qualification</span><input className="ob-input" value={entry.qualification} maxLength={200} disabled={busy} placeholder="Use the actual course or qualification name" onChange={event => update('education', value.education.map((item, i) => i === index ? { ...item, qualification: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>School or provider</span><input className="ob-input" value={entry.institution} maxLength={200} disabled={busy} placeholder="School, college, training provider, or community program" onChange={event => update('education', value.education.map((item, i) => i === index ? { ...item, institution: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>Dates or current status (optional)</span><input className="ob-input" value={entry.dates} maxLength={100} disabled={busy} placeholder="For example: Expected graduation June 2027" onChange={event => update('education', value.education.map((item, i) => i === index ? { ...item, dates: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>Relevant details (optional)</span><textarea className="ob-input" value={entry.details} rows={3} maxLength={4000} disabled={busy} placeholder="Relevant coursework or practical learning, one detail per line" onChange={event => update('education', value.education.map((item, i) => i === index ? { ...item, details: event.target.value } : item))} /></label>
          </div>
          <button type="button" className="ob-link" disabled={busy} onClick={() => update('education', value.education.filter((_, i) => i !== index))}>Remove education {index + 1}</button>
        </fieldset>)}
        <button type="button" className="ob-button ob-secondary" disabled={busy || value.education.length >= 10} onClick={() => update('education', [...value.education, { qualification: '', institution: '', dates: '', details: '' }])}>Add education or training</button>
      </div>}

      {step === 4 && <div>
        {value.projects.map((entry, index) => <fieldset className="ob-starter-entry" key={index}>
          <legend>Project {index + 1}</legend>
          <div className="ob-starter-grid">
            <label className="ob-starter-field"><span>Project name</span><input className="ob-input" value={entry.name} maxLength={200} disabled={busy} placeholder="What did you call the project?" onChange={event => update('projects', value.projects.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>Project link (optional)</span><input className="ob-input" value={entry.url} maxLength={500} disabled={busy} placeholder="A portfolio, repository, or public project link" onChange={event => update('projects', value.projects.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /></label>
            <label className="ob-starter-field"><span>What was your contribution?</span><textarea className="ob-input" value={entry.description} rows={4} maxLength={8000} disabled={busy} placeholder="Describe what you made, organized, researched, or improved. Use your actual contribution." onChange={event => update('projects', value.projects.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label>
          </div>
          <button type="button" className="ob-link" disabled={busy} onClick={() => update('projects', value.projects.filter((_, i) => i !== index))}>Remove project {index + 1}</button>
        </fieldset>)}
        <button type="button" className="ob-button ob-secondary" disabled={busy || value.projects.length >= 10} onClick={() => update('projects', [...value.projects, { name: '', url: '', description: '' }])}>Add project</button>
      </div>}

      {step === 5 && preview && <div className="ob-starter-preview"><ResumePreview generatedResume={preview.generatedResume} /></div>}

      <div className="ob-starter-controls">
        {step > 0 ? <button type="button" className="ob-button ob-secondary" disabled={busy} onClick={() => nextStep(step - 1)}>Back</button> : onBack ? <button type="button" className="ob-button ob-secondary" disabled={busy} onClick={onBack}>Back</button> : <span />}
        {step >= 2 && step <= 4 && <p className="ob-starter-help">No {step === 2 ? 'experience' : step === 3 ? 'education to add' : 'projects'} yet? Leave this section blank and continue.</p>}
        <button type="submit" className="ob-button ob-primary" disabled={busy}>{busy ? 'Saving…' : step === 5 ? 'Use this resume' : step === 4 ? 'Review resume' : 'Continue'}</button>
      </div>
    </form>
  </section>;
}
