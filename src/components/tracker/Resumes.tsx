'use client';
import { FileText } from 'lucide-react';
import ResumeLibrary from '@/components/resume-workspace/ResumeLibrary';
import LegacyResumeImport from '@/components/resume-workspace/LegacyResumeImport';
import {useTracker} from './TrackerProvider';
import {PageHeading} from './ui';
export default function Resumes(){const {snapshot,refresh}=useTracker();if(!snapshot)return null;return <><PageHeading eyebrow="YOUR STORY, WELL TOLD" title="A resume for every possibility." description="Keep your original resumes here. Tailor and save versions inside each application."/><div className="vc-resume-intro"><FileText size={21}/><span>Every generated version keeps the job description and answers it was made from. Choose the version you actually submitted inside the application.</span></div><div className="vc-settings-stack"><ResumeLibrary demo={snapshot.demo} onRefresh={refresh}/><LegacyResumeImport demo={snapshot.demo} applications={snapshot.applications} onImported={refresh}/></div></>;}
