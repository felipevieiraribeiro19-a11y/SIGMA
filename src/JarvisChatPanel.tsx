import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {LabFormattedText} from './jarvis-lab-markdown';
import {approvedChatRequest,readMemoryChoices,type SharedMemoryChoice} from './lab-chat-memory-selection';
import {assertLabReply,nextLabMessages,validLabApiBase,readLabWebSources,type LabWebSource,type LabChatMessage} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);

export function JarvisChatPanel({user,googleToken}:{user:User|null;googleToken?:string|null}){
 const [history,setHistory]=useState<LabChatMessage[]>([]);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [webSources,setWebSources]=useState<LabWebSource[]>([]);
 const [selectedSources,setSelectedSources]=useState<string[]>([]);
 const [useLibrary,setUseLibrary]=useState(false);
 const [librarySources,setLibrarySources]=useState<{key:string;title:string;source:string;url:string;contentStatus:string}[]|null>(null);
 const [integrationReceipt,setIntegrationReceipt]=useState<Record<string,number>|null>(null);
 const [proposalText,setProposalText]=useState('');
 const [proposalApproved,setProposalApproved]=useState(false);
 const [savingProposal,setSavingProposal]=useState(false);
 const [proposalNotice,setProposalNotice]=useState('');
 const [memoryChoices,setMemoryChoices]=useState<SharedMemoryChoice[]>([]);
 const [selectedMemoryIds,setSelectedMemoryIds]=useState<string[]>([]);
 const [memoryPickerOpen,setMemoryPickerOpen]=useState(false);
 const [loadingMemory,setLoadingMemory]=useState(false);
 const [autoMemory,setAutoMemory]=useState(false);
 const [memoryPreferenceBusy,setMemoryPreferenceBusy]=useState(false);
 const [memoryPreferenceReady,setMemoryPreferenceReady]=useState(false);
 const [memoryPreferenceError,setMemoryPreferenceError]=useState('');
 const [autoMemoryResult,setAutoMemoryResult]=useState<'found'|'none'|null>(null);
 const [consultedMemoryCount,setConsultedMemoryCount]=useState(0);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>{pending.current?.abort();},[]);
 useEffect(()=>{pending.current?.abort();setHistory([]);setDraft('');setError('');setWebSources([]);setMemoryChoices([]);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setConsultedMemoryCount(0);setAutoMemory(false);setAutoMemoryResult(null);setSelectedSources([]);setUseLibrary(false);setLibrarySources(null);setIntegrationReceipt(null);setProposalText('');setProposalApproved(false);},[user?.uid]);
 useEffect(()=>{
  let live=true;
  setAutoMemory(false);
  setMemoryPreferenceReady(false);
  setMemoryPreferenceError('');
  if(!user||!api)return ()=>{live=false;};
  void (async()=>{
   try{
    const token=await user.getIdToken();
    const result=await fetch(api+'/api/lab/memory/settings',{
     method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store'
    });
    const data:unknown=await result.json().catch(()=>null);
    if(!result.ok){
     const reason=(data as {error?:unknown}|null)?.error;
     throw Error(typeof reason==='string'?reason:'Não foi possível consultar sua preferência.');
    }
    const value=(data as {recallEnabled?:unknown}|null)?.recallEnabled;
    if(typeof value!=='boolean')throw Error('Preferência de memória inválida.');
    if(live)setAutoMemory(value);
   }catch(e){
    if(live)setMemoryPreferenceError(e instanceof Error?e.message:'Preferência indisponível.');
   }finally{if(live)setMemoryPreferenceReady(true);}
  })();
  return ()=>{live=false;};
 },[user?.uid]);
 async function setPersistentMemory(next:boolean){
  if(!user||!api||busy||memoryPreferenceBusy||!memoryPreferenceReady)return;
  setMemoryPreferenceBusy(true);setMemoryPreferenceError('');
  try{
   const token=await user.getIdToken();
   const result=await fetch(api+'/api/lab/memory/settings',{
    method:'PATCH',cache:'no-store',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(selectedSources.some(s=>s==='calendar'||s==='drive')&&googleToken?{'X-Google-Token':googleToken}:{})},
    body:JSON.stringify({recallEnabled:next})
   });
   const data:unknown=await result.json().catch(()=>null);
   if(!result.ok){
    const reason=(data as {error?:unknown}|null)?.error;
    throw Error(typeof reason==='string'?reason:'Não foi possível alterar a memória.');
   }
   if((data as {recallEnabled?:unknown}|null)?.recallEnabled!==next)
    throw Error('O servidor não confirmou a preferência.');
   setAutoMemory(next);
   setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);
   setAutoMemoryResult(null);
  }catch(e){setMemoryPreferenceError(e instanceof Error?e.message:'Falha ao salvar sua escolha.');}
  finally{setMemoryPreferenceBusy(false);}
 }

 async function refreshMemoryChoices(){
  if(!user||!api||loadingMemory||busy||autoMemory||memoryPreferenceBusy)return;
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
  if(!user||!api||busy||memoryPreferenceBusy)return;
  let messages:LabChatMessage[];
  try{messages=nextLabMessages(history,draft);}
  catch(e){setError(e instanceof Error?e.message:'Mensagem inválida.');return;}
  if(selectedSources.some(p=>p==='calendar'||p==='drive')&&!googleToken){
   setError('Conecte primeiro a leitura Google na seção 7.');return;
  }
  let payload:ReturnType<typeof approvedChatRequest>;
  try{payload=approvedChatRequest(messages,selectedMemoryIds,autoMemory,selectedSources,useLibrary);}
  catch(e){setError(e instanceof Error?e.message:'Seleção de memórias inválida.');return;}
  const controller=new AbortController();pending.current=controller;
  setBusy(true);setError('');setWebSources([]);setConsultedMemoryCount(0);setAutoMemoryResult(null);setIntegrationReceipt(null);setLibrarySources(null);setProposalNotice('');
  try{
   const token=await user.getIdToken();
   if(controller.signal.aborted)return;
   const response=await fetch(api+'/api/lab/chat',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',
     ...(googleToken&&selectedSources.some(p=>p==='calendar'||p==='drive')?{'X-Google-Token':googleToken}:{})},
    body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'
   });
   const result:unknown=await response.json().catch(()=>null);
   if(!response.ok){
    const reason=(result as {error?:unknown}|null)?.error;
    throw Error(typeof reason==='string'?reason:'O laboratório não respondeu.');
   }
   const answer=assertLabReply(result);
   const sources=readLabWebSources(result);
   const structured=result as {integrations?:unknown;learningProposal?:unknown}|null;
   const library=(result as {library?:{consulted?:unknown;sources?:unknown}}|null)?.library;
   const docRefs=library?.consulted===true&&Array.isArray(library.sources)?
    library.sources.filter((x):x is {key:string;title:string;source:string;url:string;contentStatus:string}=>
     !!x&&typeof x.key==='string'&&typeof x.title==='string'&&typeof x.url==='string'&&
      typeof x.source==='string'&&typeof x.contentStatus==='string').slice(0,3):null;
   const rawReceipt=structured?.integrations;
   const newReceipt=rawReceipt&&typeof rawReceipt==='object'&&!Array.isArray(rawReceipt)?rawReceipt as Record<string,number>:null;
   const rawSuggestion=(structured?.learningProposal as {text?:unknown;requiresApproval?:unknown}|null);
   const nextSuggestion=rawSuggestion?.requiresApproval===true&&typeof rawSuggestion.text==='string'
    ?rawSuggestion.text.slice(0,500):'';
   const memoryData=(result as {memory?:{consulted?:unknown;count?:unknown;mode?:unknown}}|null)?.memory;
   const consulted=memoryData?.consulted===true&&
    typeof memoryData.count==='number'&&
    Number.isInteger(memoryData.count)&&memoryData.count>=1&&memoryData.count<=3
     ?memoryData.count:0;
   const autoResult=memoryData?.mode==='auto'&&memoryData?.consulted===true&&consulted>0
     ?'found':memoryData?.mode==='auto'&&memoryData?.consulted===false&&memoryData?.count===0
     ?'none':null;
   if(!controller.signal.aborted){
    setHistory([...messages,{role:'assistant',text:answer}]);
    setWebSources(sources);setConsultedMemoryCount(consulted);setIntegrationReceipt(newReceipt);setLibrarySources(docRefs);setProposalText(nextSuggestion);setProposalApproved(false);
    setAutoMemoryResult(autoResult);
    setDraft('');setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);
   }
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Erro de conexão.');
  }finally{
   if(pending.current===controller){pending.current=null;setBusy(false);}
  }
 }
 async function saveApprovedProposal(){
  if(!user||!api||savingProposal||!proposalApproved)return;
  setSavingProposal(true);setProposalNotice('');
  try{
   const token=await user.getIdToken();
   const response=await fetch(api+'/api/lab/memory',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({text:proposalText.trim()}),cache:'no-store'});
   const body:any=await response.json().catch(()=>null);
   if(!response.ok)throw Error(body?.error||'Não foi possível salvar a memória.');
   setProposalText('');setProposalApproved(false);
   setProposalNotice('Memória aprovada e salva na sua conta.');
  }catch(e){setProposalNotice(e instanceof Error?e.message:'Falha ao salvar.');}
  finally{setSavingProposal(false);}
 }
 function toggleSource(value:string){
  setSelectedSources(old=>old.includes(value)?old.filter(x=>x!==value):[...old,value]);
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
  {librarySources&&<div className="lab-learning-proposal" role="status">
   <strong>Biblioteca pesquisada: {librarySources.length} referência(s)</strong>
   {librarySources.length===0?<p>Nenhum documento foi encontrado para esta pergunta.</p>:
    <ul>{librarySources.map((doc,i)=><li key={doc.key}>[D{i+1}] {doc.title}
     {doc.contentStatus!=='indexed'?' (somente metadados)':''}
     {doc.url&&<a href={doc.url} rel="noopener noreferrer" target="_blank"> Abrir fonte</a>}
    </li>)}</ul>}
  </div>}
  {integrationReceipt&&<p className="lab-memory-used" role="status">Integrações consultadas nesta resposta: {Object.entries(integrationReceipt).map(([key,n])=>key+': '+n+' item(ns)').join(' · ')}.</p>}
  {proposalText&&<div className="lab-learning-proposal">
   <strong>Aprendizado contínuo — sugestão, não salva</strong>
   <p>O SIGMA identificou uma informação que talvez valha guardar. Revise, corrija ou descarte.</p>
   <textarea maxLength={500} rows={3} value={proposalText} onChange={e=>{setProposalText(e.target.value);setProposalApproved(false);}}/>
   <label><input type="checkbox" checked={proposalApproved} onChange={e=>setProposalApproved(e.target.checked)}/> Aprovo salvar exatamente este texto na memória permanente.</label>
   <button type="button" disabled={!proposalApproved||savingProposal||proposalText.trim().length<3} onClick={()=>void saveApprovedProposal()}>Confirmar e salvar</button>
   <button type="button" onClick={()=>{setProposalText('');setProposalApproved(false);}}>Descartar</button>
  </div>}
  {proposalNotice&&<p role="status">{proposalNotice}</p>}
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
   <p>Você pode autorizar uma única vez a consulta automática às memórias aprovadas. A preferência fica salva na sua conta, continua após reabrir o SIGMA e pode ser desligada aqui. O Gemini recebe até três notas relacionadas à pergunta; a Tavily não recebe essas notas. Nenhum registro novo é criado automaticamente.</p>
   <label className="lab-auto-memory-consent">
    <input type="checkbox" checked={autoMemory} disabled={busy||loadingMemory||memoryPreferenceBusy||!memoryPreferenceReady}
     onChange={event=>{void setPersistentMemory(event.target.checked);}}/>
    <span><strong>Lembrar automaticamente nas próximas conversas</strong>
     <small>{memoryPreferenceBusy?'Salvando preferência…':!memoryPreferenceReady?'Consultando preferência da conta…':autoMemory?'Ligado e salvo na sua conta. Você pode desligar quando quiser.':'Desligado. Marque uma vez para permitir consultas contextuais nas próximas visitas.'}</small>
    </span>
   </label>
   {memoryPreferenceError&&<p className="lab-error" role="alert">{memoryPreferenceError}</p>}
   <button type="button" disabled={busy||loadingMemory||autoMemory||memoryPreferenceBusy}
    onClick={()=>memoryPickerOpen?(setMemoryPickerOpen(false),setSelectedMemoryIds([]),setMemoryChoices([])):void refreshMemoryChoices()}>
    {loadingMemory?'Consultando…':autoMemory?'Consulta automática ativa na sua conta':memoryPickerOpen?'Fechar seleção de memórias':'Escolher memórias para esta pergunta'}
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
  <div className="lab-chat-memory">
   <strong>Consultar integrações nesta pergunta (opcional)</strong>
   <label className="lab-source-option">
    <input type="checkbox" checked={useLibrary} disabled={busy} onChange={e=>setUseLibrary(e.target.checked)}/>
    Consultar minha biblioteca de documentos (com fontes)
   </label>
   <p>Você decide quando compartilhar resultados de Agenda, Drive ou Notion com o Gemini. Os tokens nunca entram no texto enviado ao modelo.</p>
   {(['calendar','drive','notion'] as const).map(provider=><label key={provider} className="lab-source-option">
    <input type="checkbox" checked={selectedSources.includes(provider)} disabled={busy}
     onChange={()=>toggleSource(provider)}/>
    {provider==='calendar'?'Agenda Google':provider==='drive'?'Google Drive':'Notion'}
   </label>)}
   {selectedSources.some(x=>x==='drive'||x==='calendar')&&!googleToken&&<small>Conecte o Google na seção 7 antes de consultar esses serviços.</small>}
  </div>
  <label htmlFor="lab-chat-input">Mensagem de teste</label>
  <textarea id="lab-chat-input" rows={3} maxLength={2000}
   placeholder="Exemplo fictício: Sigma, explique o que você consegue fazer."
   value={draft} onChange={e=>setDraft(e.target.value)}
   disabled={!api||!user||busy}/>
  <div className="lab-chat-buttons">
   <button type="button" disabled={!api||!user||busy||!draft.trim()} onClick={()=>void send()}>
    {busy?'Conversando…':autoMemory?'Enviar com busca contextual':selectedMemoryIds.length>0?'Enviar com '+selectedMemoryIds.length+' memória(s)':'Enviar para Gemini'}
   </button>
   <button type="button" disabled={busy||history.length===0} onClick={()=>{setHistory([]);setError('');setWebSources([]);setConsultedMemoryCount(0);setAutoMemoryResult(null);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);setIntegrationReceipt(null);setProposalText('');setProposalApproved(false);}}>Limpar sessão local</button>
  </div>
  {error&&<p className="lab-error" role="alert">{error}</p>}
 </div>;
}
