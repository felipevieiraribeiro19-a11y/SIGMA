import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {validLabApiBase} from './jarvis-chat-protocol';
import {LabStudyCyclePanel} from './LabStudyCyclePanel';
import {LabProjectsPanel,type LabProject} from './LabProjectsPanel';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Kind='study'|'daily'|'task'|'finance';
type Entry={id:string;kind:Kind;title:string;notes:string;minutes:number;amount:number;done:boolean;createdAt:string;dueDate?:string;priority?:'low'|'normal'|'high';subject?:string;questionsTotal?:number;questionsCorrect?:number;projectId?:string};
type SubjectPerformance={subject:string;sessions:number;studiedMinutes:number;questionsTotal:number;questionsCorrect:number;questionsWrong:number;accuracyPercent:number|null};
type StudyPerformance={overall:SubjectPerformance;today:SubjectPerformance;subjects:SubjectPerformance[];unclassifiedSessions:number;disclaimer:string};
type DayBriefing={studyPerformance:StudyPerformance;date:string;studyMinutesToday:number;studySessionsToday:number;financeNetToday:number;financeEntriesToday:number;tasksCompletedToday:number;openTasks:number;overdueTasks:number;dueToday:number;dueNext7Days:number;undatedTasks:number;highlightedTasks:{id:string;title:string;dueDate:string|null;priority:string;group:string}[];latestDiary:{title:string;date:string}|null;guidance:string[];limitation:string};
type Totals={studiedMinutes:number;financialBalance:number;tasksOpen:number;tasksDone:number};
const labels:Record<Kind,string>={study:'Estudos',daily:'Diário e rotina',task:'Tarefas',finance:'Finanças'};
export function LabEcosystemPanel({user}:{user:User|null}){
 const [entries,setEntries]=useState<Entry[]>([]);
 const [totals,setTotals]=useState<Totals|null>(null);
 const [projects,setProjects]=useState<LabProject[]>([]);
 const [selectedProjectId,setSelectedProjectId]=useState('');
 const [kind,setKind]=useState<Kind>('study');
 const [title,setTitle]=useState('');
 const [notes,setNotes]=useState('');
 const [minutes,setMinutes]=useState('0');
 const [amount,setAmount]=useState('0');
 const [dueDate,setDueDate]=useState('');
 const [priority,setPriority]=useState<'low'|'normal'|'high'>('normal');
 const [subject,setSubject]=useState('');
 const [questionsTotal,setQuestionsTotal]=useState('');
 const [questionsCorrect,setQuestionsCorrect]=useState('');
 const [briefing,setBriefing]=useState<DayBriefing|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setEntries([]);setTotals(null);setBriefing(null);setProjects([]);setSelectedProjectId('');setError('');setNotice('');},[user?.uid]);
 async function call(path:string,method='GET',body?:unknown):Promise<any>{
  if(!user||!api)throw Error('Entre com Google no laboratório.');
  const token=await user.getIdToken();
  const response=await fetch(api+'/api/lab/workspace'+path,{method,cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data:any=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.error||'Não foi possível acessar os registros.');
  return data;
 }
 async function reload(){
  const [records,today,projectData]=await Promise.all([call(''),call('/briefing'),call('/projects')]);
  setEntries(Array.isArray(records.entries)?records.entries:[]);
  setTotals(records.totals||null);
  setBriefing(today as DayBriefing);
  const all:LabProject[]=Array.isArray(projectData.projects)?projectData.projects:[];
  setProjects(all);
  setSelectedProjectId(current=>current&&!all.some(p=>p.id===current&&p.status!=='archived')?'':current);
 }
 async function refresh(){
  if(!user||busy)return;
  setBusy(true);setError('');
  try{await reload();}
  catch(e){setError(e instanceof Error?e.message:'Erro na consulta.');}
  finally{setBusy(false);}
 }
 async function add(){
  if(!user||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   if(kind==='study'&&(questionsTotal!==''||questionsCorrect!=='')&&
      (questionsTotal===''||questionsCorrect===''))
    throw Error('Preencha tanto o total de questões quanto a quantidade de acertos.');
   await call('','POST',{kind,title,notes,minutes:Number(minutes),amount:Number(amount),done:false,
    ...(selectedProjectId?{projectId:selectedProjectId}:{}),
    ...(kind==='task'?{...(dueDate?{dueDate}:{}),priority}:{}),
    ...(kind==='study'?{...(subject.trim()?{subject:subject.trim()}:{}),
     ...(questionsTotal!==''&&questionsCorrect!==''?{
      questionsTotal:Number(questionsTotal),questionsCorrect:Number(questionsCorrect)
     }:{} )}:{})});
   await reload();
   setTitle('');setNotes('');setMinutes('0');setAmount('0');setDueDate('');setPriority('normal');setSubject('');setQuestionsTotal('');setQuestionsCorrect('');setNotice('Registro salvo na sua área experimental.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
  finally{setBusy(false);}
 }
 async function mutate(entry:Entry,remove=false){
  if(busy)return;
  if(remove&&!window.confirm('Excluir este registro do laboratório?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   await call('/'+entry.id,remove?'DELETE':'PATCH',remove?undefined:{
    kind:entry.kind,title:entry.title,notes:entry.notes,minutes:entry.minutes,
    amount:entry.amount,done:!entry.done,
    ...(entry.projectId?{projectId:entry.projectId}:{}),
    ...(entry.kind==='task'?{...(entry.dueDate?{dueDate:entry.dueDate}:{}),priority:entry.priority||'normal'}:{}),
    ...(entry.kind==='study'?{...(entry.subject?{subject:entry.subject}:{}),
     ...(entry.questionsTotal!==undefined?{
      questionsTotal:entry.questionsTotal,questionsCorrect:entry.questionsCorrect??0
     }:{} )}:{})
   });
   await reload();
   setNotice(remove?'Registro excluído.':'Status da tarefa atualizado.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar.');}
  finally{setBusy(false);}
 }
 return <div className="lab-workspace">
  <p>Registre informações estruturadas, separadas do chat. Nada é criado automaticamente a partir de mensagens.</p>
  <LabProjectsPanel user={user} projects={projects} selectedId={selectedProjectId}
   onSelect={setSelectedProjectId} onRefresh={reload}/>
  <div className="lab-workspace-stats">
   <span>Estudado: <strong>{totals?Math.round(totals.studiedMinutes/6)/10+' h':'—'}</strong></span>
   <span>Tarefas abertas: <strong>{totals?.tasksOpen??'—'}</strong></span>
   <span>Saldo manual: <strong>{totals?totals.financialBalance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}</strong></span>
  </div>
  <button type="button" disabled={busy||!user||!api} onClick={()=>void refresh()}>Atualizar meus registros e resumo de hoje</button>
  {briefing&&<section aria-label="Resumo diário" className="lab-workspace-form">
   <h3>Resumo de hoje — {briefing.date.split('-').reverse().join('/')}</h3>
   <div className="lab-workspace-stats">
    <span>Estudo registrado hoje: <strong>{briefing.studyMinutesToday} min</strong></span>
    <span>Tarefas abertas: <strong>{briefing.openTasks}</strong></span>
    <span>Vencidas: <strong>{briefing.overdueTasks}</strong></span>
    <span>Para hoje: <strong>{briefing.dueToday}</strong></span>
    <span>Próximos 7 dias: <strong>{briefing.dueNext7Days}</strong></span>
    <span>Saldo dos registros de hoje: <strong>{briefing.financeNetToday.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></span>
   </div>
   {briefing.guidance.length>0&&<ul>{briefing.guidance.map((x,i)=><li key={i}>{x}</li>)}</ul>}
   {briefing.highlightedTasks.length>0&&<>
    <strong>Pendências para conferir (até 6)</strong>
    <ul className="lab-workspace-list">{briefing.highlightedTasks.map(x=><li key={x.id}>
     <strong>{x.title}</strong>
     <small>{x.group==='overdue'?'Vencida':x.group==='today'?'Para hoje':x.group==='week'?'Nos próximos 7 dias':x.group==='later'?'Prazo futuro':'Sem prazo'}
      {x.dueDate?' · '+x.dueDate.split('-').reverse().join('/'):''}
      {' · Prioridade '+(x.priority==='high'?'alta':x.priority==='low'?'baixa':'normal')}</small>
    </li>)}</ul>
   </>}
   <small>{briefing.limitation}</small>
  </section>}
  {briefing&&<section className="lab-workspace-form" aria-label="Desempenho nas questões">
   <h3>Estudos — desempenho nas questões</h3>
   <div className="lab-workspace-stats">
    <span>Questões registradas hoje: <strong>{briefing.studyPerformance.today.questionsTotal}</strong></span>
    <span>Acertos hoje: <strong>{briefing.studyPerformance.today.questionsCorrect}</strong></span>
    <span>Aproveitamento hoje: <strong>{briefing.studyPerformance.today.accuracyPercent===null?'Sem questões':briefing.studyPerformance.today.accuracyPercent+'%'}</strong></span>
    <span>Questões acumuladas: <strong>{briefing.studyPerformance.overall.questionsTotal}</strong></span>
    <span>Aproveitamento geral: <strong>{briefing.studyPerformance.overall.accuracyPercent===null?'Sem questões':briefing.studyPerformance.overall.accuracyPercent+'%'}</strong></span>
   </div>
   {briefing.studyPerformance.subjects.length>0&&<>
    <strong>Resultados por matéria</strong>
    <ul className="lab-workspace-list">{briefing.studyPerformance.subjects.map(item=><li key={item.subject}>
     <strong>{item.subject}</strong>
     <small>{item.studiedMinutes} min · {item.questionsTotal} questão(ões)
      {' · '}{item.questionsCorrect} acerto(s), {item.questionsWrong} erro(s)
      {' · '}{item.accuracyPercent===null?'Sem questões para calcular a taxa':item.accuracyPercent+'% de acerto'}</small>
    </li>)}</ul>
   </>}
   <small>{briefing.studyPerformance.disclaimer}</small>
  </section>}
  <LabStudyCyclePanel user={user}/>
  <div className="lab-workspace-form">
   <label>Projeto deste registro<select value={selectedProjectId}
    onChange={e=>setSelectedProjectId(e.target.value)}>
    <option value="">Sem projeto (registro geral)</option>
    {projects.filter(p=>p.status!=='archived').map(p=><option key={p.id} value={p.id}>
     {p.title}{p.status==='paused'?' (pausado)':''}</option>)}
   </select></label>
   {selectedProjectId&&<p role="status">Os novos registros serão vinculados a este projeto. A lista abaixo exibirá somente seus registros.</p>}
   <label>Categoria<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(labels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
   <label>Assunto ou título<input maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Contabilidade — revisão de exercícios"/></label>
   <label>Observações<textarea rows={3} maxLength={1500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Detalhes, progresso, próximos passos"/></label>
   {kind==='study'&&<>
    <label>Minutos de estudo<input type="number" min="0" max="1440" step="1" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
    <label>Matéria (opcional)<input value={subject} maxLength={80} onChange={e=>setSubject(e.target.value)}
     placeholder="Ex.: Contabilidade, Português, AFO"/></label>
    <label>Questões resolvidas (opcional)<input type="number" min="0" max="5000" step="1" value={questionsTotal}
     onChange={e=>setQuestionsTotal(e.target.value)} placeholder="Ex.: 20"/></label>
    <label>Questões certas (opcional)<input type="number" min="0" max="5000" step="1" value={questionsCorrect}
     onChange={e=>setQuestionsCorrect(e.target.value)} placeholder="Ex.: 15"/></label>
   </>}
   {kind==='finance'&&<label>Valor em reais (despesa negativa)<input type="number" min="-1000000" max="1000000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   {kind==='task'&&<>
    <label>Prazo da tarefa (opcional)<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
    <label>Prioridade da tarefa<select value={priority} onChange={e=>setPriority(e.target.value as 'low'|'normal'|'high')}>
     <option value="normal">Normal</option><option value="high">Alta</option><option value="low">Baixa</option>
    </select></label>
   </>}
   <button type="button" disabled={!user||busy||title.trim().length<2} onClick={()=>void add()}>Salvar registro</button>
  </div>
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="lab-error" role="alert">{error}</p>}
  {entries.length>0&&<ul className="lab-workspace-list">{entries.filter(e=>!selectedProjectId||e.projectId===selectedProjectId).map(e=><li key={e.id}>
   <strong>{labels[e.kind]} — {e.title}</strong>
   {e.projectId&&<small>Projeto: {projects.find(p=>p.id===e.projectId)?.title||'Projeto não localizado'}</small>}
   <small>{new Date(e.createdAt).toLocaleDateString('pt-BR')}{e.kind==='study'?' · '+e.minutes+' min':''}{e.kind==='study'&&e.subject?' · '+e.subject:''}{e.kind==='study'&&e.questionsTotal!==undefined?' · '+e.questionsCorrect+'/'+e.questionsTotal+' questões certas':''}{e.kind==='finance'?' · '+e.amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):''}{e.kind==='task'&&e.dueDate?' · Prazo '+e.dueDate.split('-').reverse().join('/'):''}{e.kind==='task'&&e.priority==='high'?' · Prioridade alta':''}</small>
   {e.notes&&<p>{e.notes}</p>}
   {e.kind==='task'&&<button type="button" disabled={busy} onClick={()=>void mutate(e)}>{e.done?'Marcar pendente':'Marcar concluída'}</button>}
   <button type="button" disabled={busy} onClick={()=>void mutate(e,true)}>Excluir</button>
  </li>)}</ul>}
 </div>;
}
