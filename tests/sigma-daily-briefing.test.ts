import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailyBriefing,localDay} from '../worker/src/core/workspace-briefing';
import {entryPayload,LabWorkspaceStore,type WorkspaceEntry} from '../worker/src/lab-workspace';
import {makeLabChatWorker} from '../worker/src/chat-lab';

const at='2026-10-23T15:30:00.000Z'; // local 12:30 in São Paulo
const create=(kind:WorkspaceEntry['kind'],title:string,rest:Partial<WorkspaceEntry>={}):WorkspaceEntry=>({
 id:crypto.randomUUID(),kind,title,notes:'',minutes:0,amount:0,done:false,
 createdAt:at,updatedAt:at,...rest
});
function workspace(){
 const state=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{
  transaction:async <T>(fn:(tx:any)=>Promise<T>)=>fn({
   get:async(k:string)=>state.get(k),
   put:async(k:string,v:unknown)=>{state.set(k,v)}
  })
 }} as any);
 const call=(path:string,method='GET',body?:unknown)=>store.fetch(new Request(
  'https://workspace.invalid'+path,{
   method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  }));
 return {state,store,call};
}
test('fuso America/Sao_Paulo distingue hoje de UTC sem mudar o dia ficticiamente',()=>{
 assert.equal(localDay(new Date('2026-10-23T02:59:59Z')),'2026-10-22');
 assert.equal(localDay(new Date('2026-10-23T03:00:00Z')),'2026-10-23');
 assert.equal(localDay(new Date('2026-10-24T02:59:59Z')),'2026-10-23');
});
test('resumo separa vencidas, hoje, próximos sete dias, sem prazo e conclusão',()=>{
 const entries=[
  create('task','Vencida',{dueDate:'2026-10-22',priority:'low'}),
  create('task','Hoje alta',{dueDate:'2026-10-23',priority:'high'}),
  create('task','Semana',{dueDate:'2026-10-30'}),
  create('task','Futura',{dueDate:'2026-10-31'}),
  create('task','Sem prazo',{createdAt:'2026-10-01T12:00:00Z'}),
  create('task','Concluída',{done:true,updatedAt:'2026-10-23T03:10:00Z'}),
  create('study','Contabilidade',{minutes:75}),
  create('study','Português',{minutes:45,createdAt:'2026-10-23T02:59:59Z'}),
  create('daily','Registro pessoal',{notes:'não reproduzir em orientações'}),
  create('finance','Uber',{amount:100.13}),
  create('finance','Gasolina',{amount:-33.20}),
  create('finance','Ontem',{amount:999,createdAt:'2026-10-23T02:59:59Z'})
 ];
 const briefing=buildDailyBriefing(entries,new Date('2026-10-23T15:30:00Z'));
 assert.equal(briefing.date,'2026-10-23');
 assert.equal(briefing.studyMinutesToday,75);
 assert.equal(briefing.studySessionsToday,1);
 assert.equal(briefing.financeNetToday,66.93);
 assert.equal(briefing.overdueTasks,1);
 assert.equal(briefing.dueToday,1);
 assert.equal(briefing.dueNext7Days,1);
 assert.equal(briefing.undatedTasks,1);
 assert.equal(briefing.openTasks,5);
 assert.equal(briefing.tasksCompletedToday,1);
 assert.deepEqual(briefing.highlightedTasks.map(x=>x.title),
  ['Vencida','Hoje alta','Semana','Futura','Sem prazo']);
 assert.equal(briefing.latestDiary?.title,'Registro pessoal');
 assert.doesNotMatch(JSON.stringify(briefing),/não reproduzir/);
 assert.match(briefing.limitation,/Calendar/);
});
test('tarefas sem prazo antigas continuam válidas e campos extras são negados',()=>{
 assert.deepEqual(entryPayload({kind:'task',title:'Revisar AFO'}).done,false);
 assert.equal(entryPayload({kind:'task',title:'Revisar AFO',dueDate:'2026-10-30',priority:'high'}).dueDate,'2026-10-30');
 for(const input of [
  {kind:'task',title:'AFO',dueDate:'2026-02-30'},
  {kind:'task',title:'AFO',dueDate:'2026-13-01'},
  {kind:'task',title:'AFO',priority:'urgent'},
  {kind:'study',title:'AFO',dueDate:'2026-10-30'},
  {kind:'task',title:'AFO',extra:'unknown'},
 ]){
  assert.throws(()=>entryPayload(input));
 }
});
test('rota de briefing usa somente os registros locais e nunca grava ou busca Google',async()=>{
 const db=workspace();
 const userTask={kind:'task',title:'Revisar AFO',done:false,
  notes:'',minutes:0,amount:0,dueDate:'2026-10-23',priority:'high'};
 assert.equal((await db.call('/entries','POST',userTask)).status,201);
 const before=JSON.stringify(db.state.get('entries'));
 const summary=await db.call('/entries/briefing');
 assert.equal(summary.status,200);
 assert.equal((await summary.json() as any).dueToday,Number(
  localDay(new Date())==='2026-10-23'));
 assert.equal(JSON.stringify(db.state.get('entries')),before);
 assert.equal((await db.call('/entries/briefing','POST',userTask)).status,405);
 const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
 const env={
  ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_WORKSPACE_ENABLED:'true',
  LAB_WORKSPACE:{idFromName:(v:string)=>v,get:()=>({fetch:(req:Request|string,init?:RequestInit)=>
   db.store.fetch(typeof req==='string'?new Request(req,init):req)})}
 } as any;
 const request=new Request('https://worker.invalid/api/lab/workspace/briefing',{
  headers:{Origin:origin,Authorization:'Bearer fake-id-token'}
 });
 const worker=makeLabChatWorker({verify:async()=> 'owner'});
 assert.equal((await worker.fetch(request,env)).status,200);
 const unauthorized=makeLabChatWorker({verify:async()=> 'intruder'});
 assert.equal((await unauthorized.fetch(request,env)).status,403);
 const off=makeLabChatWorker({verify:async()=> 'owner'});
 assert.equal((await off.fetch(request,{...env,LAB_WORKSPACE_ENABLED:'false'})).status,503);
});
