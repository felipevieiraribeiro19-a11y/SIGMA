import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {ArrowUp,Menu,Paperclip,Mic,Settings2} from 'lucide-react';
import './sigma-home.css';

type OrbState='idle'|'listening'|'thinking'|'speaking';
export function SigmaHome({user,onMenu,onNavigate,onLogin,onSend}:{
 user:User|null;onMenu:()=>void;onNavigate:(page:'chat'|'library'|'settings')=>void;onLogin:()=>void;onSend:(text:string)=>void;
}){
 const [draft,setDraft]=useState(''),[notice,setNotice]=useState(''),[active,setActive]=useState(false);
 const frame=useRef<HTMLIFrameElement|null>(null),playing=useRef<HTMLAudioElement|null>(null),recognition=useRef<any>(null),activeRef=useRef(false),tapRef=useRef<()=>void>(()=>{});
 function state(value:OrbState,pulse=false){
  frame.current?.contentWindow?.postMessage({type:'sigma:set-state',state:value,pulse},window.location.origin);
 }
 function stop(){
  activeRef.current=false;setActive(false);
  if(playing.current){playing.current.pause();playing.current=null;}
  if(recognition.current){try{recognition.current.abort()}catch{}recognition.current=null;}
  if('speechSynthesis'in window)window.speechSynthesis.cancel();
  state('idle');setNotice('');
 }
 function send(text:string){
  const value=text.trim();
  if(!value)return;
  if(!user){setNotice('Entre com Google para conversar com o SIGMA.');onLogin();return;}
  setDraft('');setNotice('Enviando ao SIGMA…');state('thinking');
  stop();
  onSend(value);
 }
 function listen(){
  if(!activeRef.current)return;
  const w=window as any;
  const Speech=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Speech){state('listening');setNotice('Escuta automática indisponível. Use o microfone do chat ou digite.');return;}
  try{
   const rec=new Speech();recognition.current=rec;rec.lang='pt-BR';rec.interimResults=false;rec.continuous=false;
   rec.onresult=(event:any)=>{if(!activeRef.current)return;recognition.current=null;const text=String(event.results?.[0]?.[0]?.transcript||'').trim();if(text)send(text);};
   rec.onerror=(event:any)=>{if(!activeRef.current)return;recognition.current=null;setNotice(event.error==='not-allowed'?'Permita o microfone no Safari ou use a conversa por texto.':'Não consegui ouvir. Use o microfone do chat ou digite.');state('listening');};
   rec.onend=()=>{if(recognition.current===rec)recognition.current=null;};
   state('listening');setNotice('Estou ouvindo…');rec.start();
  }catch{state('listening');setNotice('Use o microfone do chat ou digite.');}
 }
 function tap(){
  if(activeRef.current){stop();return;}
  activeRef.current=true;setActive(true);setNotice('');state('speaking',true);
  const audio=new Audio('https://sigma-home-conceito.felipevieiraribeiro19.workers.dev/voice/greeting.mp3');
  playing.current=audio;
  audio.addEventListener('ended',()=>{playing.current=null;if(activeRef.current)listen()},{once:true});
  audio.addEventListener('error',()=>{playing.current=null;if(activeRef.current){state('listening');setNotice('Áudio indisponível. Use o chat ou toque novamente.');}},{once:true});
  void audio.play().catch(()=>{if(activeRef.current){state('listening');setNotice('O navegador bloqueou o áudio. Use o chat ou toque novamente.');}});
 }
 tapRef.current=tap;
 useEffect(()=>{
  function onMessage(event:MessageEvent){
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
   if(event.data?.type==='sigma:tap')tapRef.current();
   if(event.data?.type==='sigma:ready')state('idle');
  }
  window.addEventListener('message',onMessage);
  return()=>{window.removeEventListener('message',onMessage);activeRef.current=false;playing.current?.pause();try{recognition.current?.abort()}catch{}};
 },[]);
 return <section className="sigma-live-home" aria-label="Início do SIGMA">
  <iframe ref={frame} title="Orbe animado do SIGMA" className="sigma-live-orb" src="/sigma-orb.html"/>
  <header className="sigma-live-header">
   <div className="sigma-live-heading"><button type="button" aria-label="Abrir menu" onClick={onMenu}><Menu size={20}/></button><span className="sigma-live-logo">SIGMA<small>SEMPRE COM VOCÊ</small></span></div>
   <div className="sigma-live-heading">
    {!user&&<button type="button" onClick={onLogin}>Entrar</button>}
    <button type="button" aria-label="Configurações" onClick={()=>onNavigate('settings')}><Settings2 size={20}/></button>
   </div>
  </header>
  <div className="sigma-live-composer">
   {notice&&<p role="status" className="sigma-live-notice">{notice}</p>}
   <form onSubmit={e=>{e.preventDefault();send(draft)}}>
    <button type="button" aria-label="Abrir Biblioteca para anexos" title="Anexos na Biblioteca" onClick={()=>onNavigate('library')}><Paperclip size={20}/></button>
    <button type="button" aria-label="Abrir conversa por voz" title="Voz" onClick={()=>onNavigate('chat')}><Mic size={20}/></button>
    <input aria-label="Mensagem para o SIGMA" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Pergunte qualquer coisa ao SIGMA…" maxLength={3500}/>
    <button className="sigma-live-send" type="submit" disabled={!draft.trim()} aria-label="Enviar mensagem"><ArrowUp size={19}/></button>
   </form>
   <small>{active?'Toque no orbe para encerrar a escuta':'Toque no orbe para iniciar'}</small>
  </div>
 </section>;
}
