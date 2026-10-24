import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';
import {explicitTaskIntent,localTaskDates,readTaskProposal} from '../worker/src/core/task-proposal-tool';
import {readLabTaskProposal} from '../src/jarvis-chat-protocol';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const valid={title:'Pagar a conta de luz',notes:'',dueDate:'2026-10-24',priority:'normal',projectTitleHint:'Teste SIGMA'};
const functionCall={name:'propose_task',args:valid};
function fixture(){
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
 const request=(path:string,method:string,body:unknown)=>new Request(
  'https://lab.fake/api/lab/'+path,{method,
   headers:{Origin:origin,Authorization:'Bearer example','Content-Type':'application/json'},
   body:JSON.stringify(body)});
 return {store,map,env,request};
}
function mockedModel(call:unknown){
 return makeLabChatWorker({verify:async()=> 'owner',fetch:(async(_url:string,init:RequestInit)=>{
  const payload=JSON.parse(String(init.body));
  assert.ok(payload.tools[0].functionDeclarations.some((x:any)=>x.name==='propose_task'));
  assert.ok(payload.tools[0].functionDeclarations.some((x:any)=>x.name==='propose_project'));
  assert.match(JSON.stringify(payload),/America\/Sao_Paulo/);
  return Response.json({candidates:[{content:{parts:[{functionCall:call}]}}]});
 }) as typeof fetch});
}

test('pedido explícito, não conversa ou instrução recuperada, autoriza proposta (não escrita)',()=>{
 assert.equal(explicitTaskIntent('Sigma, adiciona no meu projeto Teste SIGMA uma tarefa para pagar a conta de luz amanhã.'),true);
 assert.equal(explicitTaskIntent('Crie uma tarefa de estudar matemática.'),true);
 assert.equal(explicitTaskIntent('Qual tarefa devo fazer hoje?'),false);
 assert.equal(explicitTaskIntent('Anote isso: fiquei cansado'),false);
});
test('dia relativo respeita calendário de São Paulo',()=>{
 assert.deepEqual(localTaskDates(new Date('2026-10-24T00:30:00Z')),
  {today:'2026-10-23',tomorrow:'2026-10-24'});
});
test('Gemini só retorna proposta; nenhuma tarefa é persistida sem confirmação autenticada separada',async()=>{
 const f=fixture();
 const worker=mockedModel(functionCall);
 const first=await worker.fetch(f.request('chat','POST',{messages:[{
  role:'user',text:'Sigma, adiciona uma tarefa de pagar a conta de luz amanhã no projeto Teste SIGMA.'
 }]}),f.env);
 assert.equal(first.status,200);
 const data=await first.json() as any;
 assert.equal(data.persisted,false);
 assert.equal(data.executed,false);
 assert.equal(data.taskProposal.kind,'task.create');
 assert.equal(data.taskProposal.requiresApproval,true);
 assert.equal(data.projectProposal,undefined);
 assert.equal(f.map.has('entries'),false);
 const owner=makeLabChatWorker({verify:async()=> 'owner'});
 const created=await owner.fetch(f.request('workspace/projects','POST',{
  title:'Teste SIGMA',goal:'Organizar minhas tarefas diárias',notes:'teste'
 }),f.env);
 assert.equal(created.status,201);
 const project=(await created.json() as any).project;
 const invalid=await owner.fetch(f.request('workspace','POST',{
  kind:'task',title:valid.title,priority:'normal',projectId:'e0000000-0000-4000-8000-000000000000'
 }),f.env);
 assert.equal(invalid.status,409);
 const saved=await owner.fetch(f.request('workspace','POST',{
  kind:'task',title:valid.title,notes:'',priority:'normal',
  dueDate:valid.dueDate,projectId:project.id
 }),f.env);
 assert.equal(saved.status,201);
 const dataSaved=await saved.json() as any;
 assert.equal(dataSaved.entry.projectId,project.id);
 assert.equal(dataSaved.entry.dueDate,'2026-10-24');
 const all=await owner.fetch(f.request('workspace','GET',{}),f.env);
 assert.equal((await all.json() as any).totals.tasksOpen,1);
});
test('modelo não pode propor tarefa quando última mensagem não autoriza',async()=>{
 const f=fixture(),worker=mockedModel(functionCall);
 const result=await worker.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'O que você acha de uma lista de tarefas?'}]
 }),f.env);
 assert.equal(result.status,502);
 assert.equal(f.map.has('entries'),false);
});
test('rejeita tentativas de múltiplas ferramentas e ferramenta desconhecida',async()=>{
 const f=fixture();
 const dup=makeLabChatWorker({verify:async()=> 'owner',fetch:(async()=>Response.json({
  candidates:[{content:{parts:[{functionCall},{functionCall}]}}
 ]})) as typeof fetch});
 const first=await dup.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'Crie uma tarefa na lista.'}]
 }),f.env);
 assert.equal(first.status,502);
 const unknown=mockedModel({name:'delete_everything',args:{}});
 const second=await unknown.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'Crie uma tarefa na lista.'}]
 }),f.env);
 assert.equal(second.status,502);
 assert.equal(f.map.has('entries'),false);
});
test('rejeita saída inválida e payload malicioso sem gravação',()=>{
 assert.throws(()=>readTaskProposal({name:'propose_task',args:{...valid,kind:'delete'}}));
 assert.throws(()=>readTaskProposal({name:'propose_task',args:{...valid,dueDate:'2026-02-30'}}));
 assert.throws(()=>readTaskProposal({name:'propose_task',args:{...valid,priority:'execute'}}));
 assert.throws(()=>readTaskProposal({name:'propose_task',args:{...valid,notes:'x'.repeat(1501)}}));
 assert.equal(readTaskProposal(functionCall).kind,'task.create');
});
test('frontend exige resposta de ferramenta válida e autorização separada',()=>{
 const draft=readTaskProposal(functionCall);
 assert.deepEqual(readLabTaskProposal({taskProposal:draft}),draft);
 assert.equal(readLabTaskProposal({taskProposal:{...draft,requiresApproval:false}}),null);
 assert.equal(readLabTaskProposal({taskProposal:{...draft,kind:'external.write'}}),null);
});
test('conta diferente e flags desligadas impedem até gerar proposta',async()=>{
 const f=fixture(),worker=mockedModel(functionCall);
 const query=f.request('chat','POST',{messages:[{role:'user',text:'Crie uma tarefa.'}]});
 assert.equal((await worker.fetch(query,{...f.env,LAB_CHAT_ENABLED:'false'})).status,503);
 const unauthorized=makeLabChatWorker({verify:async()=> 'other'});
 assert.equal((await unauthorized.fetch(f.request('chat','POST',{
  messages:[{role:'user',text:'Crie uma tarefa.'}]
 }),f.env)).status,403);
 assert.equal(f.map.has('entries'),false);
});
