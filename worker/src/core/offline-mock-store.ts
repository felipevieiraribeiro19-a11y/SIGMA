/**
 * Persistent MOCK executor infrastructure for the Wrangler LOCAL offline lab.
 * It never requests an external URL and is never imported into the live Worker.
 * This is not a provider adapter for Google or other real services.
 */
import type {ExecutionJournal,MockExecutionRecord,MockExecutionState,MockProvider,ProviderResult} from './mock-executor';

const idPattern=/^[A-Za-z0-9_-]{4,100}$/;
type Scenario='success'|'reject'|'ack-lost'|'outage';
type ProviderCounter={calls:number;result?:ProviderResult};

export class OfflineDurableExecutionJournal implements ExecutionJournal{
 constructor(private readonly storage:DurableObjectStorage,private readonly ownerUid:string){
  if(!idPattern.test(ownerUid))throw Error('Proprietário fictício inválido.');
 }
 private key(ownerUid:string,actionId:string){
  if(!idPattern.test(ownerUid)||!idPattern.test(actionId)||ownerUid!==this.ownerUid)
   throw Error('Acesso a execução de outra conta.');
  return 'sigma:mock-executions:v1:'+ownerUid+':'+actionId;
 }
 async insertIfAbsent(record:MockExecutionRecord):Promise<boolean>{
  const key=this.key(record.actorUid,record.actionId);
  if(record.state!=='claimed'||!(/^[a-f0-9]{64}$/.test(record.digest))||
   !(/^[a-f0-9]{64}$/.test(record.payloadHash)))throw Error('Execução fictícia inválida.');
  return this.storage.transaction(async tx=>{
   if(await tx.get<MockExecutionRecord>(key))return false;
   await tx.put(key,structuredClone(record));
   return true;
  });
 }
 async get(ownerUid:string,actionId:string):Promise<MockExecutionRecord|null>{
  const value=await this.storage.get<MockExecutionRecord>(this.key(ownerUid,actionId));
  return value?structuredClone(value):null;
 }
 async changeIfState(
  ownerUid:string,actionId:string,from:MockExecutionState,to:MockExecutionRecord
 ):Promise<boolean>{
  const key=this.key(ownerUid,actionId);
  const transitionAllowed=(from==='claimed'&&
   ['confirmed-in-mock','rejected-in-mock','uncertain-in-mock'].includes(to.state))||
   (from==='uncertain-in-mock'&&
   ['confirmed-in-mock','rejected-in-mock'].includes(to.state));
  if(!transitionAllowed)throw Error('Mudança de execução fictícia inválida.');
  return this.storage.transaction(async tx=>{
   const old=await tx.get<MockExecutionRecord>(key);
   if(!old||old.state!==from||to.actorUid!==old.actorUid||
    to.actionId!==old.actionId||to.digest!==old.digest||
    to.payloadHash!==old.payloadHash||to.providerKey!==old.providerKey||
    to.capabilityId!==old.capabilityId)return false;
   await tx.put(key,structuredClone(to));
   return true;
  });
 }
}

/** Persistent synthetic provider: acknowledges simulated results by idempotency key. */
export class OfflineDurableMockProvider implements MockProvider{
 constructor(
  private readonly storage:DurableObjectStorage,
  private readonly scenario:Scenario,
  private readonly ownerUid:string
 ){}
 private key(providerKey:string){
  if(!providerKey.startsWith('sigma-mock:v1:'+this.ownerUid+':')||
   !providerKey.split(':').every(part=>part.length<=120))throw Error('Chave fictícia inválida.');
  return 'sigma:mock-provider:v1:'+providerKey;
 }
 async applyOnce(providerKey:string,_change:string):Promise<ProviderResult>{
  const key=this.key(providerKey);
  const record=await this.storage.transaction(async tx=>{
   const previous=await tx.get<ProviderCounter>(key);
   if(previous?.result)return previous;
   if(previous?.calls)throw Error('Tentativa repetida bloqueada.');
   const counter:ProviderCounter={calls:1};
   if(this.scenario==='success'||this.scenario==='ack-lost')
    counter.result={outcome:'confirmed',reference:'fictional-confirmation-'+providerKey.slice(-24)};
   if(this.scenario==='reject')
    counter.result={outcome:'rejected',reason:'Recusado pelo provedor fictício'};
   await tx.put(key,counter);
   return counter;
  });
  if(this.scenario==='outage')throw Error('Provedor fictício sem resposta');
  if(this.scenario==='ack-lost')throw Error('Mock confirmou mas perdeu a resposta');
  if(!record.result)throw Error('Nenhum recibo fictício disponível');
  return record.result;
 }
 async lookup(providerKey:string):Promise<ProviderResult|null>{
  return (await this.storage.get<ProviderCounter>(this.key(providerKey)))?.result||null;
 }
 async callCount(providerKey:string):Promise<number>{
  return (await this.storage.get<ProviderCounter>(this.key(providerKey)))?.calls||0;
 }
}
