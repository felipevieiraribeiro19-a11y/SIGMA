import {SigmaVoice} from './SigmaVoice';
import {ExternalChatAction} from './ExternalChatAction';
import type {ActionData} from '../worker/src/lab-external-actions';
import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {LabFormattedText} from './jarvis-lab-markdown';
import {approvedChatRequest,readMemoryChoices,type SharedMemoryChoice} from './lab-chat-memory-selection';
import {assertLabReply,nextLabMessages,validLabApiBase,readLabWebSources,readLabProjectProposal,readLabTaskProposal,readLabTaskCompletion,readLabPendingTasks,type LabTaskCompletion,type LabPendingTask,type LabProjectProposal,type LabTaskProposal,type LabWebSource,type LabChatMessage} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
export function JarvisChatPanel({user,googleToken}:{user:User|null;googleToken?:string|null}){
 const [external,setExternal]=useState<ActionData|null>(null);
 const [externalNotice,setExternalNotice]=useState('');
 const [confirmSignal,setConfirmSignal]=useState(0);
 const sendLock=useRef(false);
 const [history,setHistory]=useState<LabChatMessage[]>([]);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [webSources,setWebSources]=useState<LabWebSource[]>([]);
 const [selectedSources,setSelectedSources]=useState<string[]>([]);
 const [useLibrary,setUseLibrary]=useState(false);
 const [useProjects,setUseProjects]=useState(false);
 const [projectsReceipt,setProjectsReceipt]=useState<{shared:number;available:number;truncated:boolean}|null>(null);
 const [librarySources,setLibrarySources]=useState<{key:string;title:string;source:string;url:string;contentStatus:string}[]|null>(null);
 const [integrationReceipt,setIntegrationReceipt]=useState<Record<string,number>|null>(null);
 const [proposalText,setProposalText]=useState('');
 const [proposalApproved,setProposalApproved]=useState(false);
 const [savingProposal,setSavingProposal]=useState(false);
 const [proposalNotice,setProposalNotice]=useState('');
 const [projectProposal,setProjectProposal]=useState<LabProjectProposal|null>(null);
 const [projectConfirmed,setProjectConfirmed]=useState(false);
 const [projectSaving,setProjectSaving]=useState(false);
 const [projectNotice,setProjectNotice]=useState('');
 const [taskProposal,setTaskProposal]=useState<LabTaskProposal|null>(null);
 const [taskProjects,setTaskProjects]=useState<{id:string;title:string;status:string}[]>([]);
 const [taskProjectId,setTaskProjectId]=useState('');
 const [taskApproved,setTaskApproved]=useState(false);
 const [taskSaving,setTaskSaving]=useState(false);
 const [taskNotice,setTaskNotice]=useState('');
 const [taskCompletion,setTaskCompletion]=useState<LabTaskCompletion|null>(null);
 const [pendingTasks,setPendingTasks]=useState<LabPendingTask[]>([]);
 const [completionId,setCompletionId]=useState('');
 const [completionApproved,setCompletionApproved]=useState(false);
 const [completionSaving,setCompletionSaving]=useState(false);
 const [completionLoading,setCompletionLoading]=useState(false);
 const [completionNotice,setCompletionNotice]=useState('');
 const [tasksReceipt,setTasksReceipt]=useState<{shared:number;available:number;truncated:boolean}|null>(null);
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
 const completionLoadVersion=useRef(0);
 useEffect(()=>()=>{pending.current?.abort();completionLoadVersion.current++;},[]);
 useEffect(()=>{pending.current?.abort();sendLock.current=false;setExternal(null);setExternalNotice('');setConfirmSignal(0);setHistory([]);setDraft('');setError('');setWebSources([]);setMemoryChoices([]);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setConsultedMemoryCount(0);setAutoMemory(false);setAutoMemoryResult(null);setSelectedSources([]);setUseLibrary(false);setUseProjects(false);setProjectsReceipt(null);setLibrarySources(null);setIntegrationReceipt(null);setProjectsReceipt(null);setProposalText('');setProposalApproved(false);setProjectProposal(null);setProjectConfirmed(false);setProjectNotice('');setTaskProposal(null);setTaskProjects([]);setTaskProjectId('');setTaskApproved(false);setTaskNotice('');completionLoadVersion.current++;setCompletionLoading(false);setTaskCompletion(null);setPendingTasks([]);setCompletionId('');setCompletionApproved(false);setCompletionNotice('');setTasksReceipt(null);},[user?.uid]);
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
 async function send(text=draft){
  if(!user||!api||busy||memoryPreferenceBusy||sendLock.current)return;
  if(/^confirmar a[çc][ãa]o[.!]?$/i.test(text.trim())&&external){setConfirmSignal(n=>n+1);return;}
  let messages:LabChatMessage[];
  try{messages=nextLabMessages(history,text);}
  catch(e){setError(e instanceof Error?e.message:'Mensagem inválida.');return;}
  if(selectedSources.some(p=>p==='calendar'||p==='drive'||p==='tasks')&&!googleToken){
   setError('Conecte primeiro a leitura Google em Agenda ou Integrações.');return;
  }
  let payload:ReturnType<typeof approvedChatRequest>;
  try{payload=approvedChatRequest(messages,selectedMemoryIds,autoMemory,selectedSources,useLibrary,useProjects);}
  catch(e){setError(e instanceof Error?e.message:'Seleção de memórias inválida.');return;}
  const controller=new AbortController();pending.current=controller;
  sendLock.current=true;setExternal(null);setExternalNotice('');setConfirmSignal(0);setBusy(true);setError('');setWebSources([]);setConsultedMemoryCount(0);setAutoMemoryResult(null);setIntegrationReceipt(null);setLibrarySources(null);setProjectsReceipt(null);setProposalNotice('');setProjectProposal(null);setProjectConfirmed(false);setProjectNotice('');setTaskProposal(null);setTaskProjects([]);setTaskProjectId('');setTaskApproved(false);setTaskNotice('');completionLoadVersion.current++;setCompletionLoading(false);setTaskCompletion(null);setPendingTasks([]);setCompletionId('');setCompletionApproved(false);setCompletionNotice('');setTasksReceipt(null);
  try{
   const token=await user.getIdToken();
   if(controller.signal.aborted)return;
   const response=await fetch(api+'/api/lab/chat',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',
     ...(googleToken&&selectedSources.some(p=>p==='calendar'||p==='drive'||p==='tasks')?{'X-Google-Token':googleToken}:{})},
    body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'
   });
   const result:unknown=await response.json().catch(()=>null);
   if(!response.ok){
    const reason=(result as {error?:unknown}|null)?.error;
    throw Error(typeof reason==='string'?reason:'O laboratório não respondeu.');
   }
   const answer=assertLabReply(result);
   const sources=readLabWebSources(result);
   const structured=result as {integrations?:unknown;learningProposal?:unknown;projectProposal?:unknown;taskProposal?:unknown;taskCompletion?:unknown;tasks?:unknown;projects?:unknown}|null;
   const library=(result as {library?:{consulted?:unknown;sources?:unknown}}|null)?.library;
   const docRefs=library?.consulted===true&&Array.isArray(library.sources)?
    library.sources.filter((x):x is {key:string;title:string;source:string;url:string;contentStatus:string}=>
     !!x&&typeof x.key==='string'&&typeof x.title==='string'&&typeof x.url==='string'&&
      typeof x.source==='string'&&typeof x.contentStatus==='string').slice(0,3):null;
   const rawProjects=structured?.projects;
   const safeProjectReceipt=rawProjects&&typeof rawProjects==='object'&&!Array.isArray(rawProjects)?
    rawProjects as Record<string,unknown>:null;
   const nextProjects=safeProjectReceipt?.consulted===true&&
    Number.isInteger(safeProjectReceipt.shared)&&Number.isInteger(safeProjectReceipt.available)&&
    Number(safeProjectReceipt.shared)>=0&&Number(safeProjectReceipt.shared)<=8&&
    Number(safeProjectReceipt.available)>=Number(safeProjectReceipt.shared)&&
    Number(safeProjectReceipt.available)<=50&&
    typeof safeProjectReceipt.truncated==='boolean'?
     {shared:Number(safeProjectReceipt.shared),available:Number(safeProjectReceipt.available),
      truncated:safeProjectReceipt.truncated}:null;
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
    const newTask=readLabTaskProposal(result);
    setTaskProposal(newTask);setTaskApproved(false);setTaskProjects([]);setTaskProjectId('');
    const completion=readLabTaskCompletion(result);
    setTaskCompletion(completion);setPendingTasks([]);setCompletionId('');setCompletionApproved(false);
    if(completion)void refreshPendingTasks(completion.titleHint);
    const tasks=(structured?.tasks as {consulted?:unknown;shared?:unknown;available?:unknown;truncated?:unknown}|null);
    setTasksReceipt(tasks?.consulted===true&&Number.isInteger(tasks.shared)&&Number.isInteger(tasks.available)&&
     Number(tasks.shared)>=0&&Number(tasks.shared)<=25&&Number(tasks.available)>=Number(tasks.shared)&&
     Number(tasks.available)<=250&&typeof tasks.truncated==='boolean'?
     {shared:Number(tasks.shared),available:Number(tasks.available),truncated:tasks.truncated}:null);
    setProjectProposal(readLabProjectProposal(result));setProjectConfirmed(false);
    if(newTask)void refreshTaskProjects(newTask.projectTitleHint);
    setHistory([...messages,{role:'assistant',text:answer}]);
    setExternal((result as {externalAction?:ActionData}).externalAction||null);
    setProjectsReceipt(nextProjects);
    setWebSources(sources);setConsultedMemoryCount(consulted);setIntegrationReceipt(newReceipt);setLibrarySources(docRefs);setProposalText(nextSuggestion);setProposalApproved(false);
    setAutoMemoryResult(autoResult);
    setDraft('');setUseProjects(false);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);
   }
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Erro de conexão.');
  }finally{
   if(pending.current===controller){pending.current=null;sendLock.current=false;setBusy(false);}
  }
 }
 async function refreshTaskProjects(hint:string){
  if(!user||!api)return;
  try{
   const token=await user.getIdToken();
   const response=await fetch(api+'/api/lab/workspace/projects',{
    method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error('Não foi possível carregar projetos para esta tarefa.');
   const rows=(body as {projects?:unknown}|null)?.projects;
   if(!Array.isArray(rows)||rows.length>50)throw Error('Lista de projetos inválida.');
   const projects=rows.map((x:unknown)=>{
    const p=x as {id?:unknown;title?:unknown;status?:unknown}|null;
    if(!p||typeof p.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id)||
     typeof p.title!=='string'||!['active','paused','archived'].includes(String(p.status)))
      throw Error('Projeto inválido na resposta do servidor.');
    return {id:p.id,title:p.title,status:p.status as string};
   }).filter(p=>p.status!=='archived');
   setTaskProjects(projects);
   const matches=projects.filter(p=>p.title.localeCompare(hint,'pt-BR',{sensitivity:'base'})===0);
   if(hint&&matches.length===1)setTaskProjectId(matches[0].id);
  }catch(e){setTaskNotice(e instanceof Error?e.message:'Projetos indisponíveis.');}
 }
 async function refreshPendingTasks(hint:string){
  if(!user||!api||completionSaving)return;
  // Changing the list or its revision revokes approval, before the GET.
  // Ignore responses belonging to a prior proposal or account.
  const version=++completionLoadVersion.current;
  setCompletionLoading(true);setCompletionNotice('');
  setCompletionApproved(false);setCompletionId('');setPendingTasks([]);
  try{
   const token=await user.getIdToken();
   if(version!==completionLoadVersion.current)return;
   const response=await fetch(api+'/api/lab/workspace',{
    method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   const body:unknown=await response.json().catch(()=>null);
   if(version!==completionLoadVersion.current)return;
   if(!response.ok)throw Error('Não foi possível consultar tarefas para concluir.');
   const tasks=readLabPendingTasks(body);
   setPendingTasks(tasks);
   const matches=tasks.filter(t=>t.title.localeCompare(hint,'pt-BR',{sensitivity:'base'})===0);
   setCompletionId(matches.length===1?matches[0].id:'');
  }catch(e){
   if(version===completionLoadVersion.current)
    setCompletionNotice(e instanceof Error?e.message:'Lista de tarefas indisponível.');
  }finally{
   if(version===completionLoadVersion.current)setCompletionLoading(false);
  }
 }
 async function confirmTaskCompletion(){
  if(!user||!api||!taskCompletion||!completionApproved||completionSaving||completionLoading||busy)return;
  const chosen=pendingTasks.find(t=>t.id===completionId);
  if(!chosen){setCompletionNotice('Selecione uma tarefa pendente válida.');return;}
  setCompletionSaving(true);setCompletionNotice('');
  try{
   const token=await user.getIdToken();
   const response=await fetch(api+'/api/lab/workspace/'+encodeURIComponent(chosen.id)+'/complete',{
    method:'PATCH',cache:'no-store',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({expectedUpdatedAt:chosen.updatedAt})
   });
   const result:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error((result as {error?:string}|null)?.error||
    'Não foi possível confirmar a conclusão. Atualize a lista antes de tentar novamente.');
   const saved=(result as {completed?:unknown;entry?:{id?:unknown;kind?:unknown;done?:unknown;title?:unknown}}|null);
   if(saved?.completed!==true||saved.entry?.id!==chosen.id||saved.entry?.kind!=='task'||
    saved.entry?.done!==true)
    throw Error('Resposta incompleta. Confira a Gestão integrada antes de repetir.');
   setCompletionNotice('Tarefa "'+chosen.title+'" concluída e confirmada pelo SIGMA.');
   completionLoadVersion.current++;setCompletionLoading(false);setTaskCompletion(null);setPendingTasks([]);setCompletionId('');setCompletionApproved(false);
  }catch(e){setCompletionNotice(e instanceof Error?e.message:'Falha ao concluir tarefa.');}
  finally{setCompletionSaving(false);}
 }
 async function createApprovedTask(){
  if(!user||!api||!taskProposal||!taskApproved||taskSaving||busy)return;
  const chosen=taskProjectId?taskProjects.find(p=>p.id===taskProjectId):null;
  if(taskProjectId&&!chosen){setTaskNotice('Selecione novamente um projeto válido.');return;}
  if(taskProposal.projectTitleHint&&!chosen){
   setTaskNotice('Escolha um projeto válido antes de salvar esta tarefa.');return;
  }
  setTaskSaving(true);setTaskNotice('');
  try{
   const token=await user.getIdToken();
   const task={kind:'task',title:taskProposal.title.trim(),notes:taskProposal.notes,
    done:false,minutes:0,amount:0,priority:taskProposal.priority,
    ...(taskProposal.dueDate?{dueDate:taskProposal.dueDate}:{}),
    ...(chosen?{projectId:chosen.id}:{})};
   const response=await fetch(api+'/api/lab/workspace',{
    method:'POST',cache:'no-store',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(task)
   });
   const payload:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error((payload as {error?:string}|null)?.error||
    'Não foi possível confirmar o registro. Confira a Gestão integrada antes de tentar novamente.');
   const saved=(payload as {entry?:{id?:unknown;kind?:unknown;title?:unknown;projectId?:unknown}}|null)?.entry;
   if(typeof saved?.id!=='string'||saved.kind!=='task'||saved.title!==task.title||
      (chosen&&saved.projectId!==chosen.id))
    throw Error('Resposta incompleta. Confira os registros antes de tentar novamente.');
   setTaskNotice('Tarefa "'+saved.title+'" salva e confirmada pelo SIGMA'+
    (chosen?' no projeto "'+chosen.title+'"':'')+'. Consulte-a na Gestão integrada.');
   setTaskProposal(null);setTaskApproved(false);setTaskProjects([]);setTaskProjectId('');
  }catch(e){setTaskNotice(e instanceof Error?e.message:'Falha ao salvar tarefa.');}
  finally{setTaskSaving(false);}
 }
 async function createApprovedProject(){
  if(!user||!api||!projectProposal||!projectConfirmed||projectSaving||busy)return;
  setProjectSaving(true);setProjectNotice('');
  try{
   const token=await user.getIdToken();
   const response=await fetch(api+'/api/lab/workspace/projects',{
    method:'POST',cache:'no-store',headers:{
     Authorization:'Bearer '+token,'Content-Type':'application/json'
    },body:JSON.stringify({title:projectProposal.title,
     goal:projectProposal.goal,notes:projectProposal.notes})
   });
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok)throw Error((body as {error?:string}|null)?.error||
    'A criação do projeto não foi confirmada pelo servidor.');
   const saved=(body as {project?:{id?:unknown;title?:unknown}}|null)?.project;
   if(typeof saved?.id!=='string'||typeof saved?.title!=='string')
    throw Error('Resposta incompleta. Confira seus projetos antes de tentar novamente.');
   setProjectNotice('Projeto "'+saved.title+'" criado e confirmado pelo SIGMA. '+
    'Consulte-o na seção Gestão integrada.');
   setProjectProposal(null);setProjectConfirmed(false);
  }catch(e){setProjectNotice(e instanceof Error?e.message:'Não foi possível criar o projeto.');}
  finally{setProjectSaving(false);}
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
  <p>Conversa temporária: não fica salva e não acessa Agenda ou Drive sem autorização. Projetos e tarefas podem ser propostos pelo Gemini, mas só serão salvos após revisão e confirmação separadas. Pesquisa na web somente quando habilitada. Use exemplos fictícios e evite dados pessoais.</p>
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
  {tasksReceipt&&<p className="lab-memory-used" role="status">
   <strong>Tarefas pendentes consultadas:</strong> {tasksReceipt.shared} de {tasksReceipt.available}.
   {tasksReceipt.truncated?' Existem outras tarefas não compartilhadas com o Gemini.':''}
  </p>}
  {projectsReceipt&&<p className="lab-memory-used" role="status">
   <strong>Projetos consultados com sua autorização:</strong> {projectsReceipt.shared} de {projectsReceipt.available} projeto(s).
   {projectsReceipt.truncated?' Para manter o contexto enxuto, alguns projetos não foram enviados ao Gemini.':''}
   {' '}Notas privadas, clientes, finanças e registros detalhados não foram compartilhados.
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
  {projectProposal&&<div className="lab-learning-proposal" aria-label="Proposta de projeto criada pelo Gemini">
   <strong>Proposta de projeto — nada salvo ainda</strong>
   <p>O Gemini preparou um rascunho. Você pode corrigir os dados. Apenas sua confirmação criará este projeto no SIGMA.</p>
   <label>Nome do projeto<input maxLength={120} value={projectProposal.title}
    onChange={e=>{setProjectProposal({...projectProposal,title:e.target.value});setProjectConfirmed(false);}}/></label>
   <label>Objetivo<textarea rows={3} maxLength={1000} value={projectProposal.goal}
    onChange={e=>{setProjectProposal({...projectProposal,goal:e.target.value});setProjectConfirmed(false);}}/></label>
   <label>Observações<textarea rows={3} maxLength={2000} value={projectProposal.notes}
    onChange={e=>{setProjectProposal({...projectProposal,notes:e.target.value});setProjectConfirmed(false);}}/></label>
   <label><input type="checkbox" checked={projectConfirmed} onChange={e=>setProjectConfirmed(e.target.checked)}/>
    Revisei e autorizo criar exatamente este projeto no meu SIGMA.</label>
   <button type="button" disabled={busy||projectSaving||!projectConfirmed||
    projectProposal.title.trim().length<2||projectProposal.goal.trim().length<2}
    onClick={()=>void createApprovedProject()}>{projectSaving?'Registrando…':'Confirmar e criar projeto'}</button>
   <button type="button" disabled={busy||projectSaving} onClick={()=>{
    setProjectProposal(null);setProjectConfirmed(false);
   }}>Descartar proposta</button>
  </div>}
  {projectNotice&&<p role="status">{projectNotice}</p>}
  {taskProposal&&<div className="lab-learning-proposal" aria-label="Proposta de tarefa, não salva">
   <strong>Proposta de tarefa — nada salvo ainda</strong>
   <p>Revise os dados, escolha o projeto e marque a autorização. Não há envio de lembrete externo nem criação automática.</p>
   <label>Tarefa<input maxLength={160} value={taskProposal.title}
    onChange={e=>{setTaskProposal({...taskProposal,title:e.target.value});setTaskApproved(false);}}/></label>
   <label>Observações<textarea rows={2} maxLength={1500} value={taskProposal.notes}
    onChange={e=>{setTaskProposal({...taskProposal,notes:e.target.value});setTaskApproved(false);}}/></label>
   <label>Prazo (opcional)<input type="date" value={taskProposal.dueDate}
    onChange={e=>{setTaskProposal({...taskProposal,dueDate:e.target.value});setTaskApproved(false);}}/></label>
   <label>Prioridade<select value={taskProposal.priority}
    onChange={e=>{setTaskProposal({...taskProposal,priority:e.target.value as LabTaskProposal['priority']});setTaskApproved(false);}}>
    <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option>
   </select></label>
   {taskProposal.projectTitleHint&&<p>Projeto citado na conversa: <strong>{taskProposal.projectTitleHint}</strong>. Confira qual projeto está selecionado.</p>}
   <label>Projeto
    <select value={taskProjectId} onChange={e=>{setTaskProjectId(e.target.value);setTaskApproved(false);}}>
     <option value="">Sem projeto{taskProposal.projectTitleHint?' (selecione o projeto citado)':''}</option>
     {taskProjects.map(project=><option value={project.id} key={project.id}>{project.title} ({project.status==='paused'?'pausado':'ativo'})</option>)}
    </select>
   </label>
   <button type="button" disabled={taskSaving||busy}
    onClick={()=>void refreshTaskProjects(taskProposal.projectTitleHint)}>Atualizar projetos</button>
   <label><input type="checkbox" checked={taskApproved} disabled={taskSaving}
    onChange={e=>setTaskApproved(e.target.checked)}/>
    Revisei e autorizo salvar exatamente esta tarefa no meu SIGMA.</label>
   <button type="button" disabled={busy||taskSaving||!taskApproved||
     taskProposal.title.trim().length<2||
     (Boolean(taskProposal.projectTitleHint)&&!taskProjects.some(p=>p.id===taskProjectId))}
    onClick={()=>void createApprovedTask()}>{taskSaving?'Registrando…':'Confirmar e salvar tarefa'}</button>
   <button type="button" disabled={busy||taskSaving} onClick={()=>{
    setTaskProposal(null);setTaskProjects([]);setTaskProjectId('');setTaskApproved(false);
   }}>Descartar tarefa</button>
  </div>}
  {taskNotice&&<p role="status">{taskNotice}</p>}
  {taskCompletion&&<div className="lab-learning-proposal" aria-label="Proposta de conclusão, nada alterado">
   <strong>Concluir tarefa — aguardando sua confirmação</strong>
   <p>O Gemini sugeriu concluir: <strong>{taskCompletion.titleHint}</strong>. Selecione a tarefa real da sua conta. Nada foi alterado ainda.</p>
   <label>Tarefa pendente
    <select disabled={busy||completionSaving||completionLoading} value={completionId} onChange={e=>{setCompletionId(e.target.value);setCompletionApproved(false);}}>
     <option value="">Selecione uma tarefa específica</option>
     {pendingTasks.map(t=><option key={t.id} value={t.id}>{t.title}{t.dueDate?' — '+t.dueDate:''}</option>)}
    </select>
   </label>
   <button type="button" disabled={busy||completionSaving||completionLoading}
    onClick={()=>void refreshPendingTasks(taskCompletion.titleHint)}>{completionLoading?'Consultando tarefas…':'Atualizar tarefas pendentes'}</button>
   <label><input type="checkbox" checked={completionApproved} disabled={completionSaving||completionLoading}
    onChange={e=>setCompletionApproved(e.target.checked)}/>
    Revisei a tarefa selecionada e autorizo marcá-la como concluída.</label>
   <button type="button" disabled={busy||completionSaving||completionLoading||!completionApproved||
    !pendingTasks.some(t=>t.id===completionId)}
    onClick={()=>void confirmTaskCompletion()}>{completionSaving?'Concluindo…':'Confirmar conclusão'}</button>
   <button type="button" disabled={busy||completionSaving} onClick={()=>{
    completionLoadVersion.current++;setCompletionLoading(false);setTaskCompletion(null);setPendingTasks([]);setCompletionId('');setCompletionApproved(false);
   }}>Cancelar conclusão</button>
  </div>}
  {completionNotice&&<p role="status">{completionNotice}</p>}
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
   <strong>Consultar meus dados nesta pergunta (opcional)</strong>
   <label className="lab-source-option">
    <input type="checkbox" checked={useProjects} disabled={busy}
     onChange={e=>setUseProjects(e.target.checked)}/>
    Compartilhar apenas nomes, objetivos e estados dos meus projetos com o Gemini nesta pergunta
   </label>
   <small>Desligado por padrão. Não envia observações, registros de clientes ou valores financeiros. Você pode desmarcar quando quiser.</small>
   <label className="lab-source-option">
    <input type="checkbox" checked={useLibrary} disabled={busy} onChange={e=>setUseLibrary(e.target.checked)}/>
    Consultar minha biblioteca de documentos (com fontes)
   </label>
   <p>Você decide quando compartilhar resultados de Agenda, Drive ou Notion com o Gemini. Os tokens nunca entram no texto enviado ao modelo.</p>
   {(['calendar','drive','notion','tasks'] as const).map(provider=><label key={provider} className="lab-source-option">
    <input type="checkbox" checked={selectedSources.includes(provider)} disabled={busy}
     onChange={()=>toggleSource(provider)}/>
    {provider==='calendar'?'Agenda Google':provider==='drive'?'Google Drive':provider==='tasks'?'Google Tarefas':'Notion'}
   </label>)}
   {selectedSources.some(x=>x==='drive'||x==='calendar')&&!googleToken&&<small>Conecte o Google em Agenda ou Integrações antes de consultar esses serviços.</small>}
  </div>
  {external&&user&&<ExternalChatAction key={JSON.stringify(external)} user={user} proposal={external} confirmSignal={confirmSignal} onNotice={setExternalNotice}/>}
  {externalNotice&&<p role="status">{externalNotice}</p>}
  <SigmaVoice key={user?.uid||'signed-out'} busy={!user||busy} answer={externalNotice||history.filter(m=>m.role==='assistant').at(-1)?.text||''} onText={text=>{setDraft(text);void send(text);}} onError={setError}/>
  <label htmlFor="lab-chat-input">Sua mensagem</label>
  <textarea id="lab-chat-input" rows={3} maxLength={2000}
   placeholder="Converse com o SIGMA sobre seus estudos, projetos ou tarefas…"
   value={draft} onChange={e=>setDraft(e.target.value)}
   disabled={!api||!user||busy}/>
  <div className="lab-chat-buttons">
   <button type="button" disabled={!api||!user||busy||!draft.trim()} onClick={()=>void send()}>
    {busy?'Conversando…':autoMemory?'Enviar com busca contextual':selectedMemoryIds.length>0?'Enviar com '+selectedMemoryIds.length+' memória(s)':'Enviar mensagem'}
   </button>
   <button type="button" disabled={busy||history.length===0} onClick={()=>{setHistory([]);setError('');setWebSources([]);setConsultedMemoryCount(0);setAutoMemoryResult(null);setSelectedMemoryIds([]);setMemoryPickerOpen(false);setMemoryChoices([]);setIntegrationReceipt(null);setProjectsReceipt(null);setProposalText('');setProposalApproved(false);setProjectProposal(null);setProjectConfirmed(false);setProjectNotice('');setTaskProposal(null);setTaskProjects([]);setTaskProjectId('');setTaskApproved(false);setTaskNotice('');completionLoadVersion.current++;setCompletionLoading(false);setTaskCompletion(null);setPendingTasks([]);setCompletionId('');setCompletionApproved(false);setCompletionNotice('');setTasksReceipt(null);}}>Limpar sessão local</button>
  </div>
  {error&&<p className="lab-error" role="alert">{error}</p>}
 </div>;
}
