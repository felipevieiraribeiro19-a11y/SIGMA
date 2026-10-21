/**
 * Bridge between conversational intent and explicit action authorization.
 * This module NEVER calls Google, Firebase, Cloudflare or a model.
 * It is not registered with the public Worker and may only run in isolated tests.
 *
 * Natural language alone CANNOT specify an executable action. The details must
 * first be resolved, shown to the user and explicitly approved in a trusted UI.
 */
import {makeAssistantPlan} from './orchestrator';
import type {CapabilityConfig} from './capabilities';
import {
 issueApproval,confirmApproval,cancelApproval,consumeApproval,
 type ApprovalStore,type ApprovalItem,type ApprovalReceipt
} from './approval-ledger';

export type CalendarCreate={
 kind:'calendar.create';calendarId:string;title:string;startsAt:string;endsAt:string
};
export type DriveRename={
 kind:'drive.rename';fileId:string;newName:string
};
export type ActionParameters=CalendarCreate|DriveRename;
export type PreviewStatus='needs-details'|'ready-for-review'|'unsupported';
export type ActionPreview={
 status:PreviewStatus;capabilityId:string|null;actionKind:string|null;
 missing:string[];summary:string;target:string|null;change:string|null;
 params:ActionParameters|null;executionEnabled:false;
};

const text=(value:unknown,max:number)=>typeof value==='string'&&
 value.trim().length>0&&value.length<=max&&!/[\x00-\x1f]/.test(value);
const isoOffset=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/;
const fileId=/^[A-Za-z0-9_-]{10,200}$/;

function checkPayloadShape(obj:unknown,keys:string[]):boolean{
 return !!obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).length===keys.length&&Object.keys(obj).every(k=>keys.includes(k));
}
function validateParams(input:unknown,now:number):ActionParameters|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const p=input as Partial<CalendarCreate&DriveRename> &{kind?:string};
 if(p.kind==='calendar.create'){
  if(!checkPayloadShape(p,['kind','calendarId','title','startsAt','endsAt'])||
   !text(p.calendarId,100)||!text(p.title,180)||
   typeof p.startsAt!=='string'||typeof p.endsAt!=='string'||
   !isoOffset.test(p.startsAt)||!isoOffset.test(p.endsAt))return null;
  const start=Date.parse(p.startsAt),end=Date.parse(p.endsAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||
   start<=now||end<=start||end-start>24*60*60*1000)return null;
  if(p.calendarId!=='primary'&&!fileId.test(p.calendarId))return null;
  return {kind:'calendar.create',calendarId:p.calendarId,title:p.title.trim(),startsAt:p.startsAt,endsAt:p.endsAt};
 }
 if(p.kind==='drive.rename'){
  if(!checkPayloadShape(p,['kind','fileId','newName'])||
    typeof p.fileId!=='string'||!fileId.test(p.fileId)||
    !text(p.newName,220)||/[\/\\]/.test(p.newName))return null;
  return {kind:'drive.rename',fileId:p.fileId,newName:p.newName.trim()};
 }
 return null;
}
function requestedKind(utterance:string,capabilityId:string):ActionParameters['kind']|null{
 if(capabilityId==='integration.calendar.write'){
  return /\b(crie|criar|agende|agendar|marque|marcar|adicione|adicionar|inclua|incluir)\b/i.test(utterance)?'calendar.create':null;
 }
 if(capabilityId==='integration.drive.write'){
  return /\b(renomeie|renomear)\b/i.test(utterance)?'drive.rename':null;
 }
 return null;
}
function missingFields(kind:ActionParameters['kind']|null):string[]{
 if(kind==='calendar.create')return ['calendário','título','data e horário inicial','horário final'];
 if(kind==='drive.rename')return ['arquivo de destino','novo nome'];
 return ['tipo de operação suportado'];
}

export function previewAction(input:{
 utterance:string;config:CapabilityConfig;params?:unknown;now:number
}):ActionPreview{
 if(typeof input.utterance!=='string'||input.utterance.length>3800||
  !Number.isSafeInteger(input.now)||input.now<0)throw new Error('Pedido inválido.');
 const plan=makeAssistantPlan(input.utterance,input.config);
 if(plan.mode!=='action-proposal'||!plan.proposedAction)return {
  status:'unsupported',capabilityId:null,actionKind:null,
  missing:[],summary:'Nenhuma alteração externa proposta nesta mensagem.',
  target:null,change:null,params:null,executionEnabled:false
 };
 const capabilityId=plan.proposedAction.capabilityId,kind=requestedKind(input.utterance,capabilityId);
 if(!kind)return {
  status:'unsupported',capabilityId,actionKind:null,missing:missingFields(null),
  summary:'Essa alteração ainda não possui um contrato seguro de execução.',
  target:null,change:null,params:null,executionEnabled:false
 };
 const params=validateParams(input.params,input.now);
 if(!params||params.kind!==kind)return {
  status:'needs-details',capabilityId,actionKind:kind,
  missing:missingFields(kind),
  summary:'É necessário revisar os detalhes antes de qualquer autorização.',
  target:null,change:null,params:null,executionEnabled:false
 };
 // Structured, canonical payload. The digest covers the exact operation and
 // target, not an ambiguous rephrasing by a language model.
 const target=params.kind==='calendar.create'
  ?'calendar:'+params.calendarId:'drive-file:'+params.fileId;
 const change=JSON.stringify(params);
 return {
  status:'ready-for-review',capabilityId,actionKind:kind,
  missing:[],summary:params.kind==='calendar.create'
   ?'Proposta: criar compromisso (NÃO executado)'
   :'Proposta: renomear arquivo (NÃO executado)',
  target,change,params,executionEnabled:false
 };
}
export async function stageActionReview(store:ApprovalStore,input:{
 preview:ActionPreview;authenticatedUid:string;proposalId:string;now:number
}):Promise<ApprovalItem>{
 const validated=validateParams(input.preview.params,input.now);
 const expectedTarget=validated?.kind==='calendar.create'?'calendar:'+validated.calendarId:
  validated?.kind==='drive.rename'?'drive-file:'+validated.fileId:null;
 const expectedCapability=validated?.kind==='calendar.create'?'integration.calendar.write':
  validated?.kind==='drive.rename'?'integration.drive.write':null;
 if(input.preview.status!=='ready-for-review'||input.preview.executionEnabled||
  !validated||!expectedTarget||!expectedCapability||
  input.preview.capabilityId!==expectedCapability||
  input.preview.target!==expectedTarget||
  input.preview.change!==JSON.stringify(validated))
  throw new Error('Proposta incompleta, alterada ou não revisada.');
 return issueApproval(store,{
  id:input.proposalId,actorUid:input.authenticatedUid,
  capabilityId:input.preview.capabilityId,target:input.preview.target,
  change:input.preview.change,now:input.now
 });
}
export async function acceptActionReview(store:ApprovalStore,input:{
 authenticatedUid:string;proposalId:string;displayedDigest:string;now:number
}):Promise<{status:'approved-not-executed';item:ApprovalItem}>{
 const item=await confirmApproval(store,{
  id:input.proposalId,authenticatedUid:input.authenticatedUid,
  displayedDigest:input.displayedDigest,now:input.now
 });
 return {status:'approved-not-executed',item};
}
export async function rejectActionReview(store:ApprovalStore,input:{
 authenticatedUid:string;proposalId:string;now:number
}):Promise<boolean>{
 return cancelApproval(store,{id:input.proposalId,authenticatedUid:input.authenticatedUid,now:input.now});
}
/** A test-only receipt never calls an external provider or reports success. */
export async function simulateActionReview(store:ApprovalStore,input:{
 authenticatedUid:string;proposalId:string;capabilityId:string;now:number
}):Promise<{status:'simulated-only';executed:false;receipt:ApprovalReceipt}>{
 const receipt=await consumeApproval(store,{
  id:input.proposalId,authenticatedUid:input.authenticatedUid,
  capabilityId:input.capabilityId,now:input.now
 });
 return {status:'simulated-only',executed:false,receipt};
}
