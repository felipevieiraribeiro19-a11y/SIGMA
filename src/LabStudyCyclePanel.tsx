import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {validLabApiBase} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type CycleSubject={name:string;targetMinutes:number};
type CycleDetail=CycleSubject&{
 minutesCompleted:number;minutesRemaining:number;percentComplete:number;
 sessions:number;questionsTotal:number;questionsCorrect:number;accuracyPercent:number|null;
};
type CycleSummary={
 configured:boolean;startedAt:string|null;subjects:CycleDetail[];totalTargetMinutes:number;
 totalCompletedMinutes:number;completed:boolean;suggestedSubject:string|null;
 reason:string;insufficientData:boolean;
};
export function LabStudyCyclePanel({user}:{user:User|null}){
 const [subjects,setSubjects]=useState<CycleSubject[]>([]);
 const [name,setName]=useState('');
 const [targetMinutes,setTargetMinutes]=useState('120');
 const [summary,setSummary]=useState<CycleSummary|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{setSubjects([]);setSummary(null);setError('');setMessage('');},[user?.uid]);

 async function call(path='',method='GET',body?:unknown):Promise<any>{
  if(!user||!api)throw Error('Entre no laboratório para configurar seu ciclo.');
  const jwt=await user.getIdToken();
  const response=await fetch(api+'/api/lab/workspace/cycle'+path,{
   method,cache:'no-store',headers:{Authorization:'Bearer '+jwt,
    ...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data:unknown=await response.json().catch(()=>null);
  if(!response.ok)throw Error((data as {error?:string}|null)?.error||'Falha ao acessar o ciclo.');
  return data;
 }
 async function execute(action:()=>Promise<void>){
  if(busy||!user)return;
  setBusy(true);setError('');setMessage('');
  try{await action();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir a operação.');}
  finally{setBusy(false);}
 }
 async function load(){
  await execute(async()=>{
   const data=await call();
   setSubjects(data.config?.subjects||[]);
   setSummary(data.summary||null);
   setMessage('Ciclo carregado do SIGMA. Alterações no formulário só são salvas ao confirmar.');
  });
 }
 function addSubject(){
  const clean=name.trim().replace(/\s+/g,' ');
  const mins=Number(targetMinutes);
  if(clean.length<2||clean.length>80||!Number.isSafeInteger(mins)||
    mins<30||mins>720||mins%15!==0){
   setError('Informe uma matéria e meta entre 30 e 720 minutos, em múltiplos de 15.');
   return;
  }
  const normalized=(v:string)=>v.toLocaleLowerCase('pt-BR').normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'');
  if(subjects.some(s=>normalized(s.name)===normalized(clean))){
   setError('Esta matéria já está no ciclo.');return;
  }
  if(subjects.length>=12){setError('Limite de 12 matérias por ciclo.');return;}
  setSubjects(prev=>[...prev,{name:clean,targetMinutes:mins}]);
  setName('');setError('');setMessage('Matéria adicionada ao formulário. Salve para aplicar.');
 }
 async function save(){
  await execute(async()=>{
   if(!subjects.length)throw Error('Adicione pelo menos uma matéria antes de salvar.');
   await call('','PUT',{subjects});
   const updated=await call();
   setSubjects(updated.config?.subjects||[]);
   setSummary(updated.summary||null);
   setMessage('Ciclo salvo. O início do ciclo atual foi preservado.');
  });
 }
 async function reset(){
  if(!summary?.configured)return;
  if(!window.confirm('Começar um novo ciclo? Os registros antigos serão mantidos, mas o progresso do ciclo será reiniciado.'))return;
  await execute(async()=>{
   await call('/reset','POST',{confirm:true});
   const updated=await call();
   setSummary(updated.summary||null);
   setMessage('Novo ciclo iniciado. O histórico de estudo foi preservado.');
  });
 }
 return <section className="lab-workspace-form" aria-label="Ciclo de estudos">
  <h3>Ciclo de estudos — rotação de matérias</h3>
  <p>Organize as matérias por ordem e defina metas de minutos. A rotação sugere a próxima matéria a partir do que você registrou, sem bloquear mudanças de assunto.</p>
  <button type="button" disabled={!user||busy} onClick={()=>void load()}>Carregar e atualizar ciclo</button>
  {summary?.configured&&<>
   <p role="status"><strong>Próxima matéria sugerida:</strong> {summary.suggestedSubject||'Todas as metas atingidas'}</p>
   <p>{summary.reason}</p>
   <small>Progresso: {summary.totalCompletedMinutes} de {summary.totalTargetMinutes} minutos. Ciclo iniciado em {summary.startedAt?.slice(0,10).split('-').reverse().join('/')}.</small>
   <ul className="lab-workspace-list">{summary.subjects.map(s=><li key={s.name}>
    <strong>{s.name}</strong>
    <small>{s.minutesCompleted} / {s.targetMinutes} min · {s.percentComplete}% da meta
     {' · '}{s.questionsTotal===0?'Sem questões registradas':s.questionsTotal+' questões, '+s.accuracyPercent+'% de acerto'}</small>
   </li>)}</ul>
   <button type="button" disabled={busy} onClick={()=>void reset()}>Iniciar novo ciclo (preserva histórico)</button>
  </>}
  {!summary?.configured&&<small>Nenhum ciclo carregado. Você pode adicionar matérias e salvar a configuração quando quiser.</small>}
  <div>
   <label>Nova matéria<input maxLength={80} value={name}
    onChange={e=>setName(e.target.value)} placeholder="Ex.: Contabilidade"/></label>
   <label>Meta por ciclo (minutos)<input type="number" min="30" max="720" step="15"
    value={targetMinutes} onChange={e=>setTargetMinutes(e.target.value)}/></label>
   <button type="button" disabled={busy||subjects.length>=12}
    onClick={addSubject}>Adicionar ao ciclo</button>
  </div>
  {subjects.length>0&&<ol>{subjects.map((s,i)=><li key={s.name}>
   {s.name} — {s.targetMinutes} min
   {' '}
   <button type="button" disabled={busy} onClick={()=>{
    setSubjects(prev=>prev.filter((_,idx)=>idx!==i));
    setMessage('Alteração no formulário. Salve para aplicar.');
   }}>Retirar</button>
  </li>)}</ol>}
  <button type="button" disabled={busy||!user||subjects.length===0}
   onClick={()=>void save()}>Salvar configuração do ciclo</button>
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert" className="lab-error">{error}</p>}
  <small>Apenas registros com uma matéria correspondente entram no progresso. Não altera sua agenda, não inicia estudos sozinho e não utiliza IA paga.</small>
 </section>;
}
