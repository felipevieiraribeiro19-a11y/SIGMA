import test from 'node:test';
import assert from 'node:assert/strict';
import {readProjectProposal,projectPreviewText,PROJECT_TOOL_DECLARATION} from '../worker/src/core/project-proposal-tool';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';
import {readLabProjectProposal} from '../src/jarvis-chat-protocol';
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const call={name:'propose_project',args:{
 title:'Meu negócio',goal:'Organizar vendas e tarefas da empresa',notes:'Planejamento inicial'
}};
const state=new Map<string,unknown>();
function envFixture(){
 const store=new LabWorkspaceStore({storage:{transaction:async<T>(cb:(tx:any)=>Promise<T>)=>
  cb({get:async(k:string)=>state.get(k),put:async(k:string,v:unknown)=>{state.set(k,v)}})}} as any);
 const env={
  FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'owner',
  ALLOWED_ORIGIN:origin,LAB_CHAT_ENABLED:'true',LAB_WORKSPACE_ENABLED:'true',
  LAB_BRAIN_ENABLED:'true',GEMINI_API_KEY:'mock-only',GEMINI_MODEL:'gemini-fake',
  LAB_WORKSPACE:{idFromName:(uid:string)=>uid,get:()=>({
   fetch:(input:Request|string,init?:RequestInit)=>store.fetch(
    typeof input==='string'?new Request(input,init):input)
  })},
  LAB_QUOTA:{idFromName:(uid:string)=>uid,get:()=>({fetch:async()=>new Response(null,{status:204})})}
 } as any;
 const request=(text='Crie um projeto para organizar minhas vendas')=>new Request('https://lab-worker.invalid/api/lab/chat',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer fake', 'Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',text}]})
 });
 return {env,store,request};
}
test('Gemini propõe apenas ferramenta permitida; não é uma ação executável',()=>{
 const p=readProjectProposal([{functionCall:call}]);
 assert.equal(p?.kind,'project.create');
 assert.equal(p?.requiresApproval,true);
 assert.equal(p?.title,'Meu negócio');
 assert.match(projectPreviewText(p!),/Nada foi criado ou salvo/);
 assert.equal(readProjectProposal([{text:'Oi'}]),null);
 assert.equal(PROJECT_TOOL_DECLARATION.functionDeclarations[0].name,'propose_project');
 for(const bad of [
  [{functionCall:{name:'delete_project',args:call.args}}],
  [{functionCall:{name:'propose_project',args:{...call.args,secret:'password'}}}],
  [{functionCall:{name:'propose_project',args:{title:'x',goal:'sim'}}}],
  [{functionCall:call},{functionCall:call}],
  [{functionCall:{name:'propose_project',args:{title:'Vendas',goal:'Crescer',notes:5}}}]
 ])assert.throws(()=>readProjectProposal(bad));
});
test('integração Gemini: gera preview sem gravar qualquer projeto',async()=>{
 state.clear();let requests=0;
 const {env,store,request}=envFixture();
 const model=(async(_url:string,init:RequestInit)=>{
  requests++;
  const sent=JSON.parse(String(init.body));
  assert.equal(sent.tools[0].functionDeclarations[0].name,'propose_project');
  assert.match(sent.systemInstruction.parts[0].text,/Nunca afirme que algo foi salvo/);
  return Response.json({candidates:[{content:{parts:[{functionCall:call}]}}]});
 }) as typeof fetch;
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:model});
 const response=await worker.fetch(request(),env);
 assert.equal(response.status,200);
 const body=await response.json() as any;
 assert.equal(body.projectProposal.title,'Meu negócio');
 assert.equal(body.projectProposal.source,'gemini');
 assert.equal(body.projectProposal.requiresApproval,true);
 assert.equal(body.persisted,false);
 assert.equal(body.executed,false);
 assert.equal(requests,1);
 const stored=await store.fetch(new Request('https://lab-workspace.internal/projects'));
 assert.equal((await stored.json() as any).projects.length,0);
 assert.equal(state.size,0);
 const parsed=readLabProjectProposal(body);
 assert.equal(parsed?.title,'Meu negócio');
});
test('desligado: não envia ferramentas ao Gemini e não cria proposta',async()=>{
 state.clear();
 const {env,request}=envFixture();
 const model=(async(_url:string,init:RequestInit)=>{
  const sent=JSON.parse(String(init.body));
  assert.equal(sent.tools,undefined);
  return Response.json({candidates:[{content:{parts:[{text:'Converse comigo sobre o projeto.'}]}}]});
 }) as typeof fetch;
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:model});
 const result=await worker.fetch(request(),{...env,LAB_BRAIN_ENABLED:'false'});
 assert.equal(result.status,200);
 const body=await result.json() as any;
 assert.equal(body.projectProposal,undefined);
 assert.equal(body.text,'Converse comigo sobre o projeto.');
});
test('falha fechada com functionCall desconhecida; nenhuma escrita',async()=>{
 state.clear();
 const {env,request}=envFixture();
 const worker=makeLabChatWorker({verify:async()=> 'owner',
  fetch:(async()=>Response.json({candidates:[{content:{parts:[
   {functionCall:{name:'delete_all',args:{}}}
  ]}}]})) as typeof fetch});
 const result=await worker.fetch(request(),env);
 assert.equal(result.status,502);
 assert.deepEqual(state.size,0);
});
test('criação ocorre somente em rota autenticada e somente após requisição separada do usuário',async()=>{
 state.clear();
 const {env,store}=envFixture();
 const worker=makeLabChatWorker({verify:async()=> 'owner'});
 const base='https://lab-worker.invalid/api/lab/workspace/projects';
 const create=()=>new Request(base,{method:'POST',headers:{
  Origin:origin,Authorization:'Bearer fake','Content-Type':'application/json'},
  body:JSON.stringify({title:'Meu negócio',goal:'Organizar vendas e tarefas da empresa',notes:'Planejamento inicial'})
 });
 const denied=makeLabChatWorker({verify:async()=> 'other'});
 assert.equal((await denied.fetch(create(),env)).status,403);
 assert.equal((await worker.fetch(create(),{...env,LAB_WORKSPACE_ENABLED:'false'})).status,503);
 assert.equal((await store.fetch(new Request('https://lab-workspace.internal/projects')).then(r=>r.json()) as any).projects.length,0);
 const created=await worker.fetch(create(),env);
 assert.equal(created.status,201);
 const body=await created.json() as any;
 assert.equal(body.project.title,'Meu negócio');
});
test('cliente só aceita proposta estruturada, campos e confirmação corretos',()=>{
 assert.equal(readLabProjectProposal({projectProposal:{...call.args,kind:'project.create',source:'gemini',requiresApproval:true}})?.title,'Meu negócio');
 assert.equal(readLabProjectProposal({projectProposal:{...call.args,kind:'project.create',source:'gemini',requiresApproval:false}}),null);
 assert.equal(readLabProjectProposal({projectProposal:{...call.args,kind:'external.write',source:'gemini',requiresApproval:true}}),null);
 assert.equal(readLabProjectProposal({projectProposal:{...call.args,kind:'project.create',source:'gemini',requiresApproval:true,notes:'x'.repeat(3000)}}),null);
});
