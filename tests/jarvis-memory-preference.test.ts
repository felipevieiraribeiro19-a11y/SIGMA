import test from 'node:test';
import assert from 'node:assert/strict';
import {LabMemoryStore} from '../worker/src/lab-memory';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {readFileSync} from 'node:fs';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
function fixture(){
 const state=new Map<string,unknown>();
 const store=new LabMemoryStore({storage:{
  transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({
   get:async(k:string)=>state.get(k),
   put:async(k:string,v:unknown)=>{state.set(k,v);}
  })
 }} as any);
 let calls=0;
 const env={
  ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_ORIGIN:origin,
  LAB_CHAT_ENABLED:'true',LAB_MEMORY_ENABLED:'true',LAB_MEMORY_AUTO_ENABLED:'true',
  LAB_WEB_ENABLED:'false',GEMINI_API_KEY:'fake-key',GEMINI_MODEL:'model-test',
  LAB_QUOTA:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})},
  LAB_MEMORY:{idFromName:(x:string)=>x,get:()=>({fetch:(request:Request|string)=>{
   calls++;return store.fetch(typeof request==='string'?new Request(request):request);
  }})}
 } as any;
 return {store,env,calls:()=>calls};
}
const get=(method:string,path:string,body?:unknown,site=origin)=>
 new Request('https://fake-worker.local'+path,{
  method,headers:{Origin:site,Authorization:'Bearer fictional',
   ...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
const chat=(question:string,rest:Record<string,unknown>={})=>
 get('POST','/api/lab/chat',{messages:[{role:'user',text:question}],...rest});
async function add(store:LabMemoryStore,text:string){
 const res=await store.fetch(new Request('https://lab-memory.internal/entries',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})
 }));
 assert.equal(res.status,201);
}
test('preferência inicia desativada, persiste após nova consulta e pode ser revogada',async()=>{
 const {store,env}=fixture();
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID});
 const initial=await worker.fetch(get('GET','/api/lab/memory/settings'),env);
 assert.equal(initial.status,200);
 assert.deepEqual(await initial.json(),{recallEnabled:false});
 const enabled=await worker.fetch(get('PATCH','/api/lab/memory/settings',{recallEnabled:true}),env);
 assert.equal(enabled.status,200);
 assert.deepEqual(await enabled.json(),{recallEnabled:true});
 assert.deepEqual(await (await worker.fetch(get('GET','/api/lab/memory/settings'),env)).json(),{recallEnabled:true});
 assert.deepEqual(await (await store.fetch(new Request('https://lab-memory.internal/settings'))).json(),{recallEnabled:true});
 const disabled=await worker.fetch(get('PATCH','/api/lab/memory/settings',{recallEnabled:false}),env);
 assert.deepEqual(await disabled.json(),{recallEnabled:false});
 assert.deepEqual(await (await worker.fetch(get('GET','/api/lab/memory/settings'),env)).json(),{recallEnabled:false});
});
test('preferência de memória é booleana e rejeita campos inesperados e métodos inválidos',async()=>{
 const {env}=fixture();
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID});
 for(const body of [{recallEnabled:'true'},{recallEnabled:true,uid:'someone'},{memoryMode:'always'},null]){
  const r=await worker.fetch(get('PATCH','/api/lab/memory/settings',body),env);
  assert.equal(r.status,400);
 }
 assert.equal((await worker.fetch(get('DELETE','/api/lab/memory/settings'),env)).status,405);
});
test('apenas a conta Google autorizada acessa e altera a preferência',async()=>{
 const {env,calls}=fixture();
 const worker=makeLabChatWorker({verify:async()=> 'not-owner'});
 assert.equal((await worker.fetch(get('GET','/api/lab/memory/settings'),env)).status,403);
 assert.equal((await worker.fetch(get('PATCH','/api/lab/memory/settings',{recallEnabled:true}),env)).status,403);
 const site=makeLabChatWorker({verify:async()=>env.ALLOWED_UID});
 assert.equal((await site.fetch(get('GET','/api/lab/memory/settings',undefined,'https://sigma-61328.web.app'),env)).status,403);
 assert.equal(calls(),0);
 assert.equal((await site.fetch(get('GET','/api/lab/memory/settings'),{...env,LAB_MEMORY_AUTO_ENABLED:'false'})).status,503);
});
test('com preferência ativa, nenhuma seleção por mensagem é necessária; após desligar, para imediatamente',async()=>{
 const {store,env}=fixture();
 await add(store,'Meu projeto de teste se chama Projeto Alfa e minha cor favorita é azul.');
 let sent:string[]=[];
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,
  fetch:(async (_url:string,init:RequestInit)=>{
   sent.push(String(init.body));
   return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Resposta simulada'}]}}]}),{status:200});
  }) as typeof fetch
 });
 const first=await worker.fetch(chat('Qual é minha cor favorita?'),env);
 assert.equal(first.status,200);
 assert.equal((await first.json()).memory,undefined);
 assert.doesNotMatch(sent.at(-1)||'',/Projeto Alfa/);
 assert.equal((await worker.fetch(get('PATCH','/api/lab/memory/settings',{recallEnabled:true}),env)).status,200);
 const second=await worker.fetch(chat('Qual é minha cor favorita?'),env);
 assert.equal(second.status,200);
 assert.deepEqual((await second.json()).memory,{consulted:true,count:1,mode:'auto'});
 assert.match(sent.at(-1)||'',/Projeto Alfa/);
 assert.equal((await worker.fetch(get('PATCH','/api/lab/memory/settings',{recallEnabled:false}),env)).status,200);
 const third=await worker.fetch(chat('Qual é minha cor favorita?'),env);
 assert.equal(third.status,200);
 assert.equal((await third.json()).memory,undefined);
 assert.doesNotMatch(sent.at(-1)||'',/Projeto Alfa/);
 assert.deepEqual((await store.fetch(new Request('https://lab-memory.internal/entries'))).status,200);
});
test('interface não usa armazenamento local de consentimento; decisão fica no backend',()=>{
 const chatUI=readFileSync('src/JarvisChatPanel.tsx','utf8');
 const store=readFileSync('worker/src/lab-memory.ts','utf8');
 assert.match(chatUI,/api\/lab\/memory\/settings/);
 assert.match(chatUI,/memoryPreferenceReady/);
 assert.doesNotMatch(chatUI,/\blocalStorage\b|\bsessionStorage\b|indexedDB/);
 assert.match(store,/recallEnabled/);
 const production=readFileSync('worker/src/validation.ts','utf8');
 assert.doesNotMatch(production,/recallEnabled/);
});
