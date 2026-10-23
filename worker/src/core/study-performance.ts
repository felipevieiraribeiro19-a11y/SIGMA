/** Deterministic study performance from manual SIGMA LAB records (no AI or third-party calls). */
import type {WorkspaceEntry} from '../lab-workspace';

export type SubjectPerformance={
 subject:string;
 sessions:number;
 studiedMinutes:number;
 questionsTotal:number;
 questionsCorrect:number;
 questionsWrong:number;
 accuracyPercent:number|null;
};
export type StudyPerformance={
 overall:SubjectPerformance;
 today:SubjectPerformance;
 subjects:SubjectPerformance[];
 unclassifiedSessions:number;
 disclaimer:string;
};
const percent=(correct:number,total:number)=>total>0?Math.round(correct/total*1000)/10:null;
const blank=(subject:string):SubjectPerformance=>({
 subject,sessions:0,studiedMinutes:0,
 questionsTotal:0,questionsCorrect:0,questionsWrong:0,accuracyPercent:null
});
const accumulate=(target:SubjectPerformance,entry:WorkspaceEntry)=>{
 target.sessions++;
 target.studiedMinutes+=entry.minutes;
 const attempted=entry.questionsTotal??0;
 const correct=entry.questionsCorrect??0;
 target.questionsTotal+=attempted;
 target.questionsCorrect+=correct;
 target.questionsWrong+=attempted-correct;
 target.accuracyPercent=percent(target.questionsCorrect,target.questionsTotal);
};
const key=(subject:string)=>subject.toLocaleLowerCase('pt-BR')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/\s+/g,' ').trim();

export function buildStudyPerformance(
 entries:readonly WorkspaceEntry[],
 today:string,
 localDate:(value:Date)=>string
):StudyPerformance{
 const all=blank('Total de estudos');
 const daily=blank('Hoje');
 const perSubject=new Map<string,SubjectPerformance>();
 let unclassifiedSessions=0;
 for(const entry of entries){
  if(entry.kind!=='study')continue;
  accumulate(all,entry);
  if(localDate(new Date(entry.createdAt))===today)accumulate(daily,entry);
  const subject=entry.subject?.trim()||'Sem matéria informada';
  if(!entry.subject?.trim())unclassifiedSessions++;
  const slug=key(subject);
  let item=perSubject.get(slug);
  if(!item){item=blank(subject);perSubject.set(slug,item);}
  accumulate(item,entry);
 }
 return {
  overall:all,today:daily,unclassifiedSessions,
  subjects:[...perSubject.values()].sort((a,b)=>
   b.questionsTotal-a.questionsTotal||b.studiedMinutes-a.studiedMinutes||
   a.subject.localeCompare(b.subject,'pt-BR')),
  disclaimer:'Estatísticas calculadas apenas com questões e horas registradas manualmente no SIGMA. '+
   'Questões não registradas não são contabilizadas. Sem integração automática com Gran Questões.'
 };
}
