import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {connectLabGoogleWrite} from './jarvis-lab-auth';
import {validLabApiBase} from './jarvis-chat-protocol';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Op='calendar.create'|'drive.folder.create'|'notion.page.create';
type Action={id:string;data:{operation:Op;title:string;start?:string;end?:string;parentId?:string};status:string;expiresAt:string;providerId?:string};
export function LabActionCenter({user}:{user:User|null}){
 const [operation,setOperation]=useState<Op>('calendar.create'),[title,setTitle]=useState('');
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[parentId,setParentId]=useState('');
 const [googleToken,setGoogleToken]=useState<string|null>(null);
 const [action,setAction]=useState<Action|null>(null),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setAction(null);setGoogleToken(null);setError('');},[user?.uid]);
 async function connect(){
  if(busy)return;
  setBusy(true);setError('');
  try{setGoogleToken(await connectLabGoogleWrite());setNotice('Permissões Google recebidas somente para esta sessão.');}
  catch(e){setError(e instanceof Error?e.message:'Falha na conexão Google.');}
  finally{setBusy(false);}
 }
 async function request(path:string,method:string,body?:unknown){
  if(!api||!user)throw Error('Faça login Google antes de confirmar ações.');
  const id=await user.getIdToken();
  const response=await fetch(api+'/api/lab/actions/'+path,{method,cache:'no-store',
   headers:{Authorization:'Bearer '+id,
    ...(body===undefined?{}:{'Content-Type':'application/json'}),
    ...(googleToken?{'X-Google-Token':googleToken}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const obj:any=await response.json().catch(()=>null);
  if(!response.ok)throw Error(obj?.error||'Serviço não confirmou a operação.');
  return obj;
 }
 async function propose(){
  if(busy)return;setBusy(true);setError('');setNotice('');setAction(null);
  try{
   const data:any={operation,title};
   if(operation==='calendar.create'){
    if(!start||!end)throw Error('Preencha início e fim do evento.');
    data.start=new Date(start).toISOString();data.end=new Date(end).toISOString();
   }
   if(operation==='notion.page.create'||(operation==='drive.folder.create'&&parentId.trim()))data.parentId=parentId.trim();
   const result=await request('prepare','POST',data);
   setAction(result.action);setNotice('Proposta criada. Ela ainda NÃO foi executada.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar.');}
  finally{setBusy(false);}
 }
 async function confirm(){
  if(!action||busy)return;setBusy(true);setError('');setNotice('');
  try{
   const result=await request('confirm/'+action.id,'POST',{confirmed:true});
   setAction(result.action);
   if(result.action.status==='succeeded')setNotice('O serviço confirmou a criação.');
   else if(result.action.status==='uncertain')setNotice('Resultado incerto. Verifique diretamente no serviço antes de tentar novamente.');
   else setNotice('A operação não foi confirmada pelo serviço. Confira as permissões.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar.');}
  finally{setBusy(false);}
 }
 async function status(){
  if(!action||busy)return;setBusy(true);setError('');
  try{const data=await request('status/'+action.id,'GET');setAction(data.action);}
  catch(e){setError(e instanceof Error?e.message:'Falha ao consultar ação.');}
  finally{setBusy(false);}
 }
 return <div className="lab-actions">
  <p>Ações externas são opcionais e exigem duas etapas: <strong>preparar</strong> e <strong>confirmar</strong>. Não há execução por comando de chat, automação oculta ou repetição automática.</p>
  <div className="lab-workspace-form">
   <label>Operação<select value={operation} onChange={e=>{setOperation(e.target.value as Op);setAction(null);}}>
    <option value="calendar.create">Criar evento no Google Calendar</option>
    <option value="drive.folder.create">Criar pasta no Google Drive</option>
    <option value="notion.page.create">Criar página dentro do Notion</option>
   </select></label>
   <label>Título<input value={title} maxLength={130} onChange={e=>setTitle(e.target.value)}/></label>
   {operation==='calendar.create'&&<>
    <label>Início<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>Fim<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label>
   </>}
   {operation==='notion.page.create'&&<label>ID da página-mãe do Notion<input value={parentId} placeholder="UUID da página compartilhada" onChange={e=>setParentId(e.target.value)}/></label>}
   {operation==='drive.folder.create'&&<label>ID da pasta-mãe do Drive (opcional)<input value={parentId} onChange={e=>setParentId(e.target.value)}/></label>}
   {operation!=='notion.page.create'&&<button type="button" disabled={busy||!user} onClick={()=>void connect()}>{googleToken?'Renovar permissões Google':'Autorizar criação no Google'}</button>}
   <button type="button" disabled={busy||!user||title.trim().length<3} onClick={()=>void propose()}>1. Preparar e revisar proposta</button>
  </div>
  {action&&<div className="lab-learning-proposal">
   <strong>Proposta #{action.id.slice(0,8)}</strong>
   <p><strong>Operação:</strong> {action.data.operation}</p>
   <p><strong>Nome:</strong> {action.data.title}</p>
   {action.data.start&&<p>De {action.data.start} até {action.data.end}</p>}
   {action.data.parentId&&<p>Destino: {action.data.parentId}</p>}
   <p><strong>Status:</strong> {action.status}</p>
   {action.status==='pending'&&<>
    <p>Até {new Date(action.expiresAt).toLocaleString('pt-BR')}. Confirmar enviará esta ação ao serviço indicado.</p>
    <button type="button" disabled={busy||(!googleToken&&operation!=='notion.page.create')} onClick={()=>void confirm()}>2. Confirmar criação real</button>
    <button type="button" onClick={()=>{setAction(null);setNotice('Proposta descartada sem execução.');}}>Cancelar proposta</button>
   </>}
   {action.status!=='pending'&&<button type="button" disabled={busy} onClick={()=>void status()}>Consultar status, sem repetir a criação</button>}
  </div>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="lab-error" role="alert">{error}</p>}
 </div>;
}
