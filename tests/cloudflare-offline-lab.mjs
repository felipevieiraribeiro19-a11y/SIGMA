// Cloudflare workerd/Miniflare E2E over HTTP, WITHOUT production accounts.
// Run only against an explicitly launched local Wrangler fixture.
import assert from 'node:assert/strict';
const port=process.env.SIGMA_LAB_PORT||'8795';
const base='http://127.0.0.1:'+port+'/offline-lab/';
const phase=process.argv[2]||'before';
let checks=0;
const headers={'X-SIGMA-LAB':'offline-fixture','Content-Type':'application/json'};
async function call(action,{method='POST',body,actor='fictional_owner',headersOverride}={}){
 const [route,extra]=action.split('&');
 const url=base+route+'?actor='+actor+(extra?'&'+extra:'');
 const response=await fetch(url,{method,headers:headersOverride||headers,
  ...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json();
 return {status:response.status,json};
}
async function check(name,fn){
 await fn();checks++;console.log('PASS '+name);
}

async function issueApprove(id){
 const issued=await call('issue',{body:{id}});
 assert.equal(issued.status,200,'issue '+id);
 const approved=await call('approve',{body:{id,digest:issued.json.digest}});
 assert.equal(approved.status,200,'approve '+id);
 assert.equal(approved.json.state,'approved');
}

if(phase==='before'){
 await check('health of real local workerd isolate',async()=>{
  const r=await call('health',{method:'GET'});
  assert.equal(r.status,200);
  assert.equal(r.json.actionsEnabled,false);
  assert.equal(r.json.externalProviders,false);
 });
 await check('unmarked external requests always forbidden',async()=>{
  const r=await call('health',{method:'GET',headersOverride:{}});
  assert.equal(r.status,403);
 });
 await check('unknown and real execution endpoints are not available',async()=>{
  const r=await call('execute',{body:{id:'test_execute01'}});
  assert.equal(r.status,404);
 });
 await check('create first test proposal in real Durable Object',async()=>{
  const r=await call('issue',{body:{id:'test_restart01'}});
  assert.equal(r.status,200);
  assert.match(r.json.digest,/^[a-f0-9]{64}$/);
  assert.equal(r.json.executed,false);
 });
 await check('other fictional user cannot read test proposal',async()=>{
  const r=await call('audit&id=test_restart01',{method:'GET',actor:'fictional_other'});
  assert.equal(r.status,200);
  assert.equal(r.json.audit,null);
 });
 await check('audit begins with only proposed and no external execution',async()=>{
  const r=await call('audit&id=test_restart01',{method:'GET'});
  assert.equal(r.status,200);
  assert.equal(r.json.audit.state,'pending');
  assert.deepEqual(r.json.audit.events.map(e=>e.kind),['proposed']);
  assert.ok(r.json.audit.events.every(e=>e.executed===false));
 });
 await check('reject wrong fingerprints with no state change',async()=>{
  const r=await call('approve',{body:{id:'test_restart01',digest:'0'.repeat(64)}});
  assert.equal(r.status,409);
  const audit=await call('audit&id=test_restart01',{method:'GET'});
  assert.deepEqual(audit.json.audit.events.map(e=>e.kind),['proposed']);
 });
 await check('isolated cancellation survives even if owner tries again',async()=>{
  assert.equal((await call('issue',{body:{id:'test_cancel001'}})).status,200);
  const r=await call('cancel',{body:{id:'test_cancel001'}});
  assert.equal(r.status,200);
  assert.equal(r.json.cancelled,true);
  const attempts=await call('consume',{body:{id:'test_cancel001'}});
  assert.equal(attempts.status,409);
 });
 await check('mock provider confirms a fictional action only after reviewed consent',async()=>{
  await issueApprove('test_mock_ok01');
  const r=await call('mock-execute',{body:{id:'test_mock_ok01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'confirmed-in-mock');
  assert.equal(r.json.executed,false);
  const status=await call('mock-status&id=test_mock_ok01',{method:'GET'});
  assert.equal(status.json.mockProviderCalls,1);
 });
 await check('mock provider rejects without inventing a successful result',async()=>{
  await issueApprove('test_mock_reject01');
  const r=await call('mock-execute',{body:{id:'test_mock_reject01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'rejected-in-mock');
  assert.equal(r.json.executed,false);
 });
 await check('lost mock acknowledgement leaves a durable uncertain result',async()=>{
  await issueApprove('test_mock_acklost01');
  const r=await call('mock-execute',{body:{id:'test_mock_acklost01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'uncertain-in-mock');
  assert.equal(r.json.executed,false);
 });
 await check('unreachable mock provider is uncertain, not success',async()=>{
  await issueApprove('test_mock_outage01');
  const r=await call('mock-execute',{body:{id:'test_mock_outage01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'uncertain-in-mock');
 });
 await check('unapproved mock operation is denied before touching provider',async()=>{
  const issued=await call('issue',{body:{id:'test_mock_okunapproved'}});
  assert.equal(issued.status,200);
  const denied=await call('mock-execute',{body:{id:'test_mock_okunapproved'}});
  assert.equal(denied.status,409);
  const state=await call('mock-status&id=test_mock_okunapproved',{method:'GET'});
  assert.equal(state.json.state,null);
  assert.equal(state.json.mockProviderCalls,0);
 });
 console.log('OFFLINE_LAB_PHASE_ONE_OK checks='+checks);
}else if(phase==='after'){
 await check('proposal persists after separate Wrangler workerd restart',async()=>{
  const r=await call('audit&id=test_restart01',{method:'GET'});
  assert.equal(r.status,200);
  assert.equal(r.json.audit.state,'pending');
  assert.deepEqual(r.json.audit.events.map(e=>e.kind),['proposed']);
 });
 await check('a previously used proposal ID cannot be recreated after restart',async()=>{
  const r=await call('issue',{body:{id:'test_restart01'}});
  assert.equal(r.status,409);
 });
 await check('cancellation survives restart and cannot be consumed',async()=>{
  const audit=await call('audit&id=test_cancel001',{method:'GET'});
  assert.equal(audit.status,200);
  assert.equal(audit.json.audit.state,'cancelled');
  assert.deepEqual(audit.json.audit.events.map(e=>e.kind),['proposed','cancelled']);
  const attempted=await call('consume',{body:{id:'test_cancel001'}});
  assert.equal(attempted.status,409);
 });
 await check('wrong actor receives no proposal after restart',async()=>{
  const r=await call('audit&id=test_restart01',{method:'GET',actor:'fictional_other'});
  assert.equal(r.status,200);
  assert.equal(r.json.audit,null);
 });
 await check('exact fingerprint is needed to approve',async()=>{
  const before=await call('issue',{body:{id:'test_oneuse01'}});
  assert.equal(before.status,200);
  const wrong=await call('approve',{body:{id:'test_oneuse01',digest:'f'.repeat(64)}});
  assert.equal(wrong.status,409);
  const approved=await call('approve',{body:{id:'test_oneuse01',digest:before.json.digest}});
  assert.equal(approved.status,200);
  assert.equal(approved.json.state,'approved');
  assert.equal(approved.json.executed,false);
 });
 await check('concurrent receipt consumers only succeed once in real Durable Object',async()=>{
  const results=await Promise.all(Array.from({length:5},()=>call('consume',{body:{id:'test_oneuse01'}})));
  assert.equal(results.filter(x=>x.status===200).length,1);
  assert.equal(results.filter(x=>x.status===409).length,4);
  assert.equal(results.find(x=>x.status===200).json.status,'simulated-only');
 });
 await check('minimal audit keeps no task text or oauth secrets',async()=>{
  const r=await call('audit&id=test_oneuse01',{method:'GET'});
  assert.equal(r.status,200);
  assert.deepEqual(r.json.audit.events.map(x=>x.kind),['proposed','approved','simulation-consumed']);
  assert.equal(r.json.audit.executed,false);
  assert.doesNotMatch(JSON.stringify(r.json.audit),/Evento fictício do laboratório SIGMA|2035-05-20|calendarId|accessToken/i);
 });
 await check('unapproved proposal cannot be consumed',async()=>{
  const r=await call('consume',{body:{id:'test_restart01'}});
  assert.equal(r.status,409);
 });
 await check('mock execution outcomes persist after restarting real workerd',async()=>{
  for(const [id,status] of [
   ['test_mock_ok01','confirmed-in-mock'],
   ['test_mock_reject01','rejected-in-mock'],
   ['test_mock_acklost01','uncertain-in-mock'],
   ['test_mock_outage01','uncertain-in-mock']
  ]){
   const r=await call('mock-status&id='+id,{method:'GET'});
   assert.equal(r.status,200);
   assert.equal(r.json.state,status);
   assert.equal(r.json.mockProviderCalls,1);
  }
 });
 await check('lost acknowledgement reconciles from persisted mock-provider result without reapplying',async()=>{
  const r=await call('mock-reconcile',{body:{id:'test_mock_acklost01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'confirmed-in-mock');
  assert.equal(r.json.executed,false);
  const stat=await call('mock-status&id=test_mock_acklost01',{method:'GET'});
  assert.equal(stat.json.mockProviderCalls,1);
 });
 await check('outage stays uncertain, never blindly repeats operation',async()=>{
  const r=await call('mock-reconcile',{body:{id:'test_mock_outage01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'uncertain-in-mock');
  const stat=await call('mock-status&id=test_mock_outage01',{method:'GET'});
  assert.equal(stat.json.mockProviderCalls,1);
 });
 await check('repeated mock execution is read-only for already consumed approval',async()=>{
  const r=await call('mock-execute',{body:{id:'test_mock_ok01'}});
  assert.equal(r.status,200);
  assert.equal(r.json.state,'confirmed-in-mock');
  const stat=await call('mock-status&id=test_mock_ok01',{method:'GET'});
  assert.equal(stat.json.mockProviderCalls,1);
 });
 await check('five concurrent mock executions use exactly one provider attempt',async()=>{
  const id='test_mock_okconcurrent';
  await issueApprove(id);
  const results=await Promise.all(Array.from({length:5},()=>call('mock-execute',{body:{id}})));
  assert.ok(results.every(x=>x.status===200));
  const status=await call('mock-status&id='+id,{method:'GET'});
  assert.equal(status.json.state,'confirmed-in-mock');
  assert.equal(status.json.mockProviderCalls,1);
 });
 await check('different fictional accounts cannot see another execution result',async()=>{
  const result=await call('mock-status&id=test_mock_ok01',{
   method:'GET',actor:'fictional_other'
  });
  assert.equal(result.status,200);
  assert.equal(result.json.state,null);
  assert.equal(result.json.mockProviderCalls,0);
 });
 console.log('OFFLINE_LAB_PHASE_TWO_OK checks='+checks);
}else{
 throw new Error('Unknown test phase: '+phase);
}
