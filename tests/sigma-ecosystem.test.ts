import test from 'node:test';
import assert from 'node:assert/strict';
import {LabWorkspaceStore} from '../worker/src/lab-workspace';
import {readGoogle,readNotion,validateProviders,providerPrompt} from '../worker/src/core/sigma-connectors';
import {proposeContinuousLearning} from '../worker/src/core/continuous-learning';
import {SIGMA_MODULES} from '../worker/src/core/ecosystem-manifest';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
function store(){
 const state=new Map<string,unknown>();
 return new LabWorkspaceStore({storage:{transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({
  get:async(key:string)=>state.get(key),put:async(key:string,value:unknown)=>{state.set(key,value)}
 })}} as any);
}
const request=(method:string,path:string,body?:unknown)=>new Request('https://lab-workspace.internal'+path,{
 method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
});
test('diário, estudos, tarefas e finanças preservam dados de forma transacional isolada',async()=>{
 const db=store(),study={kind:'study',title:'Contabilidade geral',minutes:45,amount:0,notes:'10 questões',done:false};
 assert.deepEqual((await (await db.fetch(request('GET','/entries'))).json()).entries,[]);
 const saved=await db.fetch(request('POST','/entries',study));
 assert.equal(saved.status,201);
 const row=(await saved.json()).entry;
 const task={kind:'task',title:'Conferir PDF',minutes:0,amount:0,notes:'',done:false};
 const t=(await (await db.fetch(request('POST','/entries',task))).json()).entry;
 await db.fetch(request('POST','/entries',{kind:'finance',title:'Uber',notes:'',minutes:0,amount:125.5,done:false}));
 const changed=await db.fetch(request('PATCH','/entries/'+t.id,{...task,done:true}));
 assert.equal(changed.status,200);
 const list=await (await db.fetch(request('GET','/entries'))).json();
 assert.equal(list.entries.length,3);
 assert.equal(list.totals.studiedMinutes,45);
 assert.equal(list.totals.tasksDone,1);
 assert.equal(list.totals.financialBalance,125.5);
 assert.equal((await db.fetch(request('DELETE','/entries/'+row.id))).status,200);
 assert.equal((await (await db.fetch(request('GET','/entries'))).json()).entries.length,2);
});
test('workspace bloqueia payloads desconhecidos e valores não finitos',async()=>{
 const db=store();
 for(const x of [
  {kind:'study',title:'Teste',minutes:-1},
  {kind:'study',title:'Teste',extra:'roubar'},
  {kind:'finance',title:'Teste',amount:'100'},
  {kind:'task',title:'',done:true},
  {kind:'daily',title:'Tudo',notes:'x'.repeat(1501)}
 ])assert.equal((await db.fetch(request('POST','/entries',x))).status,400);
 assert.equal((await db.fetch(request('DELETE','/entries/00000000-0000-4000-8000-000000000001'))).status,404);
});
test('adapters de Google e Notion só retornam dados de leitura sanitizados',async()=>{
 let googleToken='',notionToken='';
 const fake=(async (url:string,init:RequestInit)=>{
  if(url.includes('calendar/v3')){
   googleToken=(init.headers as any).Authorization;
   return Response.json({items:[{id:'cal1',summary:'Reunião <script>',start:{dateTime:'2026-11-01T10:00:00-03:00'}}]});
  }
  if(url.includes('drive/v3'))return Response.json({files:[{id:'drive1',name:'Exercícios.pdf',modifiedTime:'2026-10-22T10:00:00Z'}]});
  notionToken=(init.headers as any).Authorization;
  return Response.json({results:[{id:'page1',object:'page',properties:{title:{title:[{plain_text:'Planejamento'}]}}}]});
 }) as typeof fetch;
 const calendar=await readGoogle('calendar','fake-access-token',fake);
 assert.match(calendar[0].title,/Reunião/);
 assert.doesNotMatch(calendar[0].title,/[<>]/);
 assert.equal(googleToken,'Bearer fake-access-token');
 const drive=await readGoogle('drive','fake-access-token',fake);
 assert.equal(drive[0].title,'Exercícios.pdf');
 const notion=await readNotion('fake-notion-secret',fake);
 assert.equal(notion[0].title,'Planejamento');
 assert.equal(notionToken,'Bearer fake-notion-secret');
 assert.doesNotMatch(providerPrompt('calendar',calendar),/fake-access-token/);
 assert.deepEqual(validateProviders(['calendar','drive','notion']),['calendar','drive','notion']);
 assert.throws(()=>validateProviders(['calendar','calendar']));
});
test('aprendizado contínuo nunca salva automaticamente nem captura frases sensíveis',()=>{
 const draft=proposeContinuousLearning('Meu objetivo é terminar o Projeto Alfa em dezembro.');
 assert.equal(draft?.requiresApproval,true);
 assert.match(draft?.text||'',/Projeto Alfa/);
 assert.equal(proposeContinuousLearning('Oi, tudo bem?'),null);
 assert.equal(proposeContinuousLearning('Lembre que a senha é 12345.'),null);
 assert.equal(SIGMA_MODULES.find(x=>x.id==='notion')?.state,'ready-for-credentials');
 assert.equal(SIGMA_MODULES.find(x=>x.id==='automations')?.state,'planned');
});
test('rotas privadas dos serviços são fechadas sem autenticação, flags e credenciais',async()=>{
 const env={
  ALLOWED_ORIGIN:origin,ALLOWED_UID:'allowed',LAB_CHAT_ENABLED:'true',
  LAB_WORKSPACE_ENABLED:'false',LAB_CONNECTORS_ENABLED:'false',
  LAB_QUOTA:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}
 } as any;
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID});
 const req=(path:string,site=origin)=>new Request('https://lab.test'+path,{headers:{Origin:site,Authorization:'Bearer demo'}});
 assert.equal((await worker.fetch(req('/api/lab/workspace'),env)).status,503);
 assert.equal((await worker.fetch(req('/api/lab/integrations/notion'),env)).status,503);
 assert.equal((await worker.fetch(req('/api/lab/modules'),env)).status,200);
 assert.equal((await worker.fetch(req('/api/lab/modules','https://sigma-61328.web.app'),env)).status,403);
 const wrong=makeLabChatWorker({verify:async()=> 'stranger'});
 assert.equal((await wrong.fetch(req('/api/lab/modules'),env)).status,403);
});
