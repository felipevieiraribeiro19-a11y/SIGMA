import test from 'node:test';
import assert from 'node:assert/strict';
import {entryPayload,LabWorkspaceStore,type WorkspaceEntry} from '../worker/src/lab-workspace';
import {buildStudyPerformance} from '../worker/src/core/study-performance';
import {buildDailyBriefing,localDay} from '../worker/src/core/workspace-briefing';

const time='2026-10-23T15:20:00.000Z';
const entry=(kind:WorkspaceEntry['kind'],title:string,extra:Partial<WorkspaceEntry>={}):WorkspaceEntry=>({
 id:crypto.randomUUID(),kind,title,notes:'',minutes:0,amount:0,done:false,
 createdAt:time,updatedAt:time,...extra
});
test('questões e acertos são opcionais em estudos antigos; registra apenas números inteiros possíveis',()=>{
 const prior=entryPayload({kind:'study',title:'Contabilidade',minutes:40});
 assert.equal(prior.questionsTotal,undefined);
 assert.equal(prior.questionsCorrect,undefined);
 const newStudy=entryPayload({kind:'study',title:'AFO',minutes:50,
  subject:'  Administração   Financeira  ',questionsTotal:20,questionsCorrect:15});
 assert.equal(newStudy.questionsTotal,20);
 assert.equal(newStudy.questionsCorrect,15);
 assert.equal(newStudy.subject,'Administração Financeira');
 for(const bad of [
  {kind:'study',title:'AFO',questionsTotal:20},
  {kind:'study',title:'AFO',questionsCorrect:18},
  {kind:'study',title:'AFO',questionsTotal:20,questionsCorrect:21},
  {kind:'study',title:'AFO',questionsTotal:-1,questionsCorrect:0},
  {kind:'study',title:'AFO',questionsTotal:3.5,questionsCorrect:2},
  {kind:'study',title:'AFO',questionsTotal:5001,questionsCorrect:0},
  {kind:'study',title:'AFO',questionsTotal:0,questionsCorrect:1},
  {kind:'study',title:'AFO',questionsTotal:'20',questionsCorrect:15},
  {kind:'study',title:'AFO',questionsTotal:20,questionsCorrect:Number.NaN},
  {kind:'task',title:'Revisar',questionsTotal:20,questionsCorrect:15},
  {kind:'study',title:'AFO',subject:''},
  {kind:'study',title:'AFO',subject:'x'.repeat(81)}
 ])assert.throws(()=>entryPayload(bad),'deveria recusar dados inconsistentes');
});
test('aproveitamento agregado é ponderado pelo número de questões, não pela média das taxas',()=>{
 const entries=[
  entry('study','Sessão I',{subject:'MATEMÁTICA',minutes:45,questionsTotal:10,questionsCorrect:9}),
  entry('study','Sessão II',{subject:'Matemática',minutes:80,questionsTotal:30,questionsCorrect:12}),
  entry('study','Sessão III',{subject:'Contabilidade',minutes:60,questionsTotal:20,questionsCorrect:15}),
  entry('study','Dia anterior',{subject:'Contabilidade',minutes:30,questionsTotal:10,
   questionsCorrect:5,createdAt:'2026-10-23T02:20:00.000Z'}),
  entry('study','Sem questões',{subject:'Português',minutes:20}),
  entry('study','Matéria ausente',{minutes:10,questionsTotal:1,questionsCorrect:1}),
  entry('task','Tarefa com anotação de questões',{minutes:0})
 ];
 const results=buildStudyPerformance(entries,'2026-10-23',localDay);
 assert.equal(results.overall.questionsTotal,71);
 assert.equal(results.overall.questionsCorrect,42);
 assert.equal(results.overall.questionsWrong,29);
 assert.equal(results.overall.accuracyPercent,59.2);
 assert.equal(results.today.questionsTotal,61);
 assert.equal(results.today.questionsCorrect,37);
 assert.equal(results.today.studiedMinutes,215);
 assert.equal(results.subjects.length,4);
 assert.equal(results.subjects[0].subject,'MATEMÁTICA');
 assert.equal(results.subjects[0].questionsTotal,40);
 assert.equal(results.subjects[0].accuracyPercent,52.5);
 assert.equal(results.subjects[1].subject,'Contabilidade');
 assert.equal(results.subjects[1].questionsTotal,30);
 assert.equal(results.subjects[1].accuracyPercent,66.7);
 assert.equal(results.subjects.find(s=>s.subject==='Português')?.accuracyPercent,null);
 assert.equal(results.unclassifiedSessions,1);
 const briefing=buildDailyBriefing(entries,new Date('2026-10-23T18:00:00Z'));
 assert.equal(briefing.studyPerformance.overall.questionsTotal,71);
 assert.equal(briefing.studyPerformance.today.questionsCorrect,37);
 assert.match(briefing.studyPerformance.disclaimer,/manualmente/);
});
test('nenhum registro de questões mostra taxa indisponível, nunca porcentagem fictícia',()=>{
 const results=buildStudyPerformance([
  entry('study','PDF de Direito Administrativo',{minutes:40})
 ],'2026-10-23',localDay);
 assert.equal(results.overall.accuracyPercent,null);
 assert.equal(results.today.accuracyPercent,null);
 assert.equal(results.subjects[0].subject,'Sem matéria informada');
 assert.equal(results.subjects[0].questionsTotal,0);
});
test('CRUD preserva campos de estudo ao cadastrar, editar e consultar sem acessar serviços externos',async()=>{
 const records=new Map<string,unknown>();
 const db=new LabWorkspaceStore({storage:{transaction:async<T>(fn:(tx:any)=>Promise<T>)=>fn({
  get:async (k:string)=>records.get(k),put:async(k:string,v:unknown)=>{records.set(k,v)}
 })}} as any);
 const req=(path:string,method='GET',body?:unknown)=>new Request('https://internal.local'+path,{
  method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
 });
 const payload={kind:'study',title:'Questões de Português',notes:'',minutes:45,amount:0,done:false,
  subject:'Português',questionsTotal:25,questionsCorrect:18};
 const created=await db.fetch(req('/entries','POST',payload));
 assert.equal(created.status,201);
 const newRow=(await created.json() as any).entry;
 assert.equal(newRow.questionsCorrect,18);
 const modified=await db.fetch(req('/entries/'+newRow.id,'PATCH',{
  ...payload,questionsCorrect:20
 }));
 assert.equal(modified.status,200);
 const list=await db.fetch(req('/entries'));
 assert.equal((await list.json() as any).entries[0].questionsCorrect,20);
 const summarized=await db.fetch(req('/entries/briefing'));
 assert.equal(summarized.status,200);
 const briefing=await summarized.json() as any;
 assert.equal(briefing.studyPerformance.overall.questionsCorrect,20);
 assert.equal(briefing.studyPerformance.overall.accuracyPercent,80);
 assert.equal(records.size,1,'apenas armazenamento local de registros manuais');
});
