import ApplicationDetails from '@/components/tracker/ApplicationDetails';
import { Suspense } from 'react';
export default async function Page({ params }: { params: Promise<{id:string}> }) { const {id}=await params; return <Suspense><ApplicationDetails key={id} id={id} /></Suspense>; }
