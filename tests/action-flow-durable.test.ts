import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAction,stageActionReview,acceptActionReview,simulateActionReview} from '../worker/src/core/action-flow';
import {DurableApprovalStore} from '../worker/src/core/approval-durable';

const now=Date.parse('2026-10-21T15:00:00Z');
const config={googleConnected:false,searchConfigured:false};

/** Emulates the Durable Object storage transaction lock and persistent map. */
function fakeStorage(){
 const values=new Map<string,unknown>();
 let queue:Promise<unknown>=Promise.resolve();
 const storage={
  get:async<T>(k:string)=>structuredClone(values.get(k)) as T|undefined,
  transaction:async<T>(callback:(tx:{
   get<V>(k:string):Promise<V|undefined>;
   put<V>(k:string,v:V):Promise<void>
  })=>Promise<T>):Promise<T>=>{
   let unlock!:()=>void;
   const release=new Promise<void>(resolve=>{unlock=resolve});
   const prior=queue;queue=prior.then(()=>release);await prior;
   try{return await callback({
    get:async<V>(key:string)=>structuredClone(values.get(key)) as V|undefined,
    put:async<V>(key:string,v:V)=>{values.set(key,structuredClone(v))}
   })}finally{unlock()}
  }
 };
 return {storage:storage as unknown as DurableObjectStorage,values};
}
test('Jarvis completa o circuito plano -> revisão -> confirmação -> simulação sem APIs externas',async()=>{
 const {storage,values}=fakeStorage();
 const userId='fictional_owner';
 const details={kind:'calendar.create' as const,calendarId:'primary',title:'Teste do Jarvis',
  startsAt:'2030-12-09T10:00:00-03:00',endsAt:'2030-12-09T11:00:00-03:00'};
 const preview=previewAction({utterance:'Agende um compromisso no calendário',params:details,now,config});
 assert.equal(preview.status,'ready-for-review');
 assert.equal(values.size,0,'plan does not write storage');
 const issued=await stageActionReview(new DurableApprovalStore(storage,userId),{
  preview,authenticatedUid:userId,proposalId:'proposal_fake001',now
 });
 assert.equal(issued.state,'pending');
 assert.equal(values.size,1);
 // Simulate a Worker restart between proposal, confirmation and consumption.
 const confirmed=await acceptActionReview(new DurableApprovalStore(storage,userId),{
  authenticatedUid:userId,proposalId:issued.id,displayedDigest:issued.digest,now:now+1000
 });
 assert.equal(confirmed.status,'approved-not-executed');
 const simulation=await simulateActionReview(new DurableApprovalStore(storage,userId),{
  authenticatedUid:userId,proposalId:issued.id,capabilityId:issued.capabilityId,now:now+2000
 });
 assert.equal(simulation.status,'simulated-only');
 assert.equal(simulation.executed,false);
 assert.equal(simulation.receipt.target,'calendar:primary');
 assert.equal((await new DurableApprovalStore(storage,userId).read(userId,issued.id))?.state,'consumed');
});
test('dois consumidores após reinício só recebem uma autorização',async()=>{
 const {storage}=fakeStorage(),actorUid='fictional_owner';
 const preview=previewAction({utterance:'Renomeie documento no Google Drive',config,now,
  params:{kind:'drive.rename',fileId:'fictional_file_001',newName:'Arquivo fictício.pdf'}});
 const proposal=await stageActionReview(new DurableApprovalStore(storage,actorUid),{
  preview,authenticatedUid:actorUid,proposalId:'proposal_fake002',now
 });
 await acceptActionReview(new DurableApprovalStore(storage,actorUid),{
  authenticatedUid:actorUid,proposalId:proposal.id,displayedDigest:proposal.digest,now:now+1000
 });
 const results=await Promise.allSettled([
  simulateActionReview(new DurableApprovalStore(storage,actorUid),{authenticatedUid:actorUid,proposalId:proposal.id,capabilityId:proposal.capabilityId,now:now+2000}),
  simulateActionReview(new DurableApprovalStore(storage,actorUid),{authenticatedUid:actorUid,proposalId:proposal.id,capabilityId:proposal.capabilityId,now:now+2000})
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
