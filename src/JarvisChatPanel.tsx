import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {LabFormattedText} from './jarvis-lab-markdown';
import {approvedChatRequest,readMemoryChoices,type SharedMemoryChoice} from './lab-chat-memory-selection';
import {assertLabReply,nextLabMessages,validLabApiBase,readLabWebSources,type LabWebSource,type LabChatMessage} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);

export function JarvisChatPanel({user}:{user:User|null}){
 const [history,setHistory]=useState<LabChatMessage[]>([]);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [webSources,setWebSources]=useState<LabWebSource[]>([]);
 const [memoryChoices,setMemoryChoices]=useState<SharedMemoryChoice[]>([]);
 const [selectedMemoryIds,setSelectedMemoryIds]=useState<string[]>([]);
 const [memoryPickerOpen,setMemoryPickerOpen]=useState(false);
 const [loadingMemory,setLoadingMemory]=useState(false);
 const [autoMemory,setAutoMemory]=useState(false);
 const [autoMemoryResult,setAutoMemoryResult]=useState<'found'|'none'|null>(null);
 const [consultedMemoryCount,setConsultedMemoryCount]=useState(0);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>{pending.current?.abort();},[]);
 useEffect(()=>{pending.current?.abort();setHistory([]);setDraft('');setError('');setWebSources([]);setMemoryChoices([]);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setConsultedMemoryCount(0);setAutoMemory(false);setAutoMemoryResult(null);},[user?.uid]);
 async function refreshMemoryChoices(){
  if(!user||!api||loadingMemory||busy||autoMemory)return;
  setLoadingMemory(true);setError('');
  try{
   const token=await user.getIdToken();
   const response=await fetch(api+'/api/lab/memory',{
    method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+token}
   });
   const data:unknown=await response.json().catch(()=>null);
   if(!response.ok){
    const reason=(data as {error?:unknown}|null)?.error;
    throw Error(typeof reason==='string'?reason:'Não foi possível consultar a memória.');
   }
   const choices=readMemoryChoices(data);
   setMemoryChoices(choices);
   setSelectedMemoryIds(old=>old.filter(id=>choices.some(x=>x.id===id)));
   setMemoryPickerOpen(true);
  }catch(e){setError(e instanceof Error?e.message:'Memórias indisponíveis.');}
  finally{setLoadingMemory(false);}
 }
 function toggleMemory(id:string){
  if(busy)return;
  setSelectedMemoryIds(old=>
   old.includes(id)?old.filter(x=>x!==id)
   :old.length<3?[...old,id]:old
  );
 }
 async function send(){
  if(!user||!api||busy)return;
  let messages:LabChatMessage[];
  try{messages=nextLabMessages(history,draft);}
  catch(e){setError(e instanceof Error?e.message:'Mensagem inválida.');return;}
  let payload:ReturnType<typeof approvedChatRequest>;
  try{payload=approvedChatRequest(messages,selectedMemoryIds,autoMemory);}
  catch(e){setError(e instanceof Error?e.message:'Seleção de memórias inválida.');return;}
  const controller=new AbortController();pending.current=controller;
  setBusy(true);setError('');setWebSources([]);setConsultedMemoryCount(0);setAutoMemoryResult(null);
  try{
   const token=await user.getIdToken();
   if(controller.signal.aborted)return;
   const response=await fetch(api+'/api/lab/chat',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'
   });
   const result:unknown=await response.json().catch(()=>null);
   if(!response.ok){
    const reason=(result as {error?:unknown}|null)?.error;
    throw Error(typeof reason==='string'?reason:'O laboratório não respondeu.');
   }
   const answer=assertLabReply(result);
   const sources=readLabWebSources(result);
   const memoryData=(result as {memory?:{consulted?:unknown;count?:unknown}}|null)?.memory;
   const consulted=memoryData?.consulted===true&&
    typeof memoryData.count==='number'&&
    Number.isInteger(memoryData.count)&&memoryData.count>=1&&memoryData.count<=3
     ?memoryData.count:0;
   const autoResult=memoryData?.mode==='auto'&&memoryData?.consulted===true&&consulted>0
     ?'found':memoryData?.mode==='auto'&&memoryData?.consulted===false&&memoryData?.count===0
     ?'none':null;
   if(!controller.signal.aborted){
    setHistory([...messages,{role:'assistant',text:answer}]);
    setWebSources(sources);setConsultedMemoryCount(consulted);
    setAutoMemoryResult(autoResult);
    setDraft('');setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);
   }
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Erro de conexão.');
  }finally{
   if(pending.current===controller){pending.current=null;setBusy(false);}
  }
 }
 return <div className="lab-chat">
  <h3>Conversa com Gemini + pesquisa + memória opcional</h3>
  <p>Conversa temporária: não fica salva, não lê Agenda ou Drive e não executa ações. Pesquisa na web apenas quando necessário, se habilitada. Consultas podem ser enviadas à Tavily. Use exemplos fictícios e evite dados pessoais.</p>
  {!api&&<p className="lab-chat-notice" role="status">Integração em preparação: o Worker isolado ainda não foi publicado e validado.</p>}
  {api&&!user&&<p className="lab-chat-notice" role="status">Faça login Google acima para habilitar os testes de conversa.</p>}
  {history.length>0&&<div className="lab-chat-dialog" aria-label="Mensagens desta sessão">
   {history.map((m,i)=><div className={'lab-chat-bubble '+(m.role==='user'?'lab-chat-user':'lab-chat-assistant')} key={i}>
    <strong>{m.role==='user'?'Você (exemplo)':'SIGMA'}</strong>
    <LabFormattedText text={m.text}/>
   </div>)}
  </div>}
  {autoMemoryResult==='none'&&<p className="lab-memory-used" role="status">Nenhuma memória relevante foi encontrada nesta pergunta. Nada foi compartilhado da sua base com o Gemini.</p>}
  {consultedMemoryCount>0&&<p className="lab-memory-used" role="status">
   <strong>Memória:</strong> {consultedMemoryCount} registro(s) {autoMemoryResult==='found'?'relevante(s) encontrado(s) com sua autorização':'escolhido(s) por você'} foram usados nesta resposta.
  </p>}
  {webSources.length>0&&<div className="lab-chat-sources" aria-label="Links encontrados na última pesquisa">
    <strong>Fontes encontradas na pesquisa</strong>
    <p>Resultados de busca podem estar desatualizados. Confira dados importantes diretamente na fonte oficial correspondente.</p>
    <ul>{webSources.map((source,i)=><li key={source.url}>
      <a href={source.url} target="_blank" rel="noopener noreferrer">
       {i+1}. {source.title}
      </a>
      {source.publishedDate&&<small> · {source.publishedDate}</small>}
    </li>)}</ul>
   </div>}
  {api&&user&&<div className="lab-chat-memory" aria-label="Compartilhar memórias escolhidas somente nesta pergunta">
   <strong>Memória na conversa (opcional)</strong>
   <p>Escolha manualmente até três registros ou ative a busca contextual nesta sessão. Apenas memórias relevantes serão compartilhadas com o Gemini; nunca com a Tavily. O SIGMA não salva novas memórias automaticamente.</p>
   <label className="lab-auto-memory-consent">
    <input type="checkbox" checked={autoMemory} disabled={busy||loadingMemory}
     onChange={event=>{
      setAutoMemory(event.target.checked);
      setSelectedMemoryIds([]);
      setMemoryPickerOpen(false);
      setMemoryChoices([]);
      setAutoMemoryResult(null);
     }}/>
    <span><strong>Buscar memórias relevantes automaticamente nesta sessão.</strong>
     <small>Desligado por padrão; não fica salvo. Pode ser desativado a qualquer momento. Até 3 memórias aprovadas poderão ser enviadas ao Gemini em cada pergunta.</small>
    </span>
   </label>
   <button type="button" disabled={busy||loadingMemory||autoMemory}
    onClick={()=>memoryPickerOpen?(setMemoryPickerOpen(false),setSelectedMemoryIds([]),setMemoryChoices([])):void refreshMemoryChoices()}>
    {loadingMemory?'Consultando…':autoMemory?'Busca contextual ativa nesta sessão':memoryPickerOpen?'Fechar seleção de memórias':'Escolher memórias para esta pergunta'}
   </button>
   {memoryPickerOpen&&<div>
    <button type="button" disabled={busy||loadingMemory} onClick={()=>void refreshMemoryChoices()}>Atualizar memórias</button>
    {memoryChoices.length===0&&<p>Nenhuma memória aprovada encontrada. Você pode cadastrá-la na seção Memória pessoal.</p>}
    {memoryChoices.length>0&&<div>
     <p role="status">{selectedMemoryIds.length} de 3 memórias selecionadas nesta pergunta.</p>
     <ul>{memoryChoices.map(choice=><li key={choice.id}><label>
      <input type="checkbox" disabled={busy||(!selectedMemoryIds.includes(choice.id)&&selectedMemoryIds.length>=3)}
       checked={selectedMemoryIds.includes(choice.id)} onChange={()=>toggleMemory(choice.id)}/>
      <span>{choice.text}</span>
     </label></li>)}</ul>
    </div>}
   </div>}
  </div>}
  <label htmlFor="lab-chat-input">Mensagem de teste</label>
  <textarea id="lab-chat-input" rows={3} maxLength={2000}
   placeholder="Exemplo fictício: Sigma, explique o que você consegue fazer."
   value={draft} onChange={e=>setDraft(e.target.value)}
   disabled={!api||!user||busy}/>
  <div className="lab-chat-buttons">
   <button type="button" disabled={!api||!user||busy||!draft.trim()} onClick={()=>void send()}>
    {busy?'Conversando…':autoMemory?'Enviar com busca contextual':selectedMemoryIds.length>0?'Enviar com '+selectedMemoryIds.length+' memória(s)':'Enviar para Gemini'}
   </button>
   <button type="button" disabled={busy||history.length===0} onClick={()=>{setHistory([]);setError('');setWebSources([]);setConsultedMemoryCount(0);setAutoMemoryResult(null);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);}}>Limpar sessão local</button>
  </div>
  {error&&<p className="lab-error" role="alert">{error}</p>}
 </div>;
}
