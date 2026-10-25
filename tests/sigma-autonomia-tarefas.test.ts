import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const uid='owner-test';
function fixture(){
 const data=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{
  transaction:async<T>(fn:(tx:any)=>Promise<T>)=>fn({
   get:async(key:string)=>data.get(key),
   put:async(key:string,val:unknown)=>{data.set(key,val);}
  })
 }} as any);
 const hits={gemini:0,web:0};
 let toolResult:unknown={
  name:'propose_task',args:{title:'Pesquisar sobre vinhos',priority:'normal',
   notes:'',dueDate:'',projectTitleHint:''}
 };
 const external=(async(url:string,init:RequestInit)=>{
  if(url.includes('api.tavily.com')){hits.web++;return Response.json({results:[]});}
  hits.gemini++;
  return Response.json({candidates:[{content:{parts:[{functionCall:toolResult}]}}]});
 }) as typeof fetch;
 const env={
  ALLOWED_UID:uid,ALLOWED_ORIGIN:origin,FIREBASE_PROJECT_ID:'sigma-61328',
  LAB_CHAT_ENABLED:'true',LAB_WEB_ENABLED:'true',TAVILY_API_KEY:'fake-key',
  GEMINI_API_KEY:'fake-gemini',GEMINI_MODEL:'fake',
  LAB_BRAIN_ENABLED:'true',LAB_WORKSPACE_ENABLED:'true',
  LAB_WORKSPACE:{idFromName:(id:string)=>id,get:(id:string)=>{
   assert.equal(id,uid);return{fetch:(r:Request|string,o?:RequestInit)=>
    store.fetch(typeof r==='string'?new Request(r,o):r)};
  }},
  LAB_QUOTA:{idFromName:(id:string)=>id,get:()=>({fetch:async()=>new Response(null,{status:204})})}
 } as any;
 const request=(message:string)=>new Request('https://worker.invalid/api/lab/chat',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer fake','Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',text:message}]})
 });
 return {data,hits,env,request,store,model:makeLabChatWorker({verify:async()=>uid,fetch:external}),
  owner:makeLabChatWorker({verify:async()=>uid}),
  setModelResult:(x:unknown)=>{toolResult=x;}};
}

test('comando de voz para pesquisar vinhos cria tarefa sem pesquisar nem pedir cliques',async()=>{
 const f=fixture(),request=f.request('Sigma, coloca uma tarefa pra mim pesquisar sobre vinhos.');
 const r=await f.model.fetch(request,f.env);
 assert.equal(r.status,200);
 const body=await r.json() as any;
 assert.equal(body.savedTask.title,'Pesquisar sobre vinhos');
 assert.equal(body.savedTask.created,true);
 assert.equal(body.taskProposal,undefined);
 assert.match(body.text,/Tarefa criada/);
 assert.equal(body.persisted,false); // histórico do chat continua privado/não persistido
 assert.equal(f.hits.web,0);
 assert.equal(f.hits.gemini,1);
 const tasks=f.data.get('entries') as any[];
 assert.equal(tasks.length,1);
 assert.equal(tasks[0].done,false);
 assert.equal(tasks[0].projectId,undefined);
});

test('repetição do comando não duplica tarefa; respostas de reenvio são verificadas',async()=>{
 const f=fixture();
 const message='Crie uma tarefa para pesquisar sobre vinhos.';
 const first=await f.model.fetch(f.request(message),f.env);
 const second=await f.model.fetch(f.request(message),f.env);
 assert.equal((await first.json() as any).savedTask.created,true);
 assert.equal((await second.json() as any).savedTask.created,false);
 assert.equal((f.data.get('entries') as any[]).length,1);
 assert.equal(f.hits.web,0);
});

test('tarefa com projeto explícito é vinculada diretamente ao projeto exato existente',async()=>{
 const f=fixture();
 const created=await f.owner.fetch(new Request('https://worker.invalid/api/lab/workspace/projects',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer fake','Content-Type':'application/json'},
  body:JSON.stringify({title:'Teste SIGMA',goal:'Organizar tarefas'})
 }),f.env);
 assert.equal(created.status,201);
 const project=(await created.json() as any).project;
 f.setModelResult({name:'propose_task',args:{title:'Revisar meu planejamento',notes:'',
  dueDate:'',priority:'normal',projectTitleHint:'Teste SIGMA'}});
 const r=await f.model.fetch(f.request('Sigma, coloca no meu projeto Teste SIGMA uma tarefa para revisar meu planejamento.'),f.env);
 assert.equal(r.status,200);
 const reply=await r.json() as any;
 assert.equal(reply.savedTask.projectId,project.id);
 assert.equal((f.data.get('entries') as any[])[0].projectId,project.id);
});

test('projeto não encontrado não deve causar gravação no projeto errado',async()=>{
 const f=fixture();
 f.setModelResult({name:'propose_task',args:{title:'Revisar planejamento',notes:'',
  dueDate:'',priority:'normal',projectTitleHint:'Projeto inexistente'}});
 const r=await f.model.fetch(f.request('Crie uma tarefa para revisar planejamento no projeto Inexistente.'),f.env);
 assert.equal(r.status,200);
 const result=await r.json() as any;
 assert.equal(result.savedTask,undefined);
 assert.equal(result.taskProposal.requiresApproval,true);
 assert.equal(f.data.has('entries'),false);
});

test('Gemini não pode criar tarefas por sugestões, comentários ou texto de contexto',async()=>{
 const f=fixture();
 const r=await f.model.fetch(f.request('O que você acha da ideia de criar uma tarefa?'),f.env);
 assert.equal(r.status,502);
 assert.equal(f.data.has('entries'),false);
});

test('endpoint automático não aceita outros tipos de registro ou alterações financeiras',async()=>{
 const f=fixture();
 const hash='a'.repeat(64);
 const post=(task:unknown)=>f.store.fetch(new Request('https://lab-workspace.internal/entries/auto-create',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({task,fingerprint:hash})
 }));
 assert.equal((await post({kind:'finance',title:'Transferir dinheiro',amount:100})).status,400);
 assert.equal((await post({kind:'task',title:'Teste',amount:50})).status,400);
 assert.equal(f.data.has('entries'),false);
});
