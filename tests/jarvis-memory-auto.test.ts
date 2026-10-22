import test from 'node:test';
import assert from 'node:assert/strict';
import {relevantLabMemory,keyTerms} from '../worker/src/core/lab-memory-relevance';
import {autoMemoryRequested,selectedMemoryIds} from '../worker/src/core/lab-memory-chat';
import {approvedChatRequest} from '../src/lab-chat-memory-selection';
import {LabMemoryStore} from '../worker/src/lab-memory';
import {makeLabChatWorker} from '../worker/src/chat-lab';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const id='00000000-0000-4000-8000-000000000001';
const note=(text:string,idx=1)=>({
 id:'00000000-0000-4000-8000-'+String(idx).padStart(12,'0'),
 text,createdAt:'2026-10-22T00:00:00Z',updatedAt:'2026-10-22T00:00:00Z'
});
test('ranking é genérico e entende notas de projeto ou cor, sem regras por assunto',()=>{
 const notes=[
  note('Meu projeto de teste se chama Projeto Alfa e minha cor favorita é azul.'),
  note('A agenda fictícia do laboratório tem reunião com a turma de robótica.',2),
  note('O modelo de teste de carro é azul.',3)
 ];
 assert.deepEqual(relevantLabMemory(notes,'Qual é a minha cor favorita?').map(x=>x.id),[notes[0].id]);
 assert.equal(relevantLabMemory(notes,'Qual era o nome do meu projeto?')[0].id,notes[0].id);
 assert.deepEqual(relevantLabMemory(notes,'Bom dia, tudo bem?'),[]);
 assert.deepEqual(relevantLabMemory(notes,'Lembra de mim?'),[]);
 assert.deepEqual(relevantLabMemory(notes,'Qual é minha cor?'),[]);
 assert.deepEqual(keyTerms('você lembra do projeto?'),['projeto']);
});
test('busca não compartilha qualquer nota em conversa sem termos correspondentes',()=>{
 assert.deepEqual(relevantLabMemory([note('Registro fictício de teste 123')],'Olá, Sigma!'),[]);
});
test('limite genérico de três notas, sem alterar ou salvar a base',()=>{
 const notes=Array.from({length:10},(_,i)=>note('Projeto fictício '+i+' foi anotado para teste.',i+1));
 assert.equal(relevantLabMemory(notes,'Conte os projetos que registrei.').length,3);
 assert.equal(notes.length,10);
});
test('memória automática precisa de consentimento literal e não combina com manual',()=>{
 const msgs=[{role:'user' as const,text:'Qual era meu projeto?'}];
 assert.deepEqual(approvedChatRequest(msgs,[],true),{messages:msgs,memoryMode:'relevant'});
 assert.deepEqual(approvedChatRequest(msgs,[]),{messages:msgs});
 assert.throws(()=>approvedChatRequest(msgs,[id],true));
 assert.equal(autoMemoryRequested({messages:msgs,memoryMode:'relevant'}),true);
 assert.equal(autoMemoryRequested({messages:msgs}),false);
 for(const data of [
  {messages:msgs,memoryMode:'disabled'},
  {messages:msgs,memoryMode:true},
  {messages:msgs,memoryMode:'relevant',memoryIds:[id]},
  {messages:msgs,memoryMode:'relevant',other:'bad'}
 ])assert.throws(()=>{selectedMemoryIds(data);autoMemoryRequested(data);});
});

function fixture(){
 const data=new Map<string,unknown>();
 const store=new LabMemoryStore({storage:{transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({
  get:async(k:string)=>data.get(k),
  put:async(k:string,v:unknown)=>{data.set(k,v)}
 })}} as any);
 let read=0;
 const env={
  ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner-test',FIREBASE_PROJECT_ID:'sigma-61328',
  LAB_CHAT_ENABLED:'true',LAB_WEB_ENABLED:'false',
  LAB_MEMORY_ENABLED:'true',LAB_MEMORY_AUTO_ENABLED:'true',
  GEMINI_MODEL:'fake-model',GEMINI_API_KEY:'fake-gemini',
  LAB_QUOTA:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})},
  LAB_MEMORY:{idFromName:(x:string)=>x,get:()=>({fetch:(req:Request|string)=>{read++;return store.fetch(typeof req==='string'?new Request(req):req)}})}
 } as any;
 return {store,env,reads:()=>read};
}
async function save(store:LabMemoryStore,text:string){
 const r=await store.fetch(new Request('https://lab-memory.internal/entries',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})
 }));
 assert.equal(r.status,201);
 return (await r.json()).entry.id as string;
}
const req=(question:string,rest:Record<string,unknown>={},site=origin)=>
 new Request('https://lab.test/api/lab/chat',{method:'POST',
  headers:{Origin:site,Authorization:'Bearer fake','Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',text:question}],...rest})});
test('sem autorização, chat não lê a memória; com autorização, seleciona só as relevantes',async()=>{
 const {store,env,reads}=fixture();
 await save(store,'Meu projeto de teste se chama Projeto Alfa e minha cor favorita é azul.');
 await save(store,'Na reunião fictícia de domingo tratamos de bicicletas.');
 let prompt:unknown=null;
 const mockFetch=(async (url:string,init:RequestInit)=>{
  assert.match(url,/generativelanguage.googleapis.com/);
  prompt=JSON.parse(String(init.body));
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Resposta de demonstração'}]}}]}),{status:200});
 }) as typeof fetch;
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:mockFetch});
 const without=await worker.fetch(req('Qual era meu projeto de teste?'),env);
 assert.equal(without.status,200);assert.equal(reads(),0);
 assert.doesNotMatch(JSON.stringify(prompt),/Projeto Alfa/);
 const withMemory=await worker.fetch(req('Qual era meu projeto de teste?',{memoryMode:'relevant'}),env);
 assert.equal(withMemory.status,200);assert.equal(reads(),1);
 assert.match(JSON.stringify(prompt),/Projeto Alfa/);
 assert.doesNotMatch(JSON.stringify(prompt),/bicicletas/);
 assert.deepEqual((await withMemory.json()).memory,{consulted:true,count:1,mode:'auto'});
});
test('sem correspondência, Gemini não recebe memórias e responde com recibo vazio',async()=>{
 const {store,env}=fixture();
 await save(store,'Projeto Alfa foi salvo como teste.');
 let prompt:unknown;
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:async (_url:string,init:RequestInit)=>{
  prompt=JSON.parse(String(init.body));
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Não tenho essa informação'}]}}]}),{status:200});
 }});
 const response=await worker.fetch(req('Bom dia! Tudo bem?',{memoryMode:'relevant'}),env);
 assert.equal(response.status,200);
 assert.doesNotMatch(JSON.stringify(prompt),/Projeto Alfa/);
 assert.deepEqual((await response.json()).memory,{consulted:false,count:0,mode:'auto'});
});
test('a configuração do servidor barra busca automática e acessos de outro usuário',async()=>{
 const {store,env,reads}=fixture();
 await save(store,'Projeto Alfa de teste.');
 let external=0;
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:async()=>{external++;return new Response()}});
 assert.equal((await worker.fetch(req('Meu projeto?',{memoryMode:'relevant'}),{...env,LAB_MEMORY_AUTO_ENABLED:'false'})).status,503);
 assert.equal((await worker.fetch(req('Meu projeto?',{memoryMode:'relevant'},'https://sigma-61328.web.app'),env)).status,403);
 const intruder=makeLabChatWorker({verify:async()=> 'intruder',fetch:async()=>{external++;return new Response()}});
 assert.equal((await intruder.fetch(req('Meu projeto?',{memoryMode:'relevant'}),env)).status,403);
 assert.equal(reads(),0);assert.equal(external,0);
});
