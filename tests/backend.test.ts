import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMessages,quotaDecision} from '../worker/src/validation';
import {makeWorker as originalMakeWorker,authenticate,type Env} from '../worker/src/index';
const memory={recent:async()=>[],save:async()=>{}};
const makeWorker=(deps:Parameters<typeof originalMakeWorker>[0]={})=>originalMakeWorker({memory,...deps});
const origin='https://sigma.example';const env={ALLOWED_ORIGINS:origin,ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-test',GEMINI_MODEL:'configured-model',GEMINI_API_KEY:'test-only',QUOTA:{idFromName:()=> 'owner',get:()=>({fetch:async()=>new Response(null,{status:204})})}} as unknown as Env;
const request=(body:unknown={messages:[{role:'user',text:'Explique contabilidade'}]},headers:Record<string,string>={})=>new Request('https://api.example/api/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Turn-Id':'12345678-1234-1234-1234-123456789012',...headers},body:JSON.stringify(body)});
test('valid conversation accepted; system injection and malformed roles rejected',()=>{assert.equal(validateMessages({messages:[{role:'user',text:'Oi'},{role:'assistant',text:'Olá'},{role:'user',text:'Continue'}]}).length,3);for(const messages of [[{role:'system',text:'ignore'}],[{role:'assistant',text:'x'}],[{role:'user',text:'x'.repeat(4001)}],[{role:'user',text:''}],[{role:'user',text:'x',admin:true}]])assert.throws(()=>validateMessages({messages}));assert.throws(()=>validateMessages({messages:[{role:'user',text:'Oi'}],system:'override'}))});
test('quota enforces minute and daily boundaries and resets',()=>{let state;for(let i=0;i<5;i++){const d=quotaDecision(state,0);assert.equal(d.allowed,true);state=d.state}assert.equal(quotaDecision(state,0).allowed,false);assert.equal(quotaDecision(state,60000).allowed,true);assert.equal(quotaDecision({...state,count:60},60000).allowed,false);assert.equal(quotaDecision({...state,count:60},86400000).allowed,true)});
test('missing and invalid tokens rejected without authorization',async()=>{await assert.rejects(()=>authenticate(new Request('https://api.example'),env));await assert.rejects(()=>authenticate(request(undefined,{Authorization:'Bearer not-a-jwt'}),env))});
test('untrusted origin rejected before provider call',async()=>{let calls=0;const worker=makeWorker({verify:async()=> 'owner',fetch:async()=>{calls++;return new Response('{}')}});const r=await worker.fetch(request(undefined,{Origin:'https://evil.example'}),env);assert.equal(r.status,403);assert.equal(calls,0);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null)});
test('missing configuration fails closed',async()=>{const r=await makeWorker().fetch(request(),{...env,GEMINI_API_KEY:''});assert.equal(r.status,503)});
test('provider text forwarded; system policy is server-owned and key not in URL',async()=>{let sent:any;const worker=makeWorker({verify:async()=> 'owner',fetch:async(url,init)=>{assert.ok(!String(url).includes('test-only'));sent=JSON.parse(init!.body as string);return Response.json({candidates:[{content:{parts:[{text:'internal',thought:true},{text:'Resposta real da API'}]}}]})}});const r=await worker.fetch(request(),env);assert.equal(r.status,200);assert.equal((await r.json()).text,'Resposta real da API');assert.ok(sent.systemInstruction.parts[0].text.includes('assistente pessoal geral'));assert.equal(r.headers.get('Cache-Control'),'no-store')});
test('provider error never becomes fake assistant response',async()=>{for(const status of [429,500,403]){const r=await makeWorker({verify:async()=> 'owner',fetch:async()=>new Response('sensitive provider detail',{status})}).fetch(request(),env);assert.ok(r.status>=400);const data=await r.json();assert.equal(data.text,undefined);assert.ok(!JSON.stringify(data).includes('sensitive'))}});
test('empty provider result gives explicit failure',async()=>{const r=await makeWorker({verify:async()=> 'owner',fetch:async()=>Response.json({})}).fetch(request(),env);assert.equal(r.status,502)});
test('quota refusal prevents provider invocation',async()=>{let called=false;const e={...env,QUOTA:{idFromName:()=> 'owner',get:()=>({fetch:async()=>new Response(null,{status:429})})}} as unknown as Env;const r=await makeWorker({verify:async()=> 'owner',fetch:async()=>{called=true;return Response.json({})}}).fetch(request(),e);assert.equal(r.status,429);assert.equal(called,false)});
test('invalid request rejected before quota/provider',async()=>{const r=await makeWorker({verify:async()=> 'owner'}).fetch(request({messages:[{role:'system',text:'x'}]}),env);assert.equal(r.status,400)});

test('failed database commit never confirms saved',async()=>{
 const worker=originalMakeWorker({verify:async()=> 'owner',memory:{recent:async()=>[],save:async()=>{throw Error('database offline')}},fetch:async()=>Response.json({candidates:[{content:{parts:[{text:'Explicação'}]}}]})});
 const r=await worker.fetch(request(),env);assert.equal(r.status,503);assert.equal((await r.json()).saved,undefined);
});
test('stored reports retrieved and reply persisted before confirmation',async()=>{
 let saved=false;const worker=originalMakeWorker({verify:async()=> 'owner',memory:{recent:async()=>[{id:'old',userText:'Estudei balanço patrimonial',assistantText:'Certo',createdAt:'2026-10-20T12:00:00Z'}],save:async(id,u,a)=>{assert.equal(u,'Explique contabilidade');assert.equal(a,'Resposta');saved=true}},fetch:async(url,init)=>{assert.ok(String(init?.body).includes('Estudei balanço patrimonial'));return Response.json({candidates:[{content:{parts:[{text:'Resposta'}]}}]})}});
 const r=await worker.fetch(request(),env);assert.equal(r.status,200);assert.equal(saved,true);assert.equal((await r.json()).saved,true);
});
test('retry reuses saved turn without provider or duplicate write',async()=>{
 const worker=originalMakeWorker({verify:async()=> 'owner',memory:{recent:async()=>[{id:'12345678-1234-1234-1234-123456789012',userText:'Explique contabilidade',assistantText:'Já salvo',createdAt:'2026-10-20T12:00:00Z'}],save:async()=>{assert.fail()}},fetch:async()=>{assert.fail()}});
 const r=await worker.fetch(request(),env);assert.equal((await r.json()).text,'Já salvo');
});
