import { redirect } from 'next/navigation';
export default function LegacyResumePage() { redirect('/resumes?import=1'); }
