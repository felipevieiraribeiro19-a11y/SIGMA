import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {approvedChatRequest} from '../src/lab-chat-memory-selection';
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const hit={key:'drive:doc-1',source:'drive',title:'Resumo de Contabilidade',
 url:'https://drive.google.com/file/d/doc-1',updatedAt:'2026-10-23T10:00:00Z',
 contentStatus:'indexed',excerpt:'LRF estabelece regras de responsabilidade fiscal.',score:8};
function testEnv(){
 let indexCalls=0,modelPayload:unknown=null;
 const env={
  FIREBASE_PROJECT_ID:'test',ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_CHAT_ENABLED:'true',
  LAB_DOCUMENTS_ENABLED:'true',LAB_MEMORY_ENABLED:'false',LAB_MEMORY_AUTO_ENABLED:'false',
  GEMINI_MODEL:'gemini-test',GEMINI_API_KEY:'test-only',
  LAB_QUOTA:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})},
  LAB_DOCUMENT_INDEX:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>{
   indexCalls++;return Response.json({results:[hit]});
  }})}
 } as any;
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,
  fetch:(async(_url,init)=>{modelPayload=JSON.parse(String(init?.body));
   return Response.json({candidates:[{content:{parts:[{text:'A LRF [D1].'}]}}]});
  }) as typeof fetch
 });
 return {env,worker,metrics:()=>({indexCalls,modelPayload})};
}
const req=(body:unknown)=>new Request('https://lab-worker.invalid/api/lab/chat',{method:'POST',
 headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer mock'},body:JSON.stringify(body)});
test('biblioteca é consultada apenas com marcação explícita, cita fontes e não envia segredos',async()=>{
 const {env,worker,metrics}=testEnv();
 const normal=await worker.fetch(req({messages:[{role:'user',text:'o que é LRF?'}]}),env);
 assert.equal(normal.status,200);assert.equal(metrics().indexCalls,0);
 const annotated=await worker.fetch(req({messages:[{role:'user',text:'o que é LRF?'}],useLibrary:true}),env);
 assert.equal(annotated.status,200);
 const data=await annotated.json();
 assert.equal(data.library.consulted,true);
 assert.equal(data.library.sources.length,1);
 assert.equal(data.library.sources[0].title,'Resumo de Contabilidade');
 assert.equal(metrics().indexCalls,1);
 assert.match(JSON.stringify(metrics().modelPayload),/responsabilidade fiscal/);
 assert.match(JSON.stringify(metrics().modelPayload),/D1/);
 assert.doesNotMatch(JSON.stringify(metrics().modelPayload),/test-only|Bearer mock/);
});
test('biblioteca falha fechada com flag ausente ou payload inválido',async()=>{
 const {env,worker}=testEnv();
 const off=await worker.fetch(req({messages:[{role:'user',text:'LRF?'}],useLibrary:true}),{
  ...env,LAB_DOCUMENTS_ENABLED:'false'
 });
 assert.equal(off.status,503);
 const wrong=await worker.fetch(req({messages:[{role:'user',text:'LRF?'}],useLibrary:'true'}),env);
 assert.equal(wrong.status,400);
});
test('cliente não compartilha biblioteca por omissão e valida seleção',()=>{
 const msg=[{role:'user' as const,text:'Pesquise a lei'}];
 assert.deepEqual(approvedChatRequest(msg,[]),{messages:msg});
 assert.deepEqual(approvedChatRequest(msg,[],false,[],true),{messages:msg,useLibrary:true});
 assert.throws(()=>approvedChatRequest(msg,[],false,[],'true' as any));
});
