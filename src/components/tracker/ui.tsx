'use client';

import { Dialog } from '@base-ui/react/dialog';
import { ArrowUpRight, BriefcaseBusiness, Plus, X } from 'lucide-react';
import Link from './TrackerLink';
import { useState, type ReactNode } from 'react';

export const stageLabels = ['Saved', 'Applied', 'Screening', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn'] as const;
export function stageLabel(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
export function dateLabel(value?: string | null, includeTime = false, timeZone?: string) {
  if (!value) return 'No date';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}), ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(date);
}
export function initials(name: string) { return name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase(); }
export function CompanyMark({ name, large = false }: { name: string; large?: boolean }) {
  const tones = ['sage', 'peach', 'lavender', 'blue', 'yellow'];
  const tone = tones[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length];
  return <span className={`vc-company-mark vc-${tone} ${large ? 'vc-company-large' : ''}`} aria-hidden="true">{initials(name)}</span>;
}
export function StageBadge({ stage }: { stage: string }) { return <span className={`vc-stage vc-stage-${stage.toLowerCase()}`}><span />{stageLabel(stage)}</span>; }
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="vc-page-heading"><div>{eyebrow && <p className="vc-eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{children && <div className="vc-heading-actions">{children}</div>}</header>;
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="vc-empty"><span className="vc-empty-icon"><BriefcaseBusiness size={24} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Panel({ title, subtitle, children, action, className = '' }: { title?: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`vc-panel ${className}`}>{title && <div className="vc-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>;
}
export function ViewAll({ href, children = 'View all' }: { href: string; children?: ReactNode }) { return <Link href={href} className="vc-text-link">{children}<ArrowUpRight size={14} /></Link>; }
export function Modal({ title, description, children, open, onOpenChange }: { title: string; description?: string; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="vc-dialog-backdrop" /><Dialog.Popup className="vc-dialog"><div className="vc-dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="vc-icon-button" aria-label="Close dialog"><X size={18} /></Dialog.Close></div>{description && <Dialog.Description className="vc-muted">{description}</Dialog.Description>}{children}</Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
export function AddButton({ onClick, children = 'Add application' }: { onClick: () => void; children?: ReactNode }) { return <button className="vc-button vc-primary" onClick={onClick}><Plus size={17} />{children}</button>; }
export function SectionTabs({ tabs, selected, onSelect }: { tabs: string[]; selected: string; onSelect: (tab: string) => void }) { return <div className="vc-section-tabs" aria-label="Section">{tabs.map(tab => <button className={selected === tab ? 'is-active' : ''} aria-pressed={selected === tab} onClick={() => onSelect(tab)} key={tab}>{tab}</button>)}</div>; }
export function CopyButton({ value, children }: { value: string; children: ReactNode }) { const [copied, setCopied] = useState(false); return <button className="vc-button vc-secondary" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : children}</button>; }
