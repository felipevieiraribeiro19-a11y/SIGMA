import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCycleSubjects,summarizeStudyCycle,type StudyCycleConfig} from '../worker/src/core/study-cycle';
import {LabWorkspaceStore,type WorkspaceEntry} from '../worker/src/lab-workspace';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const start='2026-10-23T10:00:00.000Z';
const config:StudyCycleConfig={startedAt:start,updatedAt:start,
 subjects:[{name:'AFO',targetMinutes:120},{name:'Português',targetMinutes:120},
  {name:'Contabilidade',targetMinutes:120}]};
const study=(id:string,subject:string,minutes:number,when:string,attempted?:number,correct?:number):WorkspaceEntry=>({
 id,kind:'study',title:'Bloco de '+subject,notes:'',minutes,amount:0,done:false,
 subject,createdAt:when,updatedAt:when,
 ...(attempted===undefined?{}:{questionsTotal:attempted,questionsCorrect:correct})
});
const memory=()=>{
 const records=new Map<string,unknown>();
 const store=new LabWorkspaceStore({storage:{transaction:async<T>(f:(tx:any)=>Promise<T>)=>
  f({get:async(k:string)=>records.get(k),put:async(k:string,v:unknown)=>{records.set(k,v)}})
 }} as any);
 const call=(route:string,method='GET',body?:unknown)=>store.fetch(new Request(
  'https://workspace.internal'+route,{method,...(body===undefined?{}:{
   headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  })}));
 return {records,store,call};
};
test('validação do ciclo exige matérias únicas, pesos legítimos e bloqueia campos extras',()=>{
 assert.deepEqual(parseCycleSubjects([{name:' Contabilidade  ',targetMinutes:120}]),
  [{name:'Contabilidade',targetMinutes:120}]);
 for(const value of [
  [],Array(13).fill({name:'Direito',targetMinutes:120}),
  [{name:'Português',targetMinutes:120},{name:'Portugues',targetMinutes:120}],
  [{name:'A',targetMinutes:120}],[{name:'AFO',targetMinutes:0}],
  [{name:'AFO',targetMinutes:121}],[{name:'AFO',targetMinutes:721}],
  [{name:'AFO',targetMinutes:NaN}],[{name:'AFO',targetMinutes:'120'}],
  [{name:'AFO',targetMinutes:120,uid:'other'}],null
 ])assert.throws(()=>parseCycleSubjects(value));
});
test('rotação avança para a próxima matéria mesmo sem concluir o bloco anterior',()=>{
 assert.equal(summarizeStudyCycle(null,[]).configured,false);
 const initial=summarizeStudyCycle(config,[]);
 assert.equal(initial.suggestedSubject,'AFO');
 assert.equal(initial.insufficientData,true);
 const rows=[
  study('a','AFO',60,'2026-10-23T11:00:00.000Z'),
  study('b','Português',120,'2026-10-23T12:00:00.000Z',20,16),
  study('z','Informática',400,'2026-10-23T13:00:00.000Z')
 ];
 const summary=summarizeStudyCycle(config,rows);
 assert.equal(summary.suggestedSubject,'Contabilidade');
 assert.equal(summary.totalCompletedMinutes,180);
 assert.equal(summary.subjects[0].minutesRemaining,60);
 assert.equal(summary.subjects[1].percentComplete,100);
 assert.equal(summary.subjects[1].accuracyPercent,80);
 assert.equal(summary.completed,false);
 rows.push(study('c','Contabilidade',120,'2026-10-23T14:00:00.000Z'),
  study('d','AFO',60,'2026-10-23T15:00:00.000Z'));
 const done=summarizeStudyCycle(config,rows);
 assert.equal(done.completed,true);
 assert.equal(done.suggestedSubject,null);
 assert.equal(done.totalCompletedMinutes,360);
 assert.match(done.reason,/Confirme/);
});
test('respeita data de início, limite de meta e prioriza revisão apenas com amostra suficiente',()=>{
 const rows=[
  study('old','Contabilidade',800,'2026-10-22T09:00:00.000Z'),
  study('c','Contabilidade',30,'2026-10-23T10:30:00.000Z',10,5),
  study('b','Português',120,'2026-10-23T11:00:00.000Z'),
  study('a','AFO',150,'2026-10-23T10:40:00.000Z')
 ];
 const result=summarizeStudyCycle(config,rows);
 assert.equal(result.suggestedSubject,'Contabilidade');
 assert.equal(result.subjects[2].minutesCompleted,30);
 assert.equal(result.subjects[0].minutesRemaining,0);
 assert.equal(result.totalCompletedMinutes,270);
 assert.match(result.reason,/abaixo de 70%/);
});
test('rotas do cofre do usuário guardam ciclo sem apagar registros e exigem reset explícito',async()=>{
 const db=memory();
 assert.equal((await db.call('/entries/cycle')).status,200);
 assert.equal((await db.call('/entries/cycle').then(r=>r.json()) as any).summary.configured,false);
 assert.equal((await db.call('/entries/cycle','PUT',{subjects:[{name:'AFO',targetMinutes:120}]})).status,200);
 const cfg=await db.call('/entries/cycle').then(r=>r.json()) as any;
 assert.equal(cfg.config.subjects.length,1);
 assert.equal(cfg.summary.suggestedSubject,'AFO');
 const legacy={kind:'study',title:'Estudo antigo',minutes:45,notes:'',amount:0,done:false,
  subject:'AFO',questionsTotal:10,questionsCorrect:6};
 const saved=await db.call('/entries','POST',legacy);
 assert.equal(saved.status,201);
 assert.equal((await db.call('/entries/cycle','POST',{subjects:[]})).status,405);
 assert.equal((await db.call('/entries/cycle/reset','POST',{confirm:false})).status,400);
 const previous=(db.records.get('entries') as WorkspaceEntry[]).slice();
 assert.equal((await db.call('/entries/cycle/reset','POST',{confirm:true})).status,200);
 const after=db.records.get('entries') as WorkspaceEntry[];
 assert.deepEqual(after,previous);
 const updated=await db.call('/entries/cycle').then(r=>r.json()) as any;
 assert.ok(updated.config.startedAt>=cfg.config.startedAt);
 assert.equal(updated.config.subjects[0].name,'AFO');
 assert.equal((await db.call('/entries/cycle','PUT',{subjects:[{name:'AFO',targetMinutes:0}]})).status,400);
 assert.equal((await db.call('/entries/cycle','PUT',{subjects:[{name:'AFO',targetMinutes:120}],test:'bad'})).status,400);
});
test('Worker aceita apenas dono Firebase e flag ativa, sem consumir API externa',async()=>{
 const db=memory(),origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
 const env={ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_WORKSPACE_ENABLED:'true',
  LAB_WORKSPACE:{idFromName:(x:string)=>x,get:()=>({
   fetch:(request:Request|string,init?:RequestInit)=>db.store.fetch(
    typeof request==='string'?new Request(request,init):request)
  })}
 } as any;
 const req=(path:string,method='GET',body?:unknown)=>new Request(
  'https://worker.lab/api/lab/workspace/'+path,{
   method,headers:{Origin:origin,Authorization:'Bearer simulated',
    ...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
 const worker=makeLabChatWorker({verify:async()=> 'owner'});
 assert.equal((await worker.fetch(req('cycle'),env)).status,200);
 const put=await worker.fetch(req('cycle','PUT',{subjects:[{name:'Direito Constitucional',targetMinutes:120}]}),env);
 assert.equal(put.status,200);
 const stored=(await worker.fetch(req('cycle'),env)).status;
 assert.equal(stored,200);
 assert.equal((await worker.fetch(req('cycle/reset','POST',{confirm:true}),env)).status,200);
 const intruder=makeLabChatWorker({verify:async()=> 'stranger'});
 assert.equal((await intruder.fetch(req('cycle'),env)).status,403);
 assert.equal((await worker.fetch(req('cycle'),{...env,LAB_WORKSPACE_ENABLED:'false'})).status,503);
});
