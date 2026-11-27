import { ZodError } from 'zod';
import { appBaseUrl } from './config';
import { TrackerError } from './errors';
export function assertSameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if (origin) {
    const allowedConfigured = origin === new URL(appBaseUrl()).origin;
    let allowedRequestUrl = false;
    if (!process.env.APP_BASE_URL) {
      try { allowedRequestUrl = origin === new URL(request.url).origin; } catch { allowedRequestUrl = false; }
    }
    if (!allowedConfigured && !allowedRequestUrl) throw new TrackerError('This request origin is not allowed.',403,'FORBIDDEN');
  }
  if(request.headers.get('sec-fetch-site')==='cross-site') throw new TrackerError('Cross-site changes are not allowed.',403,'FORBIDDEN');
}
export async function readJson(request:Request, maxBytes=1024*1024):Promise<any> {
  assertSameOrigin(request);
  if(!request.headers.get('content-type')?.includes('application/json')) throw new TrackerError('Send a JSON request.');
  if(Number(request.headers.get('content-length')||0)>maxBytes) throw new TrackerError('Request is too large.',413);
  const reader=request.body?.getReader(); if(!reader) throw new TrackerError('A request body is required.');
  let size=0; const chunks:Uint8Array[]=[];
  while(true) {const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>maxBytes){await reader.cancel();throw new TrackerError('Request is too large.',413);} chunks.push(value);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new TrackerError('The request body is not valid JSON.');}
}
export function jsonError(error:unknown):Response {
  if(error instanceof ZodError) return Response.json({error:error.issues.map(issue=>`${issue.path.join('.')||'Request'}: ${issue.message}`).join('; '),code:'INVALID_REQUEST'},{status:400});
  const known=error as {status?:number;message?:string;code?:string};
  const status=typeof known?.status==='number' && known.status>=400 && known.status<=599?known.status:500;
  const message=status===500?'Something went wrong. Your changes were not saved. Please try again.':known?.message || 'The request failed.';
  return Response.json({error:message,code:known?.code || 'REQUEST_FAILED'},{status,headers:{'Cache-Control':'no-store'}});
}
