import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {validLabApiBase} from './jarvis-chat-protocol';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Kind='study'|'daily'|'task'|'finance';
type Entry={id:string;kind:Kind;title:string;notes:string;minutes:number;amount:number;done:boolean;createdAt:string};
type Totals={studiedMinutes:number;financialBalance:number;tasksOpen:number;tasksDone:number};
const labels:Record<Kind,string>={study:'Estudos',daily:'Diário e rotina',task:'Tarefas',finance:'Finanças'};
export function LabEcosystemPanel({user}:{user:User|null}){
 const [entries,setEntries]=useState<Entry[]>([]);
 const [totals,setTotals]=useState<Totals|null>(null);
 const [kind,setKind]=useState<Kind>('study');
 const [title,setTitle]=useState('');
 const [notes,setNotes]=useState('');
 const [minutes,setMinutes]=useState('0');
 const [amount,setAmount]=useState('0');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setEntries([]);setTotals(null);setError('');setNotice('');},[user?.uid]);
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
 async function refresh(){
  if(!user||busy)return;
  setBusy(true);setError('');
  try{const data=await call('');setEntries(Array.isArray(data.entries)?data.entries:[]);setTotals(data.totals||null);}
  catch(e){setError(e instanceof Error?e.message:'Erro na consulta.');}
  finally{setBusy(false);}
 }
 async function add(){
  if(!user||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await call('','POST',{kind,title,notes,minutes:Number(minutes),amount:Number(amount),done:false});
   const data=await call('');
   setEntries(data.entries||[]);setTotals(data.totals||null);
   setTitle('');setNotes('');setMinutes('0');setAmount('0');setNotice('Registro salvo na sua área experimental.');
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
    amount:entry.amount,done:!entry.done
   });
   const data=await call('');
   setEntries(data.entries||[]);setTotals(data.totals||null);
   setNotice(remove?'Registro excluído.':'Status da tarefa atualizado.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar.');}
  finally{setBusy(false);}
 }
 return <div className="lab-workspace">
  <p>Registre informações estruturadas, separadas do chat. Nada é criado automaticamente a partir de mensagens.</p>
  <div className="lab-workspace-stats">
   <span>Estudado: <strong>{totals?Math.round(totals.studiedMinutes/6)/10+' h':'—'}</strong></span>
   <span>Tarefas abertas: <strong>{totals?.tasksOpen??'—'}</strong></span>
   <span>Saldo manual: <strong>{totals?totals.financialBalance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}</strong></span>
  </div>
  <button type="button" disabled={busy||!user||!api} onClick={()=>void refresh()}>Atualizar meus registros</button>
  <div className="lab-workspace-form">
   <label>Categoria<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(labels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
   <label>Assunto ou título<input maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Contabilidade — revisão de exercícios"/></label>
   <label>Observações<textarea rows={3} maxLength={1500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Detalhes, progresso, próximos passos"/></label>
   {kind==='study'&&<label>Minutos de estudo<input type="number" min="0" max="1440" step="1" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>}
   {kind==='finance'&&<label>Valor em reais (despesa negativa)<input type="number" min="-1000000" max="1000000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   <button type="button" disabled={!user||busy||title.trim().length<2} onClick={()=>void add()}>Salvar registro</button>
  </div>
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="lab-error" role="alert">{error}</p>}
  {entries.length>0&&<ul className="lab-workspace-list">{entries.map(e=><li key={e.id}>
   <strong>{labels[e.kind]} — {e.title}</strong>
   <small>{new Date(e.createdAt).toLocaleDateString('pt-BR')}{e.kind==='study'?' · '+e.minutes+' min':''}{e.kind==='finance'?' · '+e.amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):''}</small>
   {e.notes&&<p>{e.notes}</p>}
   {e.kind==='task'&&<button type="button" disabled={busy} onClick={()=>void mutate(e)}>{e.done?'Marcar pendente':'Marcar concluída'}</button>}
   <button type="button" disabled={busy} onClick={()=>void mutate(e,true)}>Excluir</button>
  </li>)}</ul>}
 </div>;
}
