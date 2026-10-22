import test from 'node:test';
import assert from 'node:assert/strict';
import {LabMemoryStore} from '../worker/src/lab-memory';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {approvedChatRequest,readMemoryChoices} from '../src/lab-chat-memory-selection';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
function fixture(){
 const values=new Map<string,unknown>();
 const memory=new LabMemoryStore({storage:{
  transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({
   get:async(k:string)=>values.get(k),
   put:async(k:string,v:unknown)=>{values.set(k,v)}
  })
 }} as any);
 let memoryCalls=0;
 const env={
  FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'owner-demo',
  ALLOWED_ORIGIN:origin,LAB_CHAT_ENABLED:'true',LAB_WEB_ENABLED:'true',
  LAB_MEMORY_ENABLED:'true',GEMINI_API_KEY:'gemini-demo-key',
  GEMINI_MODEL:'mock-model',TAVILY_API_KEY:'tavily-demo-key',
  LAB_QUOTA:{idFromName:(id:string)=>id,get:()=>({fetch:async()=>new Response(null,{status:204})})},
  LAB_MEMORY:{idFromName:(id:string)=>id,get:()=>({fetch:(request:Request|string)=>{memoryCalls++;return memory.fetch(typeof request==='string'?new Request(request):request)}})}
 } as any;
 return {memory,env,memoryCalls:()=>memoryCalls};
}
async function save(memory:LabMemoryStore,text:string):Promise<string>{
 const response=await memory.fetch(new Request('https://lab-memory.internal/entries',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})
 }));
 assert.equal(response.status,201);
 return (await response.json()).entry.id as string;
}
function req(body:unknown,site=origin){
 return new Request('https://fake.example/api/lab/chat',{method:'POST',
  headers:{Origin:site,Authorization:'Bearer fake','Content-Type':'application/json'},
  body:JSON.stringify(body)});
}
function transport(log:{model:number;web:number;request?:any;query?:string}){
 return (async (url:string,options:RequestInit)=>{
  if(url.includes('api.tavily.com')){
   log.web++;
   log.query=JSON.parse(String(options.body)).query as string;
   return new Response(JSON.stringify({results:[
    {title:'Notícia simulada',url:'https://example.org/news',content:'Informação atual fictícia'}
   ]}),{status:200});
  }
  log.model++;
  log.request=JSON.parse(String(options.body));
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Olá. Li apenas o contexto autorizado.'}]}}]}),{status:200});
 }) as typeof fetch;
}
test('sem seleção, nenhuma memória é buscada ou transmitida ao Gemini',async()=>{
 const {memory,env,memoryCalls}=fixture();
 await save(memory,'Cor favorita simulada: azul');
 const log={model:0,web:0,request:undefined as any};
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:transport(log)});
 const response=await worker.fetch(req({messages:[{role:'user',text:'Qual é a minha cor preferida?'}]}),env);
 assert.equal(response.status,200);assert.equal(memoryCalls(),0);
 assert.equal(log.model,1);assert.equal(log.web,0);
 assert.doesNotMatch(JSON.stringify(log.request),/Cor favorita simulada|azul/);
});
test('duas memórias escolhidas são obtidas do servidor e só elas entram no Gemini',async()=>{
 const {memory,env,memoryCalls}=fixture();
 const a=await save(memory,'Meu projeto fictício chama-se Projeto Alfa.');
 const b=await save(memory,'Minha cor favorita fictícia é azul.');
 await save(memory,'Nota confidencial do laboratório que NÃO escolhi.');
 const log={model:0,web:0,request:undefined as any};
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:transport(log)});
 const reply=await worker.fetch(req({messages:[{role:'user',text:'Qual meu projeto de exemplo?'}],memoryIds:[a,b]}),env);
 assert.equal(reply.status,200);assert.equal(memoryCalls(),1);
 assert.equal(log.model,1);
 const context=log.request.contents[0].parts.map((p:{text:string})=>p.text).join('\n');
 assert.match(context,/Projeto Alfa/);
 assert.match(context,/azul/);
 assert.doesNotMatch(context,/NÃO escolhi/);
 assert.match(context,/Memórias escolhidas|MEMÓRIAS ESCOLHIDAS/);
 const responseBody=await reply.json();
 assert.deepEqual(responseBody.memory,{consulted:true,count:2});
 assert.doesNotMatch(JSON.stringify(responseBody),/Projeto Alfa|Minha cor favorita/);
 assert.equal((await memory.fetch(new Request('https://lab-memory.internal/entries'))).status,200);
});
test('seleção não existe, foi excluída ou memória desativada: negar sem chamada ao Gemini',async()=>{
 const {memory,env}=fixture();
 const id=await save(memory,'Memória fictícia que será apagada');
 const deleted=await memory.fetch(new Request('https://lab-memory.internal/entries/'+id,{method:'DELETE'}));
 assert.equal(deleted.status,200);
 const log={model:0,web:0};
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:transport(log)});
 const missing=await worker.fetch(req({messages:[{role:'user',text:'Lembre da nota.'}],memoryIds:[id]}),env);
 assert.equal(missing.status,409);assert.equal(log.model,0);
 const off=await worker.fetch(req({messages:[{role:'user',text:'Lembre da nota.'}],memoryIds:[id]}),{...env,LAB_MEMORY_ENABLED:'false'});
 assert.equal(off.status,503);assert.equal(log.model,0);
});
test('IDs inválidos, repetidos, muitos ou texto injetado como metadado são bloqueados',async()=>{
 const {env,memoryCalls}=fixture();
 const uid='00000000-0000-4000-8000-000000000001';
 const log={model:0,web:0};
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:transport(log)});
 const messages=[{role:'user',text:'Explique um exemplo.'}];
 for(const body of [
  {messages,memoryIds:['foo']},
  {messages,memoryIds:[uid,uid]},
  {messages,memoryIds:[uid,uid.replace('1','2'),uid.replace('1','3'),uid.replace('1','4')]},
  {messages,memoryIds:[]},
  {messages,memoryIds:[uid],memoryText:'TEXTO INJETADO'}
 ]){
  const reply=await worker.fetch(req(body),env);
  assert.equal(reply.status,400);
 }
 assert.equal(log.model,0);assert.equal(memoryCalls(),0);
});
test('origem e UID errados não permitem consultar memórias selecionadas',async()=>{
 const {memory,env,memoryCalls}=fixture();
 const id=await save(memory,'Exemplo restrito ao usuário');
 const body={messages:[{role:'user',text:'O que foi salvo?'}],memoryIds:[id]};
 const otherOrigin=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:transport({model:0,web:0})});
 assert.equal((await otherOrigin.fetch(req(body,'https://sigma-61328.web.app'),env)).status,403);
 const otherUid=makeLabChatWorker({verify:async()=> 'another-uid',fetch:transport({model:0,web:0})});
 assert.equal((await otherUid.fetch(req(body),env)).status,403);
 assert.equal(memoryCalls(),0);
});
test('memórias autorizadas não são enviadas como termos ao Tavily',async()=>{
 const {memory,env}=fixture();
 const id=await save(memory,'Código fictício do projeto Alfa: TOKEN-FICTICIO-EXCLUSIVO');
 const log={model:0,web:0,request:undefined as any,query:''};
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:transport(log)});
 const r=await worker.fetch(req({messages:[{role:'user',text:'Pesquise notícias atuais de concursos públicos.'}],memoryIds:[id]}),env);
 assert.equal(r.status,200);assert.equal(log.web,1);
 assert.doesNotMatch(log.query,/TOKEN-FICTICIO-EXCLUSIVO|Alfa/);
 assert.match(JSON.stringify(log.request),/TOKEN-FICTICIO-EXCLUSIVO/);
});
test('navegador envia somente IDs validados; sem consentimento não envia memoryIds',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const messages=[{role:'user' as const,text:'Oi'}];
 assert.deepEqual(approvedChatRequest(messages,[]),{messages});
 assert.deepEqual(approvedChatRequest(messages,[id]),{messages,memoryIds:[id]});
 assert.throws(()=>approvedChatRequest(messages,['javascript:alert(1)']));
 assert.deepEqual(readMemoryChoices({entries:[{id,text:'Nota fictícia'}]}),[{id,text:'Nota fictícia'}]);
 assert.throws(()=>readMemoryChoices({entries:[{id,text:'x'.repeat(501)}]}));
});
