import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {validLabApiBase} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
export type EntryKind='fato'|'preferencia'|'correcao'|'rotina';
type Entry={id:string;text:string;kind:EntryKind;createdAt:string;updatedAt:string};
const KINDS:EntryKind[]=['fato','preferencia','correcao','rotina'];
const KIND_LABEL:Record<EntryKind,string>={fato:'Fato',preferencia:'Preferência',correcao:'Correção',rotina:'Rotina'};
/** Registros antigos não têm kind; o servidor já normaliza, isto é a segunda barreira. */
const safeKind=(value:unknown):EntryKind=>
 typeof value==='string'&&(KINDS as string[]).includes(value)?value as EntryKind:'fato';
type ApiBody={entries?:Entry[];entry?:Entry;error?:string};
function safeEntries(value:unknown):Entry[]{
 const raw=(value as ApiBody|null)?.entries;
 if(!Array.isArray(raw)||raw.length>30)throw Error('Lista de memórias inválida.');
 return raw.map(entry=>{
  if(!entry||typeof entry.id!=='string'||!/^[-a-f0-9]{36}$/i.test(entry.id)||
   typeof entry.text!=='string'||entry.text.length>500||
   typeof entry.createdAt!=='string'||typeof entry.updatedAt!=='string')
   throw Error('Registro de memória inválido.');
  return {...entry,kind:safeKind((entry as {kind?:unknown}).kind)};
 });
}
/**
 * Explicit, owner-controlled memories. No automatic chat capture, no Firestore,
 * no access to productions tools. Displayed only after the owner's request.
 */
export function LabRealMemory({user}:{user:User|null}){
 const [entries,setEntries]=useState<Entry[]>([]);
 const [draft,setDraft]=useState('');
 const [draftKind,setDraftKind]=useState<EntryKind>('fato');
 const [confirmed,setConfirmed]=useState(false);
 const [connected,setConnected]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [editing,setEditing]=useState<string|null>(null);
 const [editText,setEditText]=useState('');
 const [editKind,setEditKind]=useState<EntryKind>('fato');
 const [eraseConfirmed,setEraseConfirmed]=useState(false);
 useEffect(()=>{
  setEntries([]);setDraft('');setDraftKind('fato');setConfirmed(false);setConnected(false);
  setEditing(null);setError('');setEraseConfirmed(false);
 },[user?.uid]);

 async function call(method:string,path='',text?:string,kind?:EntryKind):Promise<unknown>{
  if(!user||!api)throw Error('Faça login Google para usar a memória.');
  const token=await user.getIdToken();
  const res=await fetch(api+'/api/lab/memory'+path,{
   method,cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(text===undefined?{}:{'Content-Type':'application/json'})},
   ...(text===undefined?{}:{body:JSON.stringify({text,...(kind?{kind}:{})})})
  });
  const body=await res.json().catch(()=>null) as ApiBody|null;
  if(!res.ok)throw Error(typeof body?.error==='string'?body.error:'Memória indisponível.');
  return body;
 }
 async function refresh(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const body=await call('GET');
   setEntries(safeEntries(body));
   setConnected(true);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao carregar.');setConnected(false);}
  finally{setBusy(false);}
 }
 async function create(){
  if(!confirmed||draft.trim().length<3||busy)return;
  setBusy(true);setError('');
  try{
   await call('POST','',draft.trim(),draftKind);
   const body=await call('GET');
   setEntries(safeEntries(body));setDraft('');setDraftKind('fato');setConfirmed(false);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}
  finally{setBusy(false);}
 }
 async function edit(id:string){
  if(editText.trim().length<3||busy)return;
  setBusy(true);setError('');
  try{
   await call('PATCH','/'+id,editText.trim(),editKind);
   const body=await call('GET');
   setEntries(safeEntries(body));setEditing(null);setEditText('');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar.');}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  if(busy||!window.confirm('Apagar esta memória do SIGMA?'))return;
  setBusy(true);setError('');
  try{
   await call('DELETE','/'+id);
   setEntries(x=>x.filter(item=>item.id!==id));
   if(editing===id)setEditing(null);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao apagar.');}
  finally{setBusy(false);}
 }
 async function eraseAll(){
  if(!eraseConfirmed||busy||!window.confirm('Apagar TODAS as memórias do SIGMA?'))return;
  setBusy(true);setError('');
  try{await call('DELETE');setEntries([]);setEraseConfirmed(false);}
  catch(e){setError(e instanceof Error?e.message:'Falha ao apagar.');}
  finally{setBusy(false);}
 }
 return <section className="lab-real-memory" aria-label="Memória pessoal">
  <h3>Memória pessoal</h3>
  <p>As informações são guardadas somente após você aprovar o registro. Quando habilitada, esta memória permanece entre visitas e pode ser editada ou apagada. Não é histórico de conversas. Se você ativar a consulta contextual no chat, as notas relevantes poderão ser enviadas ao Gemini nas próximas perguntas.</p>
  <p className="lab-memory-warning">Use apenas dados fictícios nos primeiros testes. Não registre senhas ou informações sensíveis.</p>
  {!user&&<p>Entre com Google para consultar a memória experimental.</p>}
  {!api&&<p>Integração com o laboratório ainda não preparada.</p>}
  {api&&user&&!connected&&<button type="button" disabled={busy} onClick={()=>void refresh()}>
    {busy?'Consultando…':'Consultar minhas memórias'}
  </button>}
  {connected&&<div>
   <p role="status">{entries.length} de 30 registros. Não há gravação automática.</p>
   <label htmlFor="lab-memory-kind">Tipo da memória</label>
   <select id="lab-memory-kind" value={draftKind} disabled={busy}
    onChange={e=>{setDraftKind(safeKind(e.target.value));setConfirmed(false);}}>
    {KINDS.map(kind=><option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
   </select>
   <label htmlFor="lab-memory-draft">Nova memória aprovada por você</label>
   <textarea id="lab-memory-draft" rows={3} maxLength={500}
    placeholder="Informação que você deseja que o SIGMA lembre…"
    value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);setConfirmed(false);}}/>
   <label className="lab-memory-consent"><input type="checkbox" checked={confirmed} disabled={busy}
     onChange={e=>setConfirmed(e.target.checked)}/>
     Aprovo salvar exatamente este texto na memória experimental.</label>
   <button type="button" disabled={busy||!confirmed||draft.trim().length<3||entries.length>=30}
    onClick={()=>void create()}>Salvar memória aprovada</button>
   {entries.length===0&&<p>Nenhuma memória registrada.</p>}
   <ul className="lab-memory-entries">{entries.map(item=><li key={item.id}>
    {editing===item.id?<div>
     <select value={editKind} disabled={busy} aria-label="Tipo da memória"
      onChange={e=>setEditKind(safeKind(e.target.value))}>
      {KINDS.map(kind=><option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
     </select>
     <textarea rows={3} maxLength={500} value={editText} disabled={busy}
      onChange={e=>setEditText(e.target.value)}/>
     <div className="lab-memory-actions">
      <button type="button" disabled={busy||editText.trim().length<3}
       onClick={()=>void edit(item.id)}>Salvar correção</button>
      <button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button>
     </div>
    </div>:<><p><small className="lab-memory-kind">{KIND_LABEL[item.kind]}</small> {item.text}</p><div className="lab-memory-actions">
      <button type="button" disabled={busy} onClick={()=>{setEditing(item.id);setEditText(item.text);setEditKind(item.kind);}}>Editar</button>
      <button type="button" disabled={busy} className="memory-delete" onClick={()=>void remove(item.id)}>Excluir</button>
     </div></>}
   </li>)}</ul>
   {entries.length>0&&<div className="lab-memory-danger">
    <label><input type="checkbox" checked={eraseConfirmed} disabled={busy}
      onChange={e=>setEraseConfirmed(e.target.checked)}/>
      Entendo que esta ação excluirá todas as memórias do SIGMA.</label>
    <button type="button" className="memory-delete" disabled={!eraseConfirmed||busy}
      onClick={()=>void eraseAll()}>Excluir todas as memórias</button>
   </div>}
   <button type="button" disabled={busy} onClick={()=>void refresh()}>Atualizar lista</button>
  </div>}
  {error&&<p className="lab-error" role="alert">{error}</p>}
 </section>;
}
