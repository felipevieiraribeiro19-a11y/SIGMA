import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {assertLabReply,nextLabMessages,validLabApiBase,type LabChatMessage} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);

export function JarvisChatPanel({user}:{user:User|null}){
 const [history,setHistory]=useState<LabChatMessage[]>([]);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>{pending.current?.abort();},[]);
 useEffect(()=>{if(!user){pending.current?.abort();setHistory([]);setDraft('');}},[user]);
 async function send(){
  if(!user||!api||busy)return;
  let messages:LabChatMessage[];
  try{messages=nextLabMessages(history,draft);}
  catch(e){setError(e instanceof Error?e.message:'Mensagem inválida.');return;}
  const controller=new AbortController();pending.current=controller;
  setBusy(true);setError('');
  try{
   const token=await user.getIdToken();
   if(controller.signal.aborted)return;
   const response=await fetch(api+'/api/lab/chat',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({messages}),signal:controller.signal,cache:'no-store'
   });
   const result:unknown=await response.json().catch(()=>null);
   if(!response.ok){
    const reason=(result as {error?:unknown}|null)?.error;
    throw Error(typeof reason==='string'?reason:'O laboratório não respondeu.');
   }
   const answer=assertLabReply(result);
   if(!controller.signal.aborted){setHistory([...messages,{role:'assistant',text:answer}]);setDraft('');}
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Erro de conexão.');
  }finally{
   if(pending.current===controller){pending.current=null;setBusy(false);}
  }
 }
 return <div className="lab-chat">
  <h3>Conversa com Gemini (Etapa 14)</h3>
  <p>Conversa temporária: não fica salva, não lê Agenda ou Drive, não pesquisa na internet e não executa ações. Use apenas exemplos fictícios.</p>
  {!api&&<p className="lab-chat-notice" role="status">Integração em preparação: o Worker isolado ainda não foi publicado e validado.</p>}
  {api&&!user&&<p className="lab-chat-notice" role="status">Faça login Google acima para habilitar os testes de conversa.</p>}
  {history.length>0&&<div className="lab-chat-dialog" aria-label="Mensagens desta sessão">
   {history.map((m,i)=><div className={'lab-chat-bubble '+(m.role==='user'?'lab-chat-user':'lab-chat-assistant')} key={i}>
    <strong>{m.role==='user'?'Você (exemplo)':'SIGMA'}</strong><p>{m.text}</p>
   </div>)}
  </div>}
  <label htmlFor="lab-chat-input">Mensagem de teste</label>
  <textarea id="lab-chat-input" rows={3} maxLength={2000}
   placeholder="Exemplo fictício: Sigma, explique o que você consegue fazer."
   value={draft} onChange={e=>setDraft(e.target.value)}
   disabled={!api||!user||busy}/>
  <div className="lab-chat-buttons">
   <button type="button" disabled={!api||!user||busy||!draft.trim()} onClick={()=>void send()}>
    {busy?'Conversando…':'Enviar para Gemini'}
   </button>
   <button type="button" disabled={busy||history.length===0} onClick={()=>{setHistory([]);setError('');}}>Limpar sessão local</button>
  </div>
  {error&&<p className="lab-error" role="alert">{error}</p>}
 </div>;
}
