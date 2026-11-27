'use client';

import Link from './TrackerLink';
import { useEffect, useState } from 'react';
import { Archive, ArrowUpRight, Flag, GripVertical, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { STAGES, type Application, type Stage } from '@/lib/tracker/types';
import { useTracker } from './TrackerProvider';
import { AddButton, CompanyMark, dateLabel, EmptyState, PageHeading, Panel } from './ui';
import { ApplicationForm } from './forms';

export function StageSelect({ application }: { application: Application }) {
  const { mutate } = useTracker();
  const [saving, setSaving] = useState(false);
  return <select id={`stage-${application.id}`} aria-label={`Stage for ${application.company} ${application.role}`} value={application.stage} disabled={saving} onChange={async event => { const stage = event.target.value; setSaving(true); try { await mutate('update_application', { id: application.id, expectedVersion: application.version, stage }, `Moved to ${stage}`); } catch {} finally { setSaving(false); } }}>{STAGES.map(stage => <option key={stage}>{stage}</option>)}</select>;
}
function BoardCard({ application }: { application: Application }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: application.id });
  return <article ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} className={`vc-board-card ${isDragging ? 'is-dragging' : ''}`}><div className="vc-board-card-header"><CompanyMark name={application.company} /><button className="vc-icon-button vc-drag-handle" {...attributes} {...listeners} aria-label={`Drag ${application.company} ${application.role}. Alternatively use the stage menu below.`}><GripVertical size={15} /></button></div><Link href={`/applications/${application.id}`}><h3>{application.role}</h3><p>{application.company}</p></Link>{application.location && <p>{application.location}</p>}{application.tags.length > 0 && <div className="vc-board-card-tags">{application.tags.slice(0,3).map(tag=><span className="vc-tag" key={tag}>{tag}</span>)}</div>}<div className="vc-board-card-footer"><span className={`vc-priority vc-priority-${application.priority}`}>{application.priority==='high' ? <><Flag size={10} />High priority</> : dateLabel(application.appliedDate || application.createdAt)}</span><StageSelect application={application} /></div></article>;
}
function BoardColumn({ stage, applications, onAdd }: { stage: Stage; applications: Application[]; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return <section ref={setNodeRef} className={`vc-board-column ${isOver ? 'is-over' : ''}`} aria-label={`${stage} applications`}><div className="vc-column-heading"><div><span className={`vc-stage-dot vc-stage-dot-${stage.toLowerCase()}`} />{stage}<span>{applications.length}</span></div><button onClick={onAdd} className="vc-icon-button" aria-label={`Add application to ${stage}`}><Plus size={13} /></button></div><SortableContext items={applications.map(app=>app.id)} strategy={verticalListSortingStrategy}>{applications.map(app=><BoardCard application={app} key={app.id} />)}</SortableContext>{!applications.length && <div className="vc-column-empty">Room for what’s next</div>}</section>;
}

export default function Applications() {
  const { snapshot, mutate } = useTracker();
  const [adding, setAdding] = useState(false);
  const [addingStage, setAddingStage] = useState<Stage>('Saved');
  const [view, setView] = useState<'board'|'table'>('board');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [priority, setPriority] = useState('all');
  const [archived, setArchived] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(()=>{const stage = new URLSearchParams(window.location.search).get('stage'); if (stage && STAGES.includes(stage as Stage)) setFilter(stage);},[]);
  if (!snapshot) return null;
  const applications = snapshot.applications.filter(app => app.archived === archived && (filter === 'all' || app.stage === filter) && (priority === 'all' || app.priority === priority) && `${app.company} ${app.role} ${app.location} ${app.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  async function move(event: DragEndEvent) {
    if (!event.over) return;
    const app = snapshot?.applications.find(item=>item.id===event.active.id);
    const overApp = snapshot?.applications.find(item=>item.id===event.over?.id);
    const stage = STAGES.includes(event.over.id as Stage) ? event.over.id : overApp?.stage;
    if (!app || !stage || stage === app.stage) return;
    try { await mutate('update_application', { id: app.id, expectedVersion: app.version, stage }, `Moved to ${stage}`); } catch {}
  }
  return <><PageHeading eyebrow="THE POSSIBILITIES" title="Your applications." description="From a saved possibility to your next big yes. Keep it all in view."><AddButton onClick={()=>{setAddingStage('Saved');setAdding(true);}} /></PageHeading><div className="vc-toolbar"><div className="vc-toolbar-left"><label className="vc-search"><Search size={15} /><input aria-label="Search applications" placeholder="Find a company, role, or tag…" value={search} onChange={event=>setSearch(event.target.value)} /></label><select value={filter} onChange={event=>setFilter(event.target.value)} aria-label="Filter by stage"><option value="all">All stages</option>{STAGES.map(stage=><option key={stage}>{stage}</option>)}</select><select value={priority} onChange={event=>setPriority(event.target.value)} aria-label="Filter by priority"><option value="all">Any priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select></div><div className="vc-toolbar-right"><button className={`vc-button vc-secondary ${archived ? 'is-active' : ''}`} aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={14} />{archived?'Archived':'Archive'}</button><div className="vc-segmented" aria-label="Application view"><button className={view==='board'?'is-active':''} aria-pressed={view==='board'} onClick={()=>setView('board')}><LayoutGrid size={13} />Board</button><button className={view==='table'?'is-active':''} aria-pressed={view==='table'} onClick={()=>setView('table')}><List size={14} />List</button></div></div></div>{applications.length===0 ? <Panel><EmptyState title={search||filter!=='all'||priority!=='all'?'No matches just yet.':archived?'A fresh archive.':'Your next chapter starts with a possibility.'} description={search||filter!=='all'||priority!=='all'?'Try another search or clear your filters.':archived?'Archived applications stay here, ready to restore whenever you like.':'Save a role you’re curious about. A resume can come later.'}>{!archived && <AddButton onClick={()=>{setAddingStage('Saved');setAdding(true);}} />}</EmptyState></Panel> : view==='board' ? <><DndContext sensors={sensors} onDragEnd={move}><div className="vc-board">{STAGES.filter(stage=>filter==='all'||stage===filter).map(stage=><BoardColumn key={stage} stage={stage} applications={applications.filter(app=>app.stage===stage)} onAdd={()=>{setAddingStage(stage);setAdding(true);}} />)}</div></DndContext><p className="vc-help-text">Drag a card to move it along, or use its stage menu. {applications.length} {applications.length===1?'opportunity':'opportunities'} in view.</p></> : <Panel><div className="vc-table-wrap"><table className="vc-table"><thead><tr><th>Opportunity</th><th>Stage</th><th>Location</th><th>Priority</th><th>Applied</th><th>Deadline</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{applications.map(app=><tr key={app.id}><td><Link href={`/applications/${app.id}`} className="vc-table-app"><CompanyMark name={app.company} /><div><strong>{app.role}</strong><p>{app.company}</p></div></Link></td><td><StageSelect application={app} /></td><td className="vc-muted">{app.location||'-'}</td><td><span className={`vc-priority vc-priority-${app.priority}`}><Flag size={11} />{app.priority}</span></td><td className="vc-muted">{dateLabel(app.appliedDate)}</td><td className="vc-muted">{dateLabel(app.deadline)}</td><td><Link href={`/applications/${app.id}`} aria-label={`Open ${app.company}`} className="vc-icon-button"><ArrowUpRight size={15} /></Link></td></tr>)}</tbody></table></div></Panel>}<ApplicationForm key={addingStage} initialStage={addingStage} open={adding} onOpenChange={setAdding} /></>;
}
