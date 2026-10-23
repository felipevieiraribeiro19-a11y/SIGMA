/** Pure, low-cost morning overview from already approved manual records, no model or external API. */
import type {WorkspaceEntry} from '../lab-workspace';

export type TaskGroup='overdue'|'today'|'week'|'later'|'undated';
export type BriefingTask={
 id:string;title:string;dueDate:string|null;priority:'low'|'normal'|'high';group:TaskGroup;
};
export type DayBriefing={
 date:string;timeZone:'America/Sao_Paulo';
 studyMinutesToday:number;studySessionsToday:number;
 financeNetToday:number;financeEntriesToday:number;
 entriesToday:number;tasksCompletedToday:number;
 openTasks:number;overdueTasks:number;dueToday:number;dueNext7Days:number;undatedTasks:number;
 highlightedTasks:BriefingTask[];
 latestDiary:{title:string;date:string}|null;
 guidance:string[];
 limitation:string;
};
export function localDay(value:Date):string{
 if(!Number.isFinite(value.getTime()))throw Error('Data inválida para o resumo diário.');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 const get=(type:string)=>parts.find(x=>x.type===type)?.value||'';
 return [get('year'),get('month'),get('day')].join('-');
}
const dateOrder=(a:string,b:string)=>a.localeCompare(b);
const priorityWeight=(value:'low'|'normal'|'high')=>value==='high'?0:value==='normal'?1:2;
const groupWeight:Record<TaskGroup,number>={overdue:0,today:1,week:2,later:3,undated:4};
const safeDay=(timestamp:string)=>localDay(new Date(timestamp));
const centavos=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;

export function buildDailyBriefing(entries:readonly WorkspaceEntry[],now=new Date()):DayBriefing{
 const today=localDay(now),next7=new Date(today+'T12:00:00Z');
 next7.setUTCDate(next7.getUTCDate()+7);
 const end=localDay(next7);
 const todays=entries.filter(x=>safeDay(x.createdAt)===today);
 const studies=todays.filter(x=>x.kind==='study');
 const finances=todays.filter(x=>x.kind==='finance');
 const tasks=entries.filter(x=>x.kind==='task'&&!x.done);
 const items:BriefingTask[]=tasks.map(x=>{
  const dueDate=x.dueDate||null;
  const group:TaskGroup=!dueDate?'undated':
   dateOrder(dueDate,today)<0?'overdue':dueDate===today?'today':
   dateOrder(dueDate,end)<=0?'week':'later';
  return {id:x.id,title:x.title,dueDate,priority:x.priority||'normal',group};
 }).sort((a,b)=>groupWeight[a.group]-groupWeight[b.group]||
  priorityWeight(a.priority)-priorityWeight(b.priority)||
  (a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')||
  a.title.localeCompare(b.title,'pt-BR'));
 const latestDiary=entries.filter(x=>x.kind==='daily')
  .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null;
 const result:DayBriefing={
  date:today,timeZone:'America/Sao_Paulo',
  studyMinutesToday:studies.reduce((sum,x)=>sum+x.minutes,0),studySessionsToday:studies.length,
  financeNetToday:centavos(finances.reduce((sum,x)=>sum+x.amount,0)),
  financeEntriesToday:finances.length,entriesToday:todays.length,
  tasksCompletedToday:entries.filter(x=>x.kind==='task'&&x.done&&safeDay(x.updatedAt)===today).length,
  openTasks:items.length,overdueTasks:items.filter(x=>x.group==='overdue').length,
  dueToday:items.filter(x=>x.group==='today').length,
  dueNext7Days:items.filter(x=>x.group==='week').length,
  undatedTasks:items.filter(x=>x.group==='undated').length,
  highlightedTasks:items.slice(0,6),
  latestDiary:latestDiary?{title:latestDiary.title,date:safeDay(latestDiary.createdAt)}:null,
  guidance:[],
  limitation:'Este resumo usa apenas seus registros manuais no SIGMA. Google Calendar e tarefas externas ainda não foram consultados.'
 };
 if(result.overdueTasks>0)result.guidance.push('Confira as '+result.overdueTasks+' tarefa(s) com prazo já vencido.');
 if(result.dueToday>0)result.guidance.push('Você tem '+result.dueToday+' tarefa(s) com prazo para hoje.');
 if(result.openTasks>0&&result.undatedTasks>0)
  result.guidance.push('Há '+result.undatedTasks+' tarefa(s) sem prazo; defina datas quando fizer sentido.');
 if(result.studySessionsToday===0)result.guidance.push('Ainda não há registro de estudo para hoje.');
 if(result.openTasks===0)result.guidance.push('Nenhuma tarefa pendente registrada no SIGMA.');
 return result;
}
