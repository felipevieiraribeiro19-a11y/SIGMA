import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAssistantPlan} from '../worker/src/core/orchestrator';
import {googleContext,googlePrompt} from '../worker/src/google';
import {makeWorker,type Env} from '../worker/src/index';

const connected={searchConfigured:true,googleConnected:true};
const disconnected={searchConfigured:false,googleConnected:false};

test('conversa normal não chama internet nem envia dados do Google à IA',()=>{
 for(const text of ['Oi, tudo bem?','Me ajude a pensar num projeto','Me explique como funciona a memória']){
  const plan=makeAssistantPlan(text,connected);
  assert.equal(plan.mode,'conversation');
  assert.equal(plan.steps.length,0);
  assert.deepEqual(plan.google,{calendar:false,drive:false});
 }
});
test('pedido de agenda usa somente Calendar e pergunta natural também funciona',()=>{
 for(const text of ['Consulte minha agenda amanhã','Quais os meus compromissos?','O que tenho hoje?']){
  const plan=makeAssistantPlan(text,connected);
  assert.equal(plan.mode,'read-tools',text);
  assert.deepEqual(plan.google,{calendar:true,drive:false},text);
 }
});
test('pedido de documentos usa somente Drive',()=>{
 const plan=makeAssistantPlan('Encontre meus PDFs no Google Drive',connected);
 assert.equal(plan.mode,'read-tools');
 assert.deepEqual(plan.google,{calendar:false,drive:true});
});
test('pedido explícito de pesquisa usa Tavily sem expor documentos',()=>{
 const plan=makeAssistantPlan('Pesquise a previsão econômica mais recente na internet',connected);
 assert.equal(plan.steps[0]?.id,'research.web');
 assert.equal(plan.steps[0]?.status,'ready');
 assert.deepEqual(plan.google,{calendar:false,drive:false});
});
test('sem conexão não há execução silenciosa nem invenção de resultados',()=>{
 const plan=makeAssistantPlan('Quais os meus compromissos?',disconnected);
 assert.equal(plan.steps[0]?.status,'unavailable');
 assert.deepEqual(plan.google,{calendar:false,drive:false});
});
test('pedidos de escrita viram apenas intenções, sem consultas ou execução',()=>{
 for(const [prompt,target] of [
  ['Agende uma reunião amanhã','integration.calendar.write'],
  ['Crie um evento no calendário','integration.calendar.write'],
  ['Renomeie uma pasta no Drive','integration.drive.write']
 ] as const){
  const plan=makeAssistantPlan(prompt,connected);
  assert.equal(plan.mode,'action-proposal',prompt);
  assert.equal(plan.proposedAction?.capabilityId,target,prompt);
  assert.deepEqual(plan.google,{calendar:false,drive:false});
  assert.equal(plan.steps.length,0);
 }
});
test('seleção da Agenda não toca no endpoint Drive e não inventa dados do Drive',async()=>{
 const calls:string[]=[];
 const transport=(async(url:string)=>{
  calls.push(url);
  if(!url.includes('/calendar/v3/'))throw new Error('Drive foi consultado sem pedido');
  return Response.json({items:[{summary:'Reunião',start:{dateTime:'2026-10-22T14:00:00-03:00'}}]});
 }) as typeof fetch;
 const g=await googleContext('fake-token',transport,{calendar:true,drive:false});
 assert.equal(calls.length,1);
 assert.match(calls[0],/calendar\/v3/);
 assert.equal(g.agenda.length,1);
 assert.equal(g.materiais.length,0);
 assert.doesNotMatch(googlePrompt(g)||'',/Drive/);
});
test('seleção Drive não toca no Calendar e não afirma que agenda está vazia',async()=>{
 const calls:string[]=[];
 const transport=(async(url:string)=>{
  calls.push(url);
  if(!url.includes('/drive/v3/'))throw new Error('Agenda foi consultada sem pedido');
  return Response.json({files:[{name:'Relatório.pdf',modifiedTime:'2026-10-21T14:00:00Z'}]});
 }) as typeof fetch;
 const g=await googleContext('fake-token',transport,{calendar:false,drive:true});
 assert.equal(calls.length,1);
 assert.match(calls[0],/drive\/v3/);
 assert.equal(g.materiais.length,1);
 assert.doesNotMatch(googlePrompt(g)||'',/Agenda/);
});
test('Worker não consulta Google se usuário disser apenas oi mesmo com token presente',async()=>{
 const origin='https://sigma.example';
 const env={ALLOWED_ORIGINS:origin,ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-test',GEMINI_MODEL:'gemini-test',GEMINI_API_KEY:'test-key',QUOTA:{idFromName:()=> 'owner',get:()=>({fetch:async()=>new Response(null,{status:204})})}} as unknown as Env;
 let count=0;let geminiPrompt='';
 const worker=makeWorker({verify:async()=> 'owner',memory:{recent:async()=>[],save:async()=>{}},fetch:(async(url:string,init?:RequestInit)=>{
  assert.match(String(url),/generativelanguage/);
  count++;
  geminiPrompt=JSON.stringify(JSON.parse(String(init?.body)));
  return Response.json({candidates:[{content:{parts:[{text:'Olá!'}]}}]});
 }) as typeof fetch});
 const req=new Request('https://api.example/api/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer owner','Content-Type':'application/json','X-Turn-Id':'11111111-1111-1111-1111-111111111111','X-Google-Token':'fake-token'},body:JSON.stringify({messages:[{role:'user',text:'Oi, tudo bem?'}]})});
 const response=await worker.fetch(req,env);
 assert.equal(response.status,200);
 assert.equal(count,1);
 assert.doesNotMatch(geminiPrompt,/DADOS DO GOOGLE/);
});
