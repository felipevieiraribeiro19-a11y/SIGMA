import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestApprovalStore} from '../worker/src/core/approval-ledger';
import {previewAction,stageActionReview,acceptActionReview,simulateActionReview} from '../worker/src/core/action-flow';
import {
 FictionalIdempotentProvider,TestExecutionJournal,
 simulateProviderExecution,reconcileMockExecution
} from '../worker/src/core/mock-executor';

const owner='owner_fictional';
const now=Date.parse('2026-10-21T15:00:00Z');
async function trustedFakeReceipt(){
 const store=new TestApprovalStore();
 const preview=previewAction({
  utterance:'Agende um evento no calendário',
  config:{googleConnected:false,searchConfigured:false},
  now,params:{kind:'calendar.create',calendarId:'primary',title:'Evento fictício',
   startsAt:'2035-11-01T10:00:00-03:00',endsAt:'2035-11-01T11:00:00-03:00'}
 });
 const approval=await stageActionReview(store,{
  preview,authenticatedUid:owner,proposalId:'fictional_action001',now
 });
 await acceptActionReview(store,{
  authenticatedUid:owner,proposalId:approval.id,
  displayedDigest:approval.digest,now:now+1000
 });
 return (await simulateActionReview(store,{
  authenticatedUid:owner,proposalId:approval.id,
  capabilityId:approval.capabilityId,now:now+2000
 })).receipt;
}
test('only a consumed fictional approval becomes a mock provider request',async()=>{
 const receipt=await trustedFakeReceipt();
 const journal=new TestExecutionJournal(),provider=new FictionalIdempotentProvider();
 const outcome=await simulateProviderExecution(receipt,journal,provider);
 assert.equal(outcome.state,'confirmed-in-mock');
 assert.match(outcome.providerReference||'',/^mock-operation/);
 assert.equal(provider.calls.length,1);
 const again=await simulateProviderExecution(receipt,journal,provider);
 assert.deepEqual(again,outcome);
 assert.equal(provider.calls.length,1,'do not repeat a confirmed operation');
});
test('acknowledgement lost after mock applied the change is uncertain, then resolved without resubmission',async()=>{
 const receipt=await trustedFakeReceipt();
 const journal=new TestExecutionJournal(),provider=new FictionalIdempotentProvider('ack-lost');
 const first=await simulateProviderExecution(receipt,journal,provider);
 assert.equal(first.state,'uncertain-in-mock');
 assert.equal(first.providerReference,undefined);
 assert.equal(provider.calls.length,1);
 const readAgain=await simulateProviderExecution(receipt,journal,provider);
 assert.equal(readAgain.state,'uncertain-in-mock');
 assert.equal(provider.calls.length,1);
 const reconciled=await reconcileMockExecution(receipt,journal,provider);
 assert.equal(reconciled.state,'confirmed-in-mock');
 assert.equal(provider.calls.length,1,'only provider status lookup, never second apply');
});
test('provider outage or unknown status never becomes a success and is not retried blindly',async()=>{
 const receipt=await trustedFakeReceipt();
 const journal=new TestExecutionJournal(),provider=new FictionalIdempotentProvider('outage');
 const unknown=await simulateProviderExecution(receipt,journal,provider);
 assert.equal(unknown.state,'uncertain-in-mock');
 assert.equal(provider.calls.length,1);
 const second=await reconcileMockExecution(receipt,journal,provider);
 assert.equal(second.state,'uncertain-in-mock');
 assert.equal(provider.calls.length,1);
});
test('definitive mock rejection is never reported as successful execution',async()=>{
 const receipt=await trustedFakeReceipt();
 const journal=new TestExecutionJournal(),provider=new FictionalIdempotentProvider('reject');
 const failure=await simulateProviderExecution(receipt,journal,provider);
 assert.equal(failure.state,'rejected-in-mock');
 assert.match(failure.reason||'',/rejected/);
 assert.equal((await reconcileMockExecution(receipt,journal,provider)).state,'rejected-in-mock');
 assert.equal(provider.calls.length,1);
});
test('concurrent attempts share the journal claim and invoke provider only once',async()=>{
 const receipt=await trustedFakeReceipt();
 const journal=new TestExecutionJournal(),provider=new FictionalIdempotentProvider();
 const values=await Promise.all(Array.from({length:8},()=>simulateProviderExecution(receipt,journal,provider)));
 assert.equal(provider.calls.length,1);
 const end=await reconcileMockExecution(receipt,journal,provider);
 assert.equal(end.state,'confirmed-in-mock');
 assert.ok(values.every(x=>x.state==='claimed'||x.state==='confirmed-in-mock'));
});
test('cannot change a previous operation by supplying same ID with different consent',async()=>{
 const receipt=await trustedFakeReceipt();
 const journal=new TestExecutionJournal(),provider=new FictionalIdempotentProvider();
 await simulateProviderExecution(receipt,journal,provider);
 await assert.rejects(()=>simulateProviderExecution({...receipt,digest:'f'.repeat(64)},journal,provider),/conflitante/);
 await assert.rejects(()=>simulateProviderExecution({...receipt,capabilityId:'integrations.unknown'},journal,provider),/fora do laboratório/);
 assert.equal(provider.calls.length,1);
});
test('future execution infrastructure does not register production route or invoke network',()=>{
 const source=readFileSync('worker/src/core/mock-executor.ts','utf8');
 const worker=readFileSync('worker/src/index.ts','utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|googleapis|firebasePersonalMemoryRepository|new DurableApprovalStore/);
 assert.doesNotMatch(worker,/from '.\/core\/mock-executor'|\/api\/actions\/execute/);
});
