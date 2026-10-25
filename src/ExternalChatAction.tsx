import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {connectLabGoogleWrite} from './jarvis-lab-auth';
import {validLabApiBase} from './jarvis-chat-protocol';
import type {ActionData,LabAction} from '../worker/src/lab-external-actions';
const labels:Record<string,string>={'calendar.create':'Google Agenda','tasks.create':'Google Tarefas','drive.folder.create':'Pasta no Drive','drive.note.create':'Nota no Drive','notion.page.create':'Página no Notion'};
export function ExternalChatAction({user,proposal,confirmSignal,onNotice}:{user:User;proposal:ActionData;confirmSignal:number;onNotice:(text:string)=>void}){
 const [action,setAction]=useState<LabAction|null>(null),[token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),live=useRef(true),attempted=useRef(false);
 useEffect(()=>()=>{live.current=false;},[]);
 async function request(path:string,body:unknown){const id=await user.getIdToken();const r=await fetch(validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API)+'/api/lab/actions/'+path,{method:'POST',headers:{Authorization:'Bearer '+id,'Content-Type':'application/json',...(token?{'X-Google-Token':token}:{})},body:JSON.stringify(body),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível confirmar a ação.');return data.action as LabAction;}
 async function prepare(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const a=await request('prepare',proposal);if(live.current)setAction(a);}catch(e){if(live.current)setError((e as Error).message);}finally{lock.current=false;if(live.current)setBusy(false);}}
 async function confirm(){if(lock.current||!action||action.status!=='pending'||attempted.current)return;if(proposal.operation!=='notion.page.create'&&!token){setError('Toque em Autorizar Google antes de confirmar.');return;}lock.current=true;attempted.current=true;setBusy(true);setError('');try{const a=await request('confirm/'+action.id,{confirmed:true});if(!live.current)return;setAction(a);onNotice(a.status==='succeeded'?`Salvo em ${labels[proposal.operation]}: ${proposal.title}.`:a.status==='failed'?'O serviço recusou a operação. Confira a autorização da integração.':'Não consegui confirmar o resultado. Confira no serviço antes de repetir.');}catch(e){if(live.current){setError((e as Error).message);onNotice('Não confirmei a gravação. Verifique o serviço antes de repetir.');}}finally{lock.current=false;if(live.current)setBusy(false);}}
 useEffect(()=>{if(confirmSignal>0)void confirm();},[confirmSignal]);
 return <section className="lab-learning-proposal"><strong>Revisar: {labels[proposal.operation]}</strong><h3>{proposal.title}</h3>{proposal.content&&<p style={{whiteSpace:'pre-wrap'}}>{proposal.content}</p>}{proposal.start&&<p>{new Date(proposal.start).toLocaleString('pt-BR')} até {new Date(proposal.end!).toLocaleString('pt-BR')}</p>}{proposal.dueDate&&<p>Prazo: {proposal.dueDate}</p>}{proposal.parentId&&<p>Destino: {proposal.parentId}</p>}
 {proposal.operation!=='notion.page.create'&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setToken(await connectLabGoogleWrite());}catch(e){setError((e as Error).message);}finally{if(live.current)setBusy(false);}}}>{token?'Google autorizado':'Autorizar Google'}</button>}
 {!action?<button type="button" disabled={busy} onClick={()=>void prepare()}>Preparar esta ação</button>:<><p>Estado: {action.status}</p><button type="button" disabled={busy||attempted.current||action.status!=='pending'} onClick={()=>void confirm()}>Confirmar ação</button><small>Você também pode dizer “confirmar ação”.</small></>}
 {error&&<p role="alert">{error}</p>}</section>;
}
