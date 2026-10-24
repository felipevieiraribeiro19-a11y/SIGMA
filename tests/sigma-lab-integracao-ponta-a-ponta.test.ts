/** Cross-PR regression: Gemini chat -> project proposal -> explicit write -> linked task -> read-only context. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
function setup(){
 const state=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{transaction:async<T>(cb:(tx:any)=>Promise<T>)=>
  cb({get:async(k:string)=>state.get(k),put:async(k:string,value:unknown)=>{state.set(k,value)}})}} as any);
 const env={
  FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'owner',ALLOWED_ORIGIN:origin,
  LAB_CHAT_ENABLED:'true',LAB_WORKSPACE_ENABLED:'true',LAB_BRAIN_ENABLED:'true',
  GEMINI_API_KEY:'fake-key-no-secret',GEMINI_MODEL:'gemini-mock',
  LAB_QUOTA:{idFromName:(uid:string)=>uid,get:()=>({fetch:async()=>new Response(null,{status:204})})},
  LAB_WORKSPACE:{idFromName:(uid:string)=>uid,get:(uid:string)=>{
   assert.equal(uid,'owner');
   return {fetch:(r:Request|string,init?:RequestInit)=>
    store.fetch(typeof r==='string'?new Request(r,init):r)};
  }}
 } as any;
 const request=(route:string,method='GET',body?:unknown)=>new Request(
  'https://lab.fake/api/lab/'+route,{
   method,headers:{Origin:origin,Authorization:'Bearer fake',
    ...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
 return {state,store,env,request};
}
test('integração cumulativa: Gemini só propõe; usuário confirma; tarefa fica vinculada; depois SIGMA retoma',async()=>{
 const {state,env,request}=setup();
 let round=0;
 const ai=(async(_url:string,init:RequestInit)=>{
  const payload=JSON.parse(String(init.body));
  assert.equal(payload.tools[0].functionDeclarations[0].name,'propose_project');
  if(round++===0){
   assert.doesNotMatch(JSON.stringify(payload),/PROJETOS: \[/);
   return Response.json({candidates:[{content:{parts:[{functionCall:{
    name:'propose_project',args:{title:'Vendas de veículos',
     goal:'Organizar contatos, negociações e retornos',notes:'Começar sem clientes reais'}
   }}]}}]});
  }
  const context=JSON.stringify(payload);
  assert.match(context,/Vendas de veículos/);
  assert.match(context,/Organizar contatos, negociações e retornos/);
  assert.doesNotMatch(context,/Telefone do cliente privado|Comissão particular/);
  return Response.json({candidates:[{content:{parts:[{text:'Podemos retomar Vendas de veículos.'}]}}]});
 }) as typeof fetch;
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:ai});
 const messages=(text:string,useProjects=false)=>({messages:[{role:'user',text}],...(useProjects?{useProjects:true}:{})});
 const draft=await worker.fetch(request('chat','POST',messages('Crie um projeto para minhas vendas')),env);
 assert.equal(draft.status,200);
 const proposal=(await draft.json() as any).projectProposal;
 assert.equal(proposal.requiresApproval,true);
 assert.equal(state.has('projects'),false,'a resposta da IA não pode alterar o DO');
 assert.equal(proposal.title,'Vendas de veículos');
 // A confirmation in the UI is a separate, authenticated POST; AI cannot call this.
 const confirmation=await worker.fetch(request('workspace/projects','POST',{
  title:proposal.title,goal:proposal.goal,notes:proposal.notes
 }),env);
 assert.equal(confirmation.status,201);
 const project=(await confirmation.json() as any).project;
 assert.match(project.id,/^[0-9a-f-]{36}$/);
 const added=await worker.fetch(request('workspace','POST',{
  kind:'task',title:'Retornar ao cliente de teste',
  notes:'Telefone do cliente privado',projectId:project.id
 }),env);
 assert.equal(added.status,201);
 const all=(await worker.fetch(request('workspace/projects'),env).then(r=>r.json()) as any).projects;
 assert.equal(all.length,1);
 assert.equal(all[0].tasksOpen,1);
 const context=await worker.fetch(request('chat','POST',messages('Qual meu projeto de vendas?',true)),env);
 assert.equal(context.status,200);
 const answer=await context.json() as any;
 assert.equal(answer.text,'Podemos retomar Vendas de veículos.');
 assert.deepEqual(answer.projects,{consulted:true,shared:1,available:1,truncated:false});
 assert.equal(answer.persisted,false);
 assert.equal(answer.executed,false);
 const entries=(await worker.fetch(request('workspace'),env).then(r=>r.json()) as any).entries;
 assert.equal(entries.length,1,'a consulta do Gemini não duplica tarefas');
});
test('integração cumulativa: desativar cérebro impede propostas e consultas, sem mudar registros',async()=>{
 const {state,env,request}=setup();
 let external=0;
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:(async()=>{
  external++;return Response.json({candidates:[{content:{parts:[{text:'Respondo sem ferramentas.'}]}}]});
 }) as typeof fetch});
 const messages={messages:[{role:'user',text:'Quais projetos existem?'}],useProjects:true};
 const result=await worker.fetch(request('chat','POST',messages),{...env,LAB_BRAIN_ENABLED:'false'});
 assert.equal(result.status,503);
 assert.equal(external,0);
 assert.equal(state.size,0);
});
