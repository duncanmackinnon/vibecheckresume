import { z } from 'zod';
import { requireUser } from '@/lib/tracker/auth';
import { createRecord,listRecords,updateRecord,withOwnerTransaction } from '@/lib/tracker/store';
import type { ConnectionData } from '@/lib/tracker/types';
import { jsonError,readJson } from '@/lib/tracker/http';
export async function POST(request:Request) { try {
  const user=await requireUser(request);const {enabled}=z.object({enabled:z.boolean()}).strict().parse(await readJson(request));
  const data=await withOwnerTransaction(user.id,async()=>{const previous=(await listRecords<ConnectionData>(user.id,'connection'))[0];const next={enabled,lastUsedAt:previous?.data.lastUsedAt||null,revokedBefore:enabled?previous?.data.revokedBefore||null:new Date().toISOString()};if(previous) await updateRecord(user.id,'connection',previous.id,next,previous.version);else await createRecord(user.id,'connection',next);return next;});
  return Response.json(data);
}catch(error){return jsonError(error);} }
