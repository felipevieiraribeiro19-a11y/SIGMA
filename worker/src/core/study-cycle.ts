/** Configurable study rotation based on logged sessions: no AI, no Google, no auto-writes. */
import {HttpError} from '../validation';
import type {WorkspaceEntry} from '../lab-workspace';

export type CycleSubject={name:string;targetMinutes:number};
export type StudyCycleConfig={subjects:CycleSubject[];startedAt:string;updatedAt:string};
export type CycleProgressSubject=CycleSubject&{
 minutesCompleted:number;minutesRemaining:number;percentComplete:number;
 sessions:number;questionsTotal:number;questionsCorrect:number;accuracyPercent:number|null;
};
export type StudyCycleSummary={
 configured:boolean;startedAt:string|null;subjects:CycleProgressSubject[];
 totalTargetMinutes:number;totalCompletedMinutes:number;completed:boolean;
 suggestedSubject:string|null;reason:string;insufficientData:boolean;
};
const norm=(value:string)=>value.trim().toLocaleLowerCase('pt-BR').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const validateName=(value:unknown):string=>{
 if(typeof value!=='string'||value.trim().length<2||value.trim().length>80||
   /[\x00-\x1f\x7f]/.test(value))throw new HttpError(400,'Nome de matéria inválido.');
 return value.trim().replace(/\s+/g,' ');
};
export function parseCycleSubjects(value:unknown):CycleSubject[]{
 if(!Array.isArray(value)||value.length<1||value.length>12)
  throw new HttpError(400,'Informe de 1 a 12 matérias para o ciclo.');
 const seen=new Set<string>();
 return value.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))
   throw new HttpError(400,'Matéria do ciclo inválida.');
  const data=row as Record<string,unknown>;
  if(Object.keys(data).some(x=>!['name','targetMinutes'].includes(x)))
   throw new HttpError(400,'Campos não permitidos no ciclo.');
  const name=validateName(data.name),normalized=norm(name);
  if(seen.has(normalized))throw new HttpError(400,'Matéria repetida no ciclo.');
  seen.add(normalized);
  if(!Number.isSafeInteger(data.targetMinutes)||Number(data.targetMinutes)<30||
    Number(data.targetMinutes)>720||Number(data.targetMinutes)%15!==0)
   throw new HttpError(400,'Defina uma meta entre 30 e 720 minutos, em passos de 15.');
  return {name,targetMinutes:data.targetMinutes as number};
 });
}
const percentage=(num:number,den:number)=>den>0?Math.round(num/den*1000)/10:null;
export function summarizeStudyCycle(
 config:StudyCycleConfig|null,entries:readonly WorkspaceEntry[]
):StudyCycleSummary{
 if(!config)return {
  configured:false,startedAt:null,subjects:[],totalTargetMinutes:0,totalCompletedMinutes:0,
  completed:false,suggestedSubject:null,reason:'Configure as matérias e a meta de minutos de cada uma.',
  insufficientData:true
 };
 const rows:CycleProgressSubject[]=config.subjects.map(x=>({...x,minutesCompleted:0,
  minutesRemaining:x.targetMinutes,percentComplete:0,sessions:0,questionsTotal:0,
  questionsCorrect:0,accuracyPercent:null}));
 const indices=new Map(rows.map((s,i)=>[norm(s.name),i]));
 let latest:{index:number;timestamp:string;id:string}|null=null;
 for(const entry of entries){
  if(entry.kind!=='study'||entry.createdAt<config.startedAt)continue;
  const index=indices.get(norm(entry.subject||''));
  if(index===undefined)continue;
  const row=rows[index];row.sessions++;row.minutesCompleted+=entry.minutes;
  row.questionsTotal+=entry.questionsTotal??0;
  row.questionsCorrect+=entry.questionsCorrect??0;
  // Deterministic tiebreaker: if timestamps coincide, use record ID.
  if(!latest||entry.createdAt>latest.timestamp||
    (entry.createdAt===latest.timestamp&&entry.id>latest.id))
   latest={index,timestamp:entry.createdAt,id:entry.id};
 }
 for(const row of rows){
  row.minutesRemaining=Math.max(0,row.targetMinutes-row.minutesCompleted);
  row.percentComplete=Math.min(100,percentage(row.minutesCompleted,row.targetMinutes)??0);
  row.accuracyPercent=percentage(row.questionsCorrect,row.questionsTotal);
 }
 const remaining=rows.map((row,i)=>row.minutesRemaining>0?i:-1).filter(i=>i>=0);
 const completed=remaining.length===0;
 // Rotation skips completed subjects but doesn't require 100% to move to the next one.
 const start=latest?latest.index+1:0;
 let nextIndex:number|null=null;
 if(!completed)for(let offset=0;offset<rows.length;offset++){
  const index=(start+offset)%rows.length;
  if(rows[index].minutesRemaining>0){nextIndex=index;break;}
 }
 const next=nextIndex===null?null:rows[nextIndex];
 const insufficientData=rows.every(x=>x.sessions===0);
 let reason=completed?
  'Todas as metas deste ciclo foram cumpridas. Confirme a abertura de um novo ciclo para continuar.':
  insufficientData?
  'Sugestão inicial baseada na ordem configurada, ainda sem registros deste ciclo.':
  'Próxima matéria na rotação, pulando as que já atingiram a meta deste ciclo.';
 if(next&&next.questionsTotal>=10&&next.accuracyPercent!==null&&next.accuracyPercent<70)
  reason+=' Aproveitamento registrado abaixo de 70%; considere questões de revisão.';
 return {
  configured:true,startedAt:config.startedAt,subjects:rows,
  totalTargetMinutes:rows.reduce((a,b)=>a+b.targetMinutes,0),
  totalCompletedMinutes:rows.reduce((a,b)=>a+Math.min(b.targetMinutes,b.minutesCompleted),0),
  completed,suggestedSubject:next?.name??null,reason,insufficientData
 };
}
