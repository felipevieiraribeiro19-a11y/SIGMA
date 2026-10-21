import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActionReviewCenter,REVIEW_DEMOS} from '../src/ActionReviewCenter';
import {makeWorker,type Env} from '../worker/src/index';
import {buildReadOnlyActionPreview,readLimitedPreviewJson} from '../worker/src/core/review-api';

const origin='https://sigma.example';
const user='fictional_owner';
const baseEnv={
 ALLOWED_ORIGINS:origin,ALLOWED_UID:user,FIREBASE_PROJECT_ID:'sigma-test',
 GEMINI_API_KEY:'mock-only',GEMINI_MODEL:'mock-model',
 QUOTA:{get:()=>{throw Error('QUOTA must not be read');},idFromName:()=>{throw Error('No quota needed')}}
} as unknown as Env;
const payload={
 utterance:'Agende um evento no calendário',
 params:{kind:'calendar.create',calendarId:'primary',title:'Evento fictício',
  startsAt:'2030-09-01T14:00:00-03:00',endsAt:'2030-09-01T15:00:00-03:00'}
};
const request=(data:unknown=payload,headers:Record<string,string>={},method='POST')=>
 new Request('https://api.example/api/actions/preview',{
  method,headers:{Origin:origin,Authorization:'Bearer fake-token','Content-Type':'application/json',...headers},
  ...(method==='POST'?{body:JSON.stringify(data)}:{})
 });

test('previews are disabled by default even with legitimate account',async()=>{
 let verified=0,externalCalls=0;
 const w=makeWorker({verify:async()=>{verified++;return user},
  fetch:async()=>{externalCalls++;throw Error('Should not be called')},
  memory:{recent:async()=>{throw Error('No memory read')},save:async()=>{throw Error('No memory write')}}});
 const res=await w.fetch(request(),baseEnv);
 assert.equal(res.status,404);
 assert.equal(verified,0);
 assert.equal(externalCalls,0);
 assert.deepEqual((await res.json()).text,undefined);
});

test('enabled route requires signed-in owner before parsing request or calling anything',async()=>{
 const env={...baseEnv,ACTION_PREVIEW_ENABLED:'true'};
 const w=makeWorker({fetch:async()=>{throw Error('No provider call')},
  memory:{recent:async()=>{throw Error('No memories')},save:async()=>{throw Error('No saves')}}});
 const res=await w.fetch(request(),env);
 assert.equal(res.status,401);
});

test('origin, method and unknown execution route are rejected before any side effect',async()=>{
 const env={...baseEnv,ACTION_PREVIEW_ENABLED:'true'};
 const w=makeWorker({verify:async()=>user});
 assert.equal((await w.fetch(request(payload,{Origin:'https://untrusted.example'}),env)).status,403);
 assert.equal((await w.fetch(request(payload,{},'GET'),env)).status,405);
 const exec=new Request('https://api.example/api/actions/execute',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer fake-token'}
 });
 assert.equal((await w.fetch(exec,env)).status,404);
});

test('authenticated enabled preview is read-only, independent of model, quota, OAuth and Firestore',async()=>{
 const env={...baseEnv,ACTION_PREVIEW_ENABLED:'true'};
 let verifyCount=0;
 const w=makeWorker({verify:async()=>{verifyCount++;return user},
  fetch:async()=>{throw Error('Google/Gemini should never be queried')},
  memory:{recent:async()=>{throw Error('Should not read conversations')},save:async()=>{throw Error('Should not persist')}}});
 const res=await w.fetch(request(),env);
 assert.equal(res.status,200);
 const body=await res.json() as any;
 assert.equal(body.persisted,false);
 assert.equal(body.authorizedForExecution,false);
 assert.equal(body.preview.executionEnabled,false);
 assert.equal(body.preview.status,'ready-for-review');
 assert.equal(body.preview.target,'calendar:primary');
 assert.match(body.preview.summary,/NÃO executado/);
 assert.equal(verifyCount,1);
});

test('malformed proposals fail while vague requests require more details',async()=>{
 const w=makeWorker({verify:async()=>user});
 const env={...baseEnv,ACTION_PREVIEW_ENABLED:'true'};
 const vague=await w.fetch(request({utterance:payload.utterance,params:{kind:'calendar.create'}}),env);
 assert.equal(vague.status,200);
 assert.equal((await vague.json()).preview.status,'needs-details');
 for(const bad of [
  {...payload,role:'admin'},
  {utterance:'x'.repeat(501),params:payload.params},
  {utterance:payload.utterance},
  {utterance:payload.utterance,params:'unsafe'}
 ]){
  const res=await w.fetch(request(bad),env);
  assert.equal(res.status,400);
 }
 const oversized=request({...payload,utterance:'Agende '+('z'.repeat(6000))});
 const res=await w.fetch(oversized,env);
 assert.equal(res.status,400);
 assert.equal((await res.json()).preview,undefined);
});

test('pure preview serializer never grants execution even when supported',()=>{
 const r=buildReadOnlyActionPreview(payload,{searchConfigured:false,googleConnected:false},Date.parse('2026-10-21T15:00:00Z'));
 assert.equal(r.preview.status,'ready-for-review');
 assert.equal(r.authorizedForExecution,false);
 assert.equal(r.persisted,false);
 assert.equal(r.preview.executionEnabled,false);
});

test('UI renders fictional data only and never renders a real confirmation control',()=>{
 const markup=renderToStaticMarkup(createElement(ActionReviewCenter,{}));
 assert.match(markup,/Revisão de tarefas/);
 assert.match(markup,/demonstração/);
 assert.match(markup,/fictíci/);
 assert.match(markup,/Confirmar execução \(indisponível\)/);
 assert.match(markup,/disabled/);
 assert.equal(REVIEW_DEMOS.length,2);
 assert.equal(REVIEW_DEMOS.every(d=>JSON.stringify(d).includes('fictíci')||JSON.stringify(d).includes('fictional')),true);
 const ui=readFileSync('src/ActionReviewCenter.tsx','utf8');
 assert.doesNotMatch(ui,/\b(?:fetch|localStorage|sessionStorage|indexedDB)\s*(?:\(|\.|\[)/);
});

test('feature flag is not enabled in deploy config or public assets',()=>{
 const config=readFileSync('worker/wrangler.toml','utf8');
 const publicConfig=readFileSync('public/config.json','utf8');
 assert.doesNotMatch(config,/ACTION_PREVIEW_ENABLED\s*=\s*["']true/);
 assert.doesNotMatch(publicConfig,/ACTION_PREVIEW_ENABLED/);
 const source=readFileSync('worker/src/index.ts','utf8');
 assert.match(source,/env\.ACTION_PREVIEW_ENABLED!=='true'/);
 assert.doesNotMatch(source,/\/api\/actions\/confirm/);
 assert.doesNotMatch(source,/\/api\/actions\/execute/);
});
