import { capabilities } from './config';
import { getOnboardingProfile } from '@/lib/onboarding/service';
import { TrackerError } from './errors';
import { actionSchemas } from './schemas';
import { createRecord, deleteRecord, getRecord, getUser, idempotent, listRecords, updateRecord, withOwnerTransaction } from './store';
import { flatten, type Application, type ApplicationData, type EntryData, type ConnectionData, type TrackerSnapshot, type SourceResumeData, type AnalysisData, type ResumeDraftData, type ResumeVersionData, type AiJobData, type ConversationData } from './types';

export async function getApplication(ownerId:string,id:string):Promise<Application> { return flatten(await getRecord<ApplicationData>(ownerId,'application',id)); }
export async function getSnapshot(ownerId:string):Promise<TrackerSnapshot> {
  return withOwnerTransaction(ownerId, async () => {
    const [user,applications,entries,resumes,analyses,drafts,versions,jobs,conversations,connections,onboarding] = await Promise.all([
      getUser(ownerId),listRecords<ApplicationData>(ownerId,'application'),listRecords<EntryData>(ownerId,'entry'),listRecords<SourceResumeData>(ownerId,'source_resume'),
      listRecords<AnalysisData>(ownerId,'analysis'),listRecords<ResumeDraftData>(ownerId,'builder_draft'),listRecords<ResumeVersionData>(ownerId,'resume_version'),listRecords<AiJobData>(ownerId,'ai_job'),listRecords<ConversationData>(ownerId,'conversation'),listRecords<ConnectionData>(ownerId,'connection'),getOnboardingProfile(ownerId),
    ]);
    // The workspace shell needs artifact identity and status, not copies of every document.
    // Full analyses, draft answers, and generated versions are fetched by owned record ID.
    return {
      user: {...user, name: onboarding?.data.displayName || user.name}, onboarding, applications:applications.map(flatten), entries:entries.map(flatten),
      resumes:resumes.map(record=>flatten({...record,data:{filename:record.data.filename,mimeType:record.data.mimeType,size:record.data.size}})),
      analyses:analyses.map(record=>flatten({...record,data:{sourceResumeId:record.data.sourceResumeId,score:record.data.analysis?.score || 0,imported:record.data.imported}})),
      drafts:drafts.map(record=>flatten({...record,data:{analysisId:record.data.analysisId}})),
      versions:versions.map(record=>flatten({...record,data:{analysisId:record.data.analysisId,sourceResumeId:record.data.sourceResumeId,label:record.data.label,headline:record.data.generatedResume?.preview?.headline,fullName:record.data.generatedResume?.preview?.fullName}})),
      jobs:jobs.map(record=>flatten({...record,data:{type:record.data.type,status:record.data.status,resultId:record.data.resultId,error:record.data.error,attempts:record.data.attempts}})),
      conversations:conversations.map(flatten), connection:connections[0]?.data || {enabled:true,lastUsedAt:null}, capabilities:capabilities(), demo:false,
    };
  });
}
function validateEntry(data:EntryData) {
  if (data.kind === 'interview' && !data.startAt) throw new TrackerError('An interview start time is required.');
  if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) throw new TrackerError('The interview must end after it starts.');
}
async function activity(ownerId:string, applicationId:string,title:string) {
  return createRecord<EntryData>(ownerId,'entry',{kind:'activity',title,body:'',dueDate:null,completed:false,startAt:null,endAt:null,timezone:'UTC',email:'',phone:'',url:'',contactRole:''},{applicationId});
}
export async function executeAction(ownerId:string,action:string,input:unknown,idempotencyKey:string):Promise<unknown> {
  const schema=actionSchemas[action];
  if(!schema) throw new TrackerError('Unknown tracker action.');
  const parsed=schema.parse(input) as Record<string,any>;
  return idempotent(ownerId,idempotencyKey,action,parsed,async()=>{
    if(action==='create_application') {
      const result=await createRecord<ApplicationData>(ownerId,'application',{...parsed,archived:false,submittedResumeVersionId:null,submittedSourceResumeId:null} as ApplicationData);
      await activity(ownerId,result.id,'Application added');
      return flatten(result);
    }
    if(['update_application','archive_application','restore_application'].includes(action)) {
      const previous=await getRecord<ApplicationData>(ownerId,'application',parsed.id);
      const {id,expectedVersion,...patch}=parsed;
      const data={...previous.data,...patch};
      if(action==='archive_application') data.archived=true;
      if(action==='restore_application') data.archived=false;
      const updated=await updateRecord(ownerId,'application',id,data,expectedVersion);
      const title=action==='archive_application'?'Application archived':action==='restore_application'?'Application restored':previous.data.stage!==data.stage?`Stage changed from ${previous.data.stage} to ${data.stage}`:'Application updated';
      await activity(ownerId,id,title);
      return flatten(updated);
    }
    if(action==='delete_entry') {
      const previous=await getRecord<EntryData>(ownerId,'entry',parsed.id);
      if(previous.data.kind==='activity') throw new TrackerError('Activity history cannot be removed.',403,'FORBIDDEN');
      if(previous.version!==parsed.expectedVersion) throw new TrackerError('This record changed elsewhere. Refresh before saving again.',409,'CONFLICT');
      await deleteRecord(ownerId,'entry',parsed.id);
      if(previous.applicationId) await activity(ownerId,previous.applicationId,`${previous.data.kind[0].toUpperCase()+previous.data.kind.slice(1)} removed`);
      return {id:parsed.id,deleted:true};
    }
    const kind=action.endsWith('note')?'note':action.endsWith('contact')?'contact':action.endsWith('task')?'task':'interview';
    if(action.startsWith('update_')) {
      const previous=await getRecord<EntryData>(ownerId,'entry',parsed.id);
      if(previous.data.kind!==kind) throw new TrackerError('The record type does not match this action.');
      const {id,expectedVersion,...patch}=parsed; const data={...previous.data,...patch}; validateEntry(data);
      const updated=await updateRecord(ownerId,'entry',id,data,expectedVersion);
      if(previous.applicationId) await activity(ownerId,previous.applicationId,`${kind[0].toUpperCase()+kind.slice(1)} updated`);
      return flatten(updated);
    }
    const {applicationId,...fields}=parsed; await getApplication(ownerId,applicationId);
    const data={...fields,kind} as EntryData; validateEntry(data);
    const created=await createRecord(ownerId,'entry',data,{applicationId});
    await activity(ownerId,applicationId,`${kind[0].toUpperCase()+kind.slice(1)} added`);
    return flatten(created);
  });
}
