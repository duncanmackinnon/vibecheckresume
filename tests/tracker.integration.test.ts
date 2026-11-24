import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { setPoolForTests, currentClient, withOwnerTransaction } from '../src/lib/tracker/db';
import { createRecord, getRecord, listRecords, saveUser } from '../src/lib/tracker/store';
import { executeAction, getSnapshot } from '../src/lib/tracker/service';
import { actionSchemas } from '../src/lib/tracker/schemas';
import type { Application, EntryData } from '../src/lib/tracker/types';

const alice={id:'a0000000-0000-4000-8000-000000000001',email:'alice@example.test',name:'Alice'};
const bob={id:'b0000000-0000-4000-8000-000000000001',email:'bob@example.test',name:'Bob'};
let db:PGlite;
before(async()=>{
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'test-only'});
  db=new PGlite();
  await db.exec(await readFile(new URL('../drizzle/0000_tracker.sql',import.meta.url),'utf8'));
  await db.exec('SET ROLE vibecheck_app');
  let queue=Promise.resolve();
  const pool={connect:async()=>{
    const previous=queue;let release!:()=>void;queue=new Promise<void>(resolve=>{release=resolve;});await previous;
    return {query:async(text:string,values?:unknown[])=>db.query(text,values),release};
  }};
  setPoolForTests(pool as unknown as Pool);
  await saveUser(alice,'https://issuer.test/','alice'); await saveUser(bob,'https://issuer.test/','bob');
});
after(async()=>{await db?.close();});

test('owner isolation, exact retry behavior, conflicting edits and application history',async()=>{
  const input={company:'Linear',role:'Product designer'};
  const created=await executeAction(alice.id,'create_application',input,'create-linear') as Application;
  const repeated=await executeAction(alice.id,'create_application',input,'create-linear');
  assert.deepEqual(repeated,created);
  assert.equal((await listRecords(alice.id,'application')).length,1);
  assert.equal((await listRecords(bob.id,'application')).length,0);
  await assert.rejects(getRecord(bob.id,'application',created.id),{status:404});
  await assert.rejects(executeAction(bob.id,'create_task',{applicationId:created.id,title:'Wrong account'},'bad-task'),{status:404});
  await assert.rejects(executeAction(alice.id,'create_application',{...input,role:'Engineer'},'create-linear'),{status:409});
  const edited=await executeAction(alice.id,'update_application',{id:created.id,expectedVersion:1,stage:'Applied'},'apply-linear') as Application;
  assert.equal(edited.version,2); assert.equal(edited.stage,'Applied');
  await assert.rejects(executeAction(alice.id,'update_application',{id:created.id,expectedVersion:1,stage:'Offer'},'stale-linear'),{status:409});
  const snapshot=await getSnapshot(alice.id);
  assert.equal(snapshot.entries.filter(entry=>entry.kind==='activity').length,2);
  assert.equal(snapshot.applications[0].stage,'Applied');
  const archived=await executeAction(alice.id,'archive_application',{id:created.id,expectedVersion:2},'archive-linear') as Application;
  assert.equal(archived.archived,true);
  const restored=await executeAction(alice.id,'restore_application',{id:created.id,expectedVersion:3},'restore-linear') as Application;
  assert.equal(restored.archived,false);
});

test('notes can be corrected with current versions and remain private',async()=>{
  const application=(await getSnapshot(alice.id)).applications[0];
  const note=await executeAction(alice.id,'add_note',{applicationId:application.id,title:'Interview context',body:'First draft'},'create-note') as {id:string;version:number};
  const changed=await executeAction(alice.id,'update_note',{id:note.id,expectedVersion:note.version,body:'Corrected context'},'edit-note') as {body:string};
  assert.equal(changed.body,'Corrected context');
  await assert.rejects(executeAction(bob.id,'update_note',{id:note.id,expectedVersion:2,body:'Foreign change'},'foreign-note'),{status:404});
  await assert.rejects(executeAction(alice.id,'update_note',{id:note.id,expectedVersion:1,body:'Stale change'},'stale-note'),{status:409});
});

test('RLS itself blocks foreign rows and foreign inserts without relying on service filters',async()=>{
  const own=await listRecords(alice.id,'application');
  await withOwnerTransaction(bob.id,async()=>{
    const result=await currentClient().query('SELECT * FROM tracker.records WHERE id=$1',[own[0].id]);
    assert.equal(result.rows.length,0);
  });
  await assert.rejects(withOwnerTransaction(bob.id,async()=>{
    await currentClient().query("INSERT INTO tracker.records(id,owner_id,kind,data) VALUES('f0000000-0000-4000-8000-000000000001',$1,'application','{}')",[alice.id]);
  }),/row-level security/i);
});

test('concurrent retries create one task; completing records requires the current version',async()=>{
  const application=(await listRecords(alice.id,'application'))[0];
  const args={applicationId:application.id,title:'Follow up',dueDate:'2026-09-20'};
  const results=await Promise.all([executeAction(alice.id,'create_task',args,'same-task'),executeAction(alice.id,'create_task',args,'same-task')]);
  assert.deepEqual(results[0],results[1]);
  const entry=results[0] as {id:string;version:number};
  await executeAction(alice.id,'update_task',{id:entry.id,expectedVersion:entry.version,completed:true},'complete-task');
  assert.equal((await getRecord<EntryData>(alice.id,'entry',entry.id)).data.completed,true);
});

test('date validation, interview ordering and forbidden authority fields fail without writes',async()=>{
  assert.equal(actionSchemas.create_application.safeParse({company:'',role:'Designer'}).success,false);
  assert.equal(actionSchemas.create_application.safeParse({company:'A',role:'Designer',ownerId:bob.id}).success,false);
  assert.equal(actionSchemas.create_application.safeParse({company:'A',role:'Designer',deadline:'2026-02-30'}).success,false);
  const application=(await listRecords(alice.id,'application'))[0];
  await assert.rejects(executeAction(alice.id,'create_interview',{applicationId:application.id,title:'Interview',startAt:'2026-09-21T15:00:00Z',endAt:'2026-09-21T14:00:00Z'},'bad-time'),{status:400});
  const interview=await executeAction(alice.id,'create_interview',{applicationId:application.id,title:'Timezone interview',startAt:'2026-09-21T10:00:00-04:00',endAt:'2026-09-21T11:00:00-04:00',timezone:'America/Toronto'},'offset-interview') as EntryData;
  assert.equal(interview.startAt,'2026-09-21T14:00:00.000Z');
  assert.equal(interview.endAt,'2026-09-21T15:00:00.000Z');
  assert.equal(interview.timezone,'America/Toronto');
});

test('saved artifacts are application-bound, durable across reads and hidden from other users',async()=>{
  const application=(await listRecords(alice.id,'application'))[0];
  const stored=await createRecord(alice.id,'resume_version',{label:'Version one',generatedResume:{latex:'original'}},{applicationId:application.id});
  assert.equal((await getRecord<any>(alice.id,'resume_version',stored.id)).data.generatedResume.latex,'original');
  await assert.rejects(getRecord(bob.id,'resume_version',stored.id),{status:404});
  assert.equal((await listRecords(alice.id,'resume_version',{applicationId:application.id})).length,1);
});
