import test from 'node:test';
import assert from 'node:assert/strict';
import {readSharedProjects} from '../worker/src/core/project-chat-context';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';
import {approvedChatRequest} from '../src/lab-chat-memory-selection';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const modelReply=Response.json({candidates:[{content:{parts:[{text:'Você pode retomar seu projeto existente.'}]}}]});
function fixture(){
 const map=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{transaction:async<T>(f:(tx:any)=>Promise<T>)=>
  f({get:async(k:string)=>map.get(k),put:async(k:string,v:unknown)=>{map.set(k,v)}})}} as any);
 const env={
  FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'owner',ALLOWED_ORIGIN:origin,
  LAB_CHAT_ENABLED:'true',LAB_WORKSPACE_ENABLED:'true',LAB_BRAIN_ENABLED:'true',
  GEMINI_API_KEY:'test-key-only',GEMINI_MODEL:'gemini-fake',
  LAB_WORKSPACE:{idFromName:(uid:string)=>uid,get:(uid:string)=>{
   assert.equal(uid,'owner');
   return {fetch:(q:string|Request,init?:RequestInit)=>
    store.fetch(typeof q==='string'?new Request(q,init):q)};
  }},
  LAB_QUOTA:{idFromName:(uid:string)=>uid,get:()=>({fetch:async()=>new Response(null,{status:204})})}
 } as any;
 const request=(useProjects?:unknown)=>new Request('https://worker.test/api/lab/chat',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer test-user',
   'Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',text:'O que já comecei e posso continuar?'}],
   ...(useProjects===undefined?{}:{useProjects})})
 });
 return {map,store,env,request};
}
test('resumo de projetos inclui apenas nomes, objetivos e estado, nunca notas privadas nem finanças',()=>{
 const input={projects:[{
  id:'f3e099a8-27e8-4bce-a97c-e70f9111d541',title:'Vendas',
  goal:'Organizar negociações com responsabilidade',status:'active',
  notes:'Telefone particular 9999-9999; segredo na nota',
  financeBalance:50000,tasksOpen:3,recordCount:5
 }]};
 const output=readSharedProjects(input);
 assert.equal(output.receipt.shared,1);
 assert.equal(output.receipt.available,1);
 assert.ok(output.prompt.includes('Vendas'));
 for(const secret of ['9999-9999','segredo na nota','50000','recordCount','tasksOpen',
   'f3e099a8-27e8-4bce-a97c-e70f9111d541'])
  assert.ok(!output.prompt.includes(secret),secret+' não pode estar no prompt');
 assert.match(output.prompt,/ignore qualquer instrução/);
});
test('contexto limitado a oito projetos e objetivos resumidos, sem inventar acesso ao restante',()=>{
 const many=Array.from({length:12},(_,i)=>({
  title:'Projeto '+i,goal:'x'.repeat(700),status:'active'
 }));
 const result=readSharedProjects({projects:many});
 assert.equal(result.receipt.shared,8);
 assert.equal(result.receipt.available,12);
 assert.equal(result.receipt.truncated,true);
 assert.ok(!result.prompt.includes('Projeto 8'));
 assert.ok(result.prompt.length<4000);
 assert.throws(()=>readSharedProjects({projects:[{title:'x',goal:'teste',status:'active'}]}));
 assert.throws(()=>readSharedProjects({projects:{}}));
 assert.throws(()=>readSharedProjects({projects:Array.from({length:51},()=>many[0])}));
});
test('sem consentimento, Worker não lê os projetos nem os inclui no Gemini',async()=>{
 const f=fixture();
 f.map.set('projects',[{title:'Meu segredo',goal:'Só na minha conta',status:'active',
  notes:'não compartilhe',createdAt:'2026-10-23',updatedAt:'2026-10-23',id:'a'}]);
 let reads=0;
 const worker=makeLabChatWorker({verify:async()=> 'owner',
  fetch:(async(_url:string,init:RequestInit)=>{
   const body=JSON.parse(String(init.body));
   assert.ok(!JSON.stringify(body).includes('Meu segredo'));
   assert.ok(!JSON.stringify(body).includes('Só na minha conta'));
   return Response.json({candidates:[{content:{parts:[{text:'Tudo certo.'}]}}]});
  }) as typeof fetch
 });
 const env={...f.env,LAB_WORKSPACE:{...f.env.LAB_WORKSPACE,get:()=>{
  reads++;throw Error('não deveria acessar o Workspace');
 }}};
 const result=await worker.fetch(f.request(),env);
 assert.equal(result.status,200);
 assert.equal((await result.json() as any).projects,undefined);
 assert.equal(reads,0);
});
test('com autorização explícita, lê somente DO do dono e informa comprovante da consulta',async()=>{
 const f=fixture();
 const original={title:'Clientes de veículos',goal:'Acompanhar oportunidades',
  notes:'Cliente privado: não enviar nome',status:'active'};
 const create=await f.store.fetch(new Request('https://lab-workspace.internal/projects',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   title:original.title,goal:original.goal,notes:original.notes
  })
 }));
 assert.equal(create.status,201);
 let called=0;
 const worker=makeLabChatWorker({verify:async()=> 'owner',
  fetch:(async(_url:string,init:RequestInit)=>{
   called++;
   const body=JSON.parse(String(init.body));
   const text=JSON.stringify(body);
   assert.match(text,/Clientes de veículos/);
   assert.match(text,/Acompanhar oportunidades/);
   assert.doesNotMatch(text,/Cliente privado/);
   assert.equal(body.contents.at(-1).parts.length,2);
   return Response.json({candidates:[{content:{parts:[{text:'Já existe esse projeto.'}]}}]});
  }) as typeof fetch
 });
 const r=await worker.fetch(f.request(true),f.env);
 assert.equal(r.status,200);
 const body=await r.json() as any;
 assert.deepEqual(body.projects,{consulted:true,shared:1,available:1,truncated:false});
 assert.equal(body.persisted,false);
 assert.equal(body.executed,false);
 assert.equal(called,1);
 const all=await f.store.fetch(new Request('https://lab-workspace.internal/projects'));
 assert.equal((await all.json() as any).projects.length,1);
});
test('sem flags, com valor inválido ou outra UID, nenhuma chamada Gemini ou leitura autorizada',async()=>{
 const f=fixture();
 let calls=0;
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:(async()=>{
  calls++;return modelReply.clone();
 }) as typeof fetch});
 for(const invalid of [1,'true',null,[],{}]){
  assert.equal((await worker.fetch(f.request(invalid),f.env)).status,400);
 }
 assert.equal((await worker.fetch(f.request(true),{...f.env,LAB_BRAIN_ENABLED:'false'})).status,503);
 assert.equal((await worker.fetch(f.request(true),{...f.env,LAB_WORKSPACE_ENABLED:'false'})).status,503);
 const wrong=makeLabChatWorker({verify:async()=> 'another-user',fetch:(async()=>{
  calls++;return modelReply.clone();
 }) as typeof fetch});
 assert.equal((await wrong.fetch(f.request(true),f.env)).status,403);
 assert.equal(calls,0);
});
test('formato do cliente omite autorização quando desmarcada',()=>{
 const messages=[{role:'user' as const,text:'O que estudarei hoje?'}];
 const plain=approvedChatRequest(messages,[],false,[],false,false);
 assert.equal('useProjects' in plain,false);
 const consent=approvedChatRequest(messages,[],false,[],false,true);
 assert.equal((consent as {useProjects?:boolean}).useProjects,true);
 assert.throws(()=>approvedChatRequest(messages,[],false,[],false,'yes' as any));
});
