import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorker,type Env} from '../worker/src/index';
import {AuditedDurableApprovalStore} from '../worker/src/core/audited-approval';
import {stageActionReview,acceptActionReview,rejectActionReview,simulateActionReview} from '../worker/src/core/action-flow';
import {previewAction} from '../worker/src/core/action-flow';

/** Transactional fake that copies before commit and never commits a failed callback. */
function testStorage(){
 let db=new Map<string,unknown>();
 let queue:Promise<unknown>=Promise.resolve();
 let failNextPut=false;
 const durable={
  get:async<T>(key:string)=>structuredClone(db.get(key)) as T|undefined,
  transaction:async<T>(operation:(tx:{
   get<V>(key:string):Promise<V|undefined>;
   put<V>(key:string,value:V):Promise<void>;
  })=>Promise<T>):Promise<T>=>{
   let unlock!:()=>void;
   const lock=new Promise<void>(resolve=>unlock=resolve);
   const previous=queue;queue=previous.then(()=>lock);await previous;
   try{
    const buffer=new Map(db);
    const result=await operation({
     get:async<V>(key:string)=>structuredClone(buffer.get(key)) as V|undefined,
     put:async<V>(key:string,value:V)=>{
      if(failNextPut){failNextPut=false;throw Error('storage unavailable');}
      buffer.set(key,structuredClone(value));
     }
    });
    db=buffer;
    return result;
   }finally{unlock();}
  }
 };
 return {durable:durable as unknown as DurableObjectStorage,
  inspect:()=>[...db.entries()].map(([key,value])=>[key,structuredClone(value)]),
  failNext:()=>{failNextPut=true}};
}
const uid='fictional_owner';
const clock=Date.parse('2026-10-21T15:00:00Z');
const details={kind:'calendar.create' as const,calendarId:'primary',
 title:'Compromisso inteiramente fictício',startsAt:'2030-06-01T10:00:00-03:00',
 endsAt:'2030-06-01T11:00:00-03:00'};
const config={googleConnected:false,searchConfigured:false};
const preview=()=>previewAction({utterance:'Agende um evento no calendário',config,now:clock,params:details});

test('prévia HTTP autenticada → revisão → aprovação → simulação auditada, sem operações externas',async()=>{
 const {durable,inspect}=testStorage();
 const workerEnv={
  ALLOWED_ORIGINS:'https://sigma.example',ALLOWED_UID:uid,
  FIREBASE_PROJECT_ID:'sigma-test',GEMINI_API_KEY:'fake',GEMINI_MODEL:'fake',
  ACTION_PREVIEW_ENABLED:'true',
  QUOTA:{get:()=>{throw Error('Quota should never be contacted')}}
 } as unknown as Env;
 let networkCalls=0,memoryCalls=0;
 const worker=makeWorker({verify:async()=>uid,
  fetch:async()=>{networkCalls++;throw Error('External call forbidden')},
  memory:{recent:async()=>{memoryCalls++;return []},
   save:async()=>{memoryCalls++;throw Error('Memory write forbidden')}}});
 const response=await worker.fetch(new Request('https://worker.example/api/actions/preview',{
  method:'POST',headers:{Origin:'https://sigma.example',Authorization:'Bearer mock',
   'Content-Type':'application/json'},
  body:JSON.stringify({utterance:'Agende um evento no calendário',params:details})
 }),workerEnv);
 assert.equal(response.status,200);
 const result=await response.json() as {preview:ReturnType<typeof previewAction>;
  persisted:false;authorizedForExecution:false};
 assert.equal(result.preview.status,'ready-for-review');
 assert.equal(result.persisted,false);
 assert.equal(result.authorizedForExecution,false);
 const approval=new AuditedDurableApprovalStore(durable,uid);
 const issued=await stageActionReview(approval,{
  preview:result.preview,authenticatedUid:uid,proposalId:'example001',now:clock
 });
 assert.equal(issued.state,'pending');
 const confirmed=await acceptActionReview(approval,{
  authenticatedUid:uid,proposalId:issued.id,displayedDigest:issued.digest,now:clock+1000
 });
 assert.equal(confirmed.status,'approved-not-executed');
 const used=await simulateActionReview(approval,{
  authenticatedUid:uid,proposalId:issued.id,capabilityId:issued.capabilityId,now:clock+2000
 });
 assert.equal(used.status,'simulated-only');
 assert.equal(used.executed,false);
 const audit=await approval.audit(uid,issued.id);
 assert.equal(audit?.state,'consumed');
 assert.deepEqual(audit?.events.map(e=>e.kind),['proposed','approved','simulation-consumed']);
 assert.ok(audit?.events.every(e=>e.executed===false));
 assert.deepEqual(audit?.events.map(e=>e.sequence),[1,2,3]);
 const serialized=JSON.stringify(audit);
 assert.doesNotMatch(serialized,/Compromisso inteiramente fictício|2030-06-01|fake|Bearer/);
 assert.equal(networkCalls,0);
 assert.equal(memoryCalls,0);
 assert.equal(inspect().length,1);
});

test('dono distinto não vê auditoria nem pode aprovar; cancelamento permanece verificável',async()=>{
 const {durable}=testStorage();
 const ownerStore=new AuditedDurableApprovalStore(durable,uid);
 const p=await stageActionReview(ownerStore,{preview:preview(),authenticatedUid:uid,proposalId:'example002',now:clock});
 const stranger=new AuditedDurableApprovalStore(durable,'fictional_other');
 await assert.rejects(()=>stranger.audit(uid,p.id),/outra conta/);
 assert.equal(await stranger.audit('fictional_other',p.id),null);
 await assert.rejects(()=>acceptActionReview(stranger,{
  authenticatedUid:'fictional_other',proposalId:p.id,displayedDigest:p.digest,now:clock+1000
 }),/não encontrada/);
 assert.equal(await rejectActionReview(ownerStore,{
  authenticatedUid:uid,proposalId:p.id,now:clock+2000
 }),true);
 const audit=await new AuditedDurableApprovalStore(durable,uid).audit(uid,p.id);
 assert.deepEqual(audit?.events.map(e=>e.kind),['proposed','cancelled']);
 await assert.rejects(()=>simulateActionReview(ownerStore,{
  authenticatedUid:uid,proposalId:p.id,capabilityId:p.capabilityId,now:clock+3000
 }),/não disponível/);
});

test('concorrência não duplica consumo e a auditoria registra apenas uma simulação',async()=>{
 const {durable}=testStorage();
 const store=new AuditedDurableApprovalStore(durable,uid);
 const p=await stageActionReview(store,{
  preview:preview(),authenticatedUid:uid,proposalId:'example003',now:clock
 });
 await acceptActionReview(store,{
  authenticatedUid:uid,proposalId:p.id,displayedDigest:p.digest,now:clock+1000
 });
 const results=await Promise.allSettled([1,2,3].map(()=>simulateActionReview(
  new AuditedDurableApprovalStore(durable,uid),{
   authenticatedUid:uid,proposalId:p.id,capabilityId:p.capabilityId,now:clock+2000
  })));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const audit=await store.audit(uid,p.id);
 assert.equal(audit?.events.filter(x=>x.kind==='simulation-consumed').length,1);
 assert.equal(audit?.executed,false);
});

test('falha transacional não altera autorização nem auditoria; nova tentativa é possível',async()=>{
 const {durable,failNext}=testStorage();
 const store=new AuditedDurableApprovalStore(durable,uid);
 const p=await stageActionReview(store,{
  preview:preview(),authenticatedUid:uid,proposalId:'example004',now:clock
 });
 failNext();
 await assert.rejects(()=>acceptActionReview(store,{
  authenticatedUid:uid,proposalId:p.id,displayedDigest:p.digest,now:clock+1000
 }),/storage unavailable/);
 assert.equal((await store.read(uid,p.id))?.state,'pending');
 assert.deepEqual((await store.audit(uid,p.id))?.events.map(e=>e.kind),['proposed']);
 await acceptActionReview(store,{
  authenticatedUid:uid,proposalId:p.id,displayedDigest:p.digest,now:clock+2000
 });
 assert.deepEqual((await store.audit(uid,p.id))?.events.map(e=>e.kind),['proposed','approved']);
});

test('dados expirados e ações incompletas nunca viram eventos de aprovação',async()=>{
 const {durable,inspect}=testStorage();
 const store=new AuditedDurableApprovalStore(durable,uid);
 const incomplete=previewAction({
  utterance:'Agende uma reunião amanhã no calendário',config,now:clock
 });
 await assert.rejects(()=>stageActionReview(store,{
  preview:incomplete,authenticatedUid:uid,proposalId:'example005',now:clock
 }),/incompleta/);
 assert.deepEqual(inspect(),[]);
 const p=await stageActionReview(store,{
  preview:preview(),authenticatedUid:uid,proposalId:'example006',now:clock
 });
 await assert.rejects(()=>acceptActionReview(store,{
  authenticatedUid:uid,proposalId:p.id,displayedDigest:p.digest,
  now:clock+300001
 }),/expirada/);
 assert.deepEqual((await store.audit(uid,p.id))?.events.map(e=>e.kind),['proposed']);
});
