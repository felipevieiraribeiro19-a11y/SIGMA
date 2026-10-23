import test from 'node:test';
import assert from 'node:assert/strict';
import {LabWorkspaceStore,entryPayload} from '../worker/src/lab-workspace';
import {projectCreatePayload,projectPatchPayload,PROJECT_LIMIT} from '../worker/src/core/universal-projects';
import {makeLabChatWorker} from '../worker/src/chat-lab';

const makeStore=()=>{
 const map=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{transaction:async<T>(cb:(tx:any)=>Promise<T>)=>
  cb({get:async(key:string)=>map.get(key),put:async(key:string,value:unknown)=>{map.set(key,value);}})
 }} as any);
 const call=async(path:string,method='GET',body?:unknown)=>{
  const result=await store.fetch(new Request('https://internal.lab'+path,{method,
   ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}));
  return {status:result.status,data:await result.json() as any};
 };
 return {map,store,call};
};
test('projetos aceitam qualquer finalidade sem categorias fixas',async()=>{
 const db=makeStore();
 const goals=[
  {title:'Concurso fiscal',goal:'Organizar o estudo até o edital'},
  {title:'Vendas de veículos',goal:'Acompanhar meus clientes e negociações'},
  {title:'Império da Batata',goal:'Entender vendas, despesas e estoque'},
  {title:'Aprender inglês',goal:'Praticar diariamente'}
 ];
 for(const g of goals){
  const res=await db.call('/projects','POST',g);
  assert.equal(res.status,201);
  assert.equal(res.data.project.status,'active');
 }
 const all=await db.call('/projects');
 assert.equal(all.status,200);
 assert.equal(all.data.projects.length,4);
 assert.ok(all.data.projects.some((p:any)=>p.title==='Vendas de veículos'));
 assert.equal(db.map.has('projects'),true);
 assert.equal(db.map.has('study-cycle'),false);
 assert.equal(db.map.has('entries'),false);
});
test('agrupa tarefas, despesas e estudos sem mudar os registros antigos',async()=>{
 const db=makeStore();
 const p=await db.call('/projects','POST',{title:'Vendas',goal:'Organizar os contatos'});
 const id=p.data.project.id;
 const before=await db.call('/entries','POST',{kind:'daily',title:'Registro geral',notes:'Sem projeto'});
 assert.equal(before.status,201);
 for(const input of [
  {kind:'task',title:'Retornar para cliente',done:false},
  {kind:'task',title:'Negociação concluída',done:true},
  {kind:'finance',title:'Receita da venda',amount:350},
  {kind:'finance',title:'Despesa com anúncio',amount:-45.2},
  {kind:'study',title:'Treino de produto',minutes:30,subject:'Vendas'}
 ]){
  const result=await db.call('/entries','POST',{...input,projectId:id});
  assert.equal(result.status,201);
 }
 const all=await db.call('/projects');
 const row=all.data.projects[0];
 assert.equal(row.recordCount,5);
 assert.equal(row.tasksOpen,1);
 assert.equal(row.tasksDone,1);
 assert.equal(row.studyMinutes,30);
 assert.equal(row.financeBalance,304.8);
 const detail=await db.call('/projects/'+id);
 assert.equal(detail.data.entries.length,5);
 const entries=await db.call('/entries');
 assert.equal(entries.data.entries.length,6);
 assert.equal(entries.data.entries.find((e:any)=>e.title==='Registro geral').projectId,undefined);
});
test('arquivar preserva todos os dados e permite reativar',async()=>{
 const db=makeStore();
 const created=await db.call('/projects','POST',{title:'Concurso',goal:'Ser aprovado'});
 const id=created.data.project.id;
 const study=await db.call('/entries','POST',{kind:'study',title:'Português',projectId:id,minutes:45});
 const studyId=study.data.entry.id;
 const archived=await db.call('/projects/'+id,'PATCH',{status:'archived'});
 assert.equal(archived.status,200);
 assert.equal(archived.data.project.status,'archived');
 const detail=await db.call('/projects/'+id);
 assert.equal(detail.data.entries.length,1);
 assert.equal((await db.call('/entries','POST',{kind:'study',title:'Outra sessão',projectId:id})).status,409);
 // Existing records keep their project association and remain editable.
 assert.equal((await db.call('/entries/'+studyId,'PATCH',{
  kind:'study',title:'Português revisado',minutes:60,projectId:id
 })).status,200);
 const restored=await db.call('/projects/'+id,'PATCH',{status:'active',goal:'Concurso futuro'});
 assert.equal(restored.data.project.goal,'Concurso futuro');
 assert.equal((await db.call('/entries','POST',{kind:'task',title:'Rever edital',projectId:id})).status,201);
 assert.equal((await db.call('/projects/'+id)).data.entries.length,2);
 assert.equal((await db.call('/projects/'+id,'DELETE')).status,405);
});
test('dados inválidos, IDs de projetos desconhecidos e campos arbitrários são recusados',async()=>{
 const db=makeStore();
 for(const data of [
  {title:'',goal:'Abrir loja'},{title:'Empresa',goal:''},
  {title:'Vendas',goal:'Leads',status:'active'},
  {title:'Vendas',goal:'Leads',uid:'another-user'},
  {title:'Vendas',goal:'Leads',notes:'x'.repeat(2001)}
 ])assert.equal((await db.call('/projects','POST',data)).status,400);
 assert.throws(()=>projectCreatePayload({title:'Empresa',goal:'Crescer',token:'private'}));
 for(const data of [{status:'destroyed'},{uid:'other'},{}, {title:'x'}, {notes:'z'.repeat(2001)}])
  assert.throws(()=>projectPatchPayload(data));
 assert.equal((await db.call('/entries','POST',{kind:'task',title:'Falso',
  projectId:'12345678-1234-4123-8123-123456789012'})).status,409);
 assert.throws(()=>entryPayload({kind:'finance',title:'Entrada',projectId:'invalid'}));
 assert.equal((await db.call('/projects/12345678-1234-4123-8123-123456789012')).status,404);
 assert.equal((await db.call('/projects','DELETE')).status,405);
 assert.equal(PROJECT_LIMIT,50);
});
test('Worker isolado por UID Firebase: projeto criado no usuário A não aparece em B',async()=>{
 const owner=makeStore(),intruder=makeStore();
 const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
 const env={ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_WORKSPACE_ENABLED:'true',
  LAB_WORKSPACE:{idFromName:(v:string)=>v,get:(id:string)=>({
   fetch:(request:Request|string,init?:RequestInit)=>{
    const target=id==='owner'?owner:intruder;
    return target.store.fetch(typeof request==='string'?new Request(request,init):request);
   }
  })}
 } as any;
 const req=(path:string,method='GET',payload?:unknown,site=origin)=>new Request(
  'https://worker.example/api/lab/workspace'+path,{method,headers:{
   Origin:site,Authorization:'Bearer fake-firebase',
   ...(payload===undefined?{}:{'Content-Type':'application/json'})},
   ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  });
 const worker=makeLabChatWorker({verify:async()=> 'owner'});
 const created=await worker.fetch(req('/projects','POST',{title:'Vendas',goal:'CRM pessoal'}),env);
 assert.equal(created.status,201);
 const id=(await created.json() as any).project.id;
 assert.equal((await worker.fetch(req('/projects/'+id),env)).status,200);
 assert.equal((await worker.fetch(req('/projects/'+id, 'PATCH',{status:'paused'}),env)).status,200);
 assert.equal((await worker.fetch(req('/projects','POST',{title:'Loja',goal:'Vendas'},
  'https://sigma-61328.web.app'),env)).status,403);
 const denied=makeLabChatWorker({verify:async()=> 'intruder'});
 assert.equal((await denied.fetch(req('/projects'),env)).status,403);
 assert.equal((await worker.fetch(req('/projects'),{...env,LAB_WORKSPACE_ENABLED:'false'})).status,503);
 assert.equal((await intruder.call('/projects/'+id)).status,404);
});
