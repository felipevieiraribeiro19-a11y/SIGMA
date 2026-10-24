import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';
import {readTaskContext,taskReadIntent,taskCompleteIntent,readTaskCompleteProposal} from '../worker/src/core/task-chat-read';
import {readLabTaskCompletion,readLabPendingTasks} from '../src/jarvis-chat-protocol';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const taskId='00000000-0000-4000-8000-000000000001';
function setup(){
 const map=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{transaction:async<T>(f:(tx:any)=>Promise<T>)=>
  f({get:async(k:string)=>map.get(k),put:async(k:string,v:unknown)=>{map.set(k,v)}})}} as any);
 const env={
  ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-61328',
  GEMINI_API_KEY:'fake',GEMINI_MODEL:'fake',LAB_CHAT_ENABLED:'true',
  LAB_BRAIN_ENABLED:'true',LAB_WORKSPACE_ENABLED:'true',
  LAB_WORKSPACE:{idFromName:(uid:string)=>uid,get:(uid:string)=>{
   assert.equal(uid,'owner');
   return {fetch:(request:Request|string,init?:RequestInit)=>
    store.fetch(typeof request==='string'?new Request(request,init):request)};
  }},
  LAB_QUOTA:{idFromName:(uid:string)=>uid,get:()=>({fetch:async()=>new Response(null,{status:204})})}
 } as any;
 const request=(path:string,method:string,body?:unknown)=>new Request(
  'https://lab.fake/api/lab/'+path,{method,
   headers:{Origin:origin,Authorization:'Bearer example','Content-Type':'application/json'},
   ...(method==='GET'?{}:{body:JSON.stringify(body)})});
 const owner=makeLabChatWorker({verify:async()=> 'owner'});
 return {map,store,env,request,owner};
}
const model=(call:unknown)=>{
 let input:any=null;
 const worker=makeLabChatWorker({verify:async()=> 'owner',
  fetch:(async(_url:string,init:RequestInit)=>{
   input=JSON.parse(String(init.body));
   return Response.json({candidates:[{content:{parts:
    call?[{functionCall:call}]:[{text:'Você tem uma tarefa pendente.'}]
   }}]});
  }) as typeof fetch});
 return {worker,input:()=>input};
};
const task={kind:'task',title:'Revisar meu planejamento',notes:'',done:false,minutes:0,
 amount:0,priority:'normal',dueDate:'2026-10-24'};
test('identifica consulta e conclusão, mas não pedidos negados',()=>{
 assert.equal(taskReadIntent('Quais tarefas tenho para amanhã?'),true);
 assert.equal(taskReadIntent('Liste minhas tarefas pendentes'),true);
 assert.equal(taskReadIntent('O que acha de estudar?'),false);
 assert.equal(taskCompleteIntent('Sigma, concluí a revisão do planejamento'),true);
 assert.equal(taskCompleteIntent('Não concluí a revisão do planejamento'),false);
 assert.equal(taskCompleteIntent('Como concluir tarefas?'),false);
});
test('resumo de tarefas nunca compartilha notas, dinheiro ou texto de estudo',()=>{
 const raw={entries:[{...task,id:taskId,updatedAt:'2026-10-23T20:00:00.000Z',
  notes:'SEGREDO PRIVADO',amount:9999}]};
 const ctx=readTaskContext(raw,{projects:[{id:'10000000-0000-4000-8000-000000000001',title:'Teste SIGMA'}]});
 assert.equal(ctx.receipt.shared,1);
 assert.match(ctx.prompt,/Revisar meu planejamento/);
 assert.doesNotMatch(ctx.prompt,/SEGREDO PRIVADO|9999/);
 assert.equal(readLabPendingTasks(raw).length,1);
 assert.equal(readLabPendingTasks({entries:[{...raw.entries[0],done:true}]}).length,0);
});
test('consulta tarefas do usuário autenticado antes do Gemini, sem mutação',async()=>{
 const f=setup();
 const created=await f.owner.fetch(f.request('workspace','POST',task),f.env);
 assert.equal(created.status,201);
 const {worker,input}=model(null);
 const reply=await worker.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'Quais tarefas tenho para amanhã?'}]
 }),f.env);
 assert.equal(reply.status,200);
 const result=await reply.json() as any;
 assert.equal(result.persisted,false);
 assert.equal(result.tasks.consulted,true);
 assert.equal(result.tasks.shared,1);
 assert.match(JSON.stringify(input()),/Revisar meu planejamento/);
 assert.doesNotMatch(JSON.stringify(input()),/"notes":"|SEGREDO PRIVADO/);
 const list=await f.owner.fetch(f.request('workspace','GET'),f.env);
 assert.equal((await list.json() as any).totals.tasksOpen,1);
});
test('proposta de conclusão exige pedido explícito e não grava',async()=>{
 const f=setup();
 const saved=await f.owner.fetch(f.request('workspace','POST',task),f.env);
 assert.equal(saved.status,201);
 const {worker,input}=model({name:'propose_complete_task',args:{titleHint:'Revisar meu planejamento'}});
 const reply=await worker.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'Sigma, concluí a revisão do planejamento'}]
 }),f.env);
 assert.equal(reply.status,200);
 const data=await reply.json() as any;
 assert.equal(data.taskCompletion.kind,'task.complete');
 assert.equal(data.taskCompletion.requiresApproval,true);
 assert.equal(readLabTaskCompletion(data)?.titleHint,'Revisar meu planejamento');
 assert.ok(input().tools[0].functionDeclarations.some((x:any)=>x.name==='propose_complete_task'));
 const check=await f.owner.fetch(f.request('workspace','GET'),f.env);
 assert.equal((await check.json() as any).totals.tasksOpen,1);
});
test('bloqueia tool completion quando usuário não pediu conclusão',async()=>{
 const f=setup();
 const {worker}=model({name:'propose_complete_task',args:{titleHint:'Revisar meu planejamento'}});
 const result=await worker.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'O que devo estudar hoje?'}]
 }),f.env);
 assert.equal(result.status,502);
});
test('conclusão é atômica, por ID existente, com revisão e apenas uma vez',async()=>{
 const f=setup();
 const saved=await f.owner.fetch(f.request('workspace','POST',task),f.env);
 const entry=(await saved.json() as any).entry;
 const path='workspace/'+entry.id+'/complete';
 const noRevision=await f.owner.fetch(f.request(path,'PATCH',{}),f.env);
 assert.equal(noRevision.status,400);
 const stale=await f.owner.fetch(f.request(path,'PATCH',{expectedUpdatedAt:'2000-01-01T00:00:00.000Z'}),f.env);
 assert.equal(stale.status,409);
 const success=await f.owner.fetch(f.request(path,'PATCH',{expectedUpdatedAt:entry.updatedAt}),f.env);
 assert.equal(success.status,200);
 const completed=await success.json() as any;
 assert.equal(completed.completed,true);
 assert.equal(completed.entry.done,true);
 assert.equal(completed.entry.title,task.title);
 assert.equal(completed.entry.dueDate,task.dueDate);
 const duplicate=await f.owner.fetch(f.request(path,'PATCH',{expectedUpdatedAt:entry.updatedAt}),f.env);
 assert.equal(duplicate.status,409);
 const list=await f.owner.fetch(f.request('workspace','GET'),f.env);
 const after=await list.json() as any;
 assert.equal(after.totals.tasksOpen,0);
 assert.equal(after.totals.tasksDone,1);
 assert.equal(after.entries.length,1);
});
test('não conclui registro inexistente, diário ou tarefa de outra conta',async()=>{
 const f=setup();
 const missing=await f.owner.fetch(f.request('workspace/'+taskId+'/complete','PATCH',
  {expectedUpdatedAt:'2026-10-23T00:00:00.000Z'}),f.env);
 assert.equal(missing.status,404);
 const daily=await f.owner.fetch(f.request('workspace','POST',{kind:'daily',title:'Meu diário'}),f.env);
 const d=(await daily.json() as any).entry;
 assert.equal((await f.owner.fetch(f.request('workspace/'+d.id+'/complete','PATCH',
  {expectedUpdatedAt:d.updatedAt}),f.env)).status,409);
 const other=makeLabChatWorker({verify:async()=> 'intruder'});
 assert.equal((await other.fetch(f.request('workspace/'+d.id+'/complete','PATCH',
  {expectedUpdatedAt:d.updatedAt}),f.env)).status,403);
});
test('valida chamada de ferramenta e parser cliente',()=>{
 assert.throws(()=>readTaskCompleteProposal({name:'propose_complete_task',args:{titleHint:'ok',id:taskId}}));
 assert.throws(()=>readTaskCompleteProposal({name:'propose_complete_task',args:{titleHint:'x'}}));
 assert.equal(readLabTaskCompletion({taskCompletion:{kind:'task.complete',source:'gemini',
  requiresApproval:false,titleHint:'Revisar meu planejamento'}}),null);
});

test('consulta vinculada usa nome do projeto real, sem compartilhar notas privadas',async()=>{
 const f=setup();
 const created=await f.owner.fetch(f.request('workspace/projects','POST',{
  title:'Teste SIGMA',goal:'Organizar tarefas',notes:'OBSERVAÇÃO PRIVADA DO PROJETO'
 }),f.env);
 assert.equal(created.status,201);
 const project=(await created.json() as any).project;
 const saved=await f.owner.fetch(f.request('workspace','POST',{...task,projectId:project.id}),f.env);
 assert.equal(saved.status,201);
 const {worker,input}=model(null);
 const result=await worker.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'Quais tarefas pendentes no projeto Teste SIGMA?'}]
 }),f.env);
 assert.equal(result.status,200);
 const context=JSON.stringify(input());
 assert.match(context,/Teste SIGMA/);
 assert.match(context,/Revisar meu planejamento/);
 assert.doesNotMatch(context,/OBSERVAÇÃO PRIVADA DO PROJETO/);
});
