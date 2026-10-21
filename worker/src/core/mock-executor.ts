/**
 * Laboratory ONLY: simulate a provider acknowledgement after a consumed consent
 * receipt. No production endpoints import this file. No Google calls are made.
 *
 * A consumed authorization != a provider operation. This executor intentionally
 * separates "confirmed by mock", "rejected by mock", and "uncertain".
 * Uncertain operations are never blindly retried.
 */
import type {ApprovalReceipt} from './approval-ledger';

export type MockExecutionState='claimed'|'confirmed-in-mock'|'rejected-in-mock'|'uncertain-in-mock';
export type MockExecutionRecord={
 actionId:string;actorUid:string;capabilityId:string;
 digest:string;providerKey:string;state:MockExecutionState;
 providerReference?:string;reason?:string;
};
export type ProviderResult=
 |{outcome:'confirmed';reference:string}
 |{outcome:'rejected';reason:string};
export interface MockProvider {
 applyOnce(providerKey:string,change:string):Promise<ProviderResult>;
 lookup(providerKey:string):Promise<ProviderResult|null>;
}
export interface ExecutionJournal{
 insertIfAbsent(record:MockExecutionRecord):Promise<boolean>;
 get(ownerUid:string,actionId:string):Promise<MockExecutionRecord|null>;
 changeIfState(ownerUid:string,actionId:string,from:MockExecutionState,to:MockExecutionRecord):Promise<boolean>;
}
const opaque=/^[A-Za-z0-9_-]{4,100}$/;
const digestPattern=/^[0-9a-f]{64}$/;
const capabilityPattern=/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*){1,4}$/;
function validateReceipt(receipt:ApprovalReceipt){
 if(!opaque.test(receipt.id)||!opaque.test(receipt.actorUid)||
  !capabilityPattern.test(receipt.capabilityId)||!digestPattern.test(receipt.digest)||
  typeof receipt.target!=='string'||receipt.target.length<4||receipt.target.length>250||
  typeof receipt.change!=='string'||receipt.change.length<2||receipt.change.length>2000||
  !Number.isSafeInteger(receipt.consumedAt))throw Error('Recibo de teste inválido.');
 const permitted=receipt.capabilityId==='integration.calendar.write'||
  receipt.capabilityId==='integration.drive.write';
 if(!permitted)throw Error('Ferramenta fora do laboratório.');
}
function keyFor(receipt:ApprovalReceipt){
 return 'sigma-mock:v1:'+receipt.actorUid+':'+receipt.id;
}
function sameReceipt(record:MockExecutionRecord,receipt:ApprovalReceipt){
 if(record.actorUid!==receipt.actorUid||record.actionId!==receipt.id||
  record.digest!==receipt.digest||record.capabilityId!==receipt.capabilityId||
  record.providerKey!==keyFor(receipt))throw Error('Recibo conflitante com tarefa existente.');
}
function makeResult(previous:MockExecutionRecord,outcome:ProviderResult):MockExecutionRecord{
 return outcome.outcome==='confirmed'?
  {...previous,state:'confirmed-in-mock',providerReference:outcome.reference,reason:undefined}:
  {...previous,state:'rejected-in-mock',reason:outcome.reason,providerReference:undefined};
}
export async function simulateProviderExecution(
 receipt:ApprovalReceipt,journal:ExecutionJournal,provider:MockProvider
):Promise<MockExecutionRecord>{
 validateReceipt(receipt);
 const initial:MockExecutionRecord={actionId:receipt.id,actorUid:receipt.actorUid,
  capabilityId:receipt.capabilityId,digest:receipt.digest,providerKey:keyFor(receipt),state:'claimed'};
 const newlyClaimed=await journal.insertIfAbsent(initial);
 if(!newlyClaimed){
  const old=await journal.get(receipt.actorUid,receipt.id);
  if(!old)throw Error('Registro desapareceu durante a consulta.');
  sameReceipt(old,receipt);
  // Do not resubmit a potentially executed external operation.
  return old;
 }
 let outcome:ProviderResult;
 try{outcome=await provider.applyOnce(initial.providerKey,receipt.change);}
 catch{
  const unknown={...initial,state:'uncertain-in-mock' as const,reason:'Provider acknowledgement unavailable'};
  if(!await journal.changeIfState(receipt.actorUid,receipt.id,'claimed',unknown))
   throw Error('Conflito ao salvar operação incerta.');
  return unknown;
 }
 const updated=makeResult(initial,outcome);
 if(!await journal.changeIfState(receipt.actorUid,receipt.id,'claimed',updated))
  throw Error('Conflito ao salvar resultado da simulação.');
 return updated;
}
/**
 * Read-only reconciliation. A missing provider result stays uncertain;
 * it never causes an automatic second applyOnce call.
 */
export async function reconcileMockExecution(
 receipt:ApprovalReceipt,journal:ExecutionJournal,provider:MockProvider
):Promise<MockExecutionRecord>{
 validateReceipt(receipt);
 const old=await journal.get(receipt.actorUid,receipt.id);
 if(!old)throw Error('Não existe execução para reconciliar.');
 sameReceipt(old,receipt);
 if(old.state==='confirmed-in-mock'||old.state==='rejected-in-mock')return old;
 let status:ProviderResult|null;
 try{status=await provider.lookup(old.providerKey);}
 catch{return old;}
 if(!status){
  if(old.state==='uncertain-in-mock')return old;
  const unknown={...old,state:'uncertain-in-mock' as const,reason:'Provider has no result yet'};
  if(await journal.changeIfState(receipt.actorUid,receipt.id,old.state,unknown))return unknown;
  return (await journal.get(receipt.actorUid,receipt.id))||unknown;
 }
 const updated=makeResult(old,status);
 if(await journal.changeIfState(receipt.actorUid,receipt.id,old.state,updated))return updated;
 return (await journal.get(receipt.actorUid,receipt.id))||updated;
}
/** Test repository. All stored content is synthetic and never persisted. */
export class TestExecutionJournal implements ExecutionJournal{
 private rows=new Map<string,MockExecutionRecord>();
 private key(uid:string,actionId:string){return uid+':'+actionId;}
 async insertIfAbsent(record:MockExecutionRecord){
  const key=this.key(record.actorUid,record.actionId);
  if(this.rows.has(key))return false;
  this.rows.set(key,structuredClone(record));return true;
 }
 async get(uid:string,id:string){return structuredClone(this.rows.get(this.key(uid,id))||null);}
 async changeIfState(uid:string,id:string,from:MockExecutionState,to:MockExecutionRecord){
  const key=this.key(uid,id),old=this.rows.get(key);
  if(!old||old.state!==from||to.actionId!==id||to.actorUid!==uid||
   to.digest!==old.digest||to.providerKey!==old.providerKey)return false;
  this.rows.set(key,structuredClone(to));return true;
 }
}
export class FictionalIdempotentProvider implements MockProvider{
 private results=new Map<string,ProviderResult>();
 readonly calls:string[]=[];
 constructor(private readonly behavior:'success'|'reject'|'ack-lost'|'outage'='success'){}
 async applyOnce(key:string,_change:string):Promise<ProviderResult>{
  this.calls.push(key);
  const cached=this.results.get(key);
  if(cached)return cached;
  if(this.behavior==='outage')throw Error('Mock provider unreachable');
  const result:ProviderResult=this.behavior==='reject'?
   {outcome:'rejected',reason:'Mock provider rejected the operation'}:
   {outcome:'confirmed',reference:'mock-operation-'+this.results.size};
  this.results.set(key,result);
  if(this.behavior==='ack-lost')throw Error('Mock success acknowledgement lost');
  return result;
 }
 async lookup(key:string){return this.results.get(key)||null;}
}
