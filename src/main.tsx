import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Menu,X,ArrowUp,LoaderCircle,Volume2} from 'lucide-react';
import {MediaControls} from './MediaControls';
import {speakReply} from './media';
import type {User} from 'firebase/auth';
import {bootstrap,login,logout,verifyDatabase,sendChat,loadHistory,readableError,type Config,type Message,type Turn} from './services';
import './style.css';

function LinkedMessage({text}:{text:string}){
 return <>{text.split(/(https:\/\/[^\s<>"']+)/g).map((part,i)=>{
  if(!part.startsWith('https://'))return <React.Fragment key={i}>{part}</React.Fragment>;
  try{
   const url=new URL(part);
   if(url.protocol!=='https:')return <React.Fragment key={i}>{part}</React.Fragment>;
   return <a key={i} href={url.toString()} target="_blank" rel="noopener noreferrer" aria-label={'Abrir fonte '+url.hostname}>{url.hostname} ↗</a>;
  }catch{return <React.Fragment key={i}>{part}</React.Fragment>}
 })}</>;
}
function App(){
 const [config,setConfig]=useState<Config|null>(null),[user,setUser]=useState<User|null>(null),[messages,setMessages]=useState<Message[]>([]),[turns,setTurns]=useState<Turn[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState(false),[status,setStatus]=useState('Conexão pendente'),[attachment,setAttachment]=useState<File|null>(null),[voiceMode,setVoiceMode]=useState(false);
 const abort=useRef<AbortController|null>(null),epoch=useRef(0),pending=useRef<{text:string;id:string}|null>(null),bottom=useRef<HTMLDivElement>(null);
 const orbFrame=useRef<HTMLIFrameElement|null>(null),orbActive=useRef(false),orbAudio=useRef<HTMLAudioElement|null>(null),orbRecognizer=useRef<any>(null),orbTap=useRef<()=>void>(()=>{});
 function orbState(state:'idle'|'listening'|'thinking'|'speaking',pulse=false){
   orbFrame.current?.contentWindow?.postMessage({type:'sigma:set-state',state,pulse},window.location.origin);
 }
 function stopOrb(){
   orbActive.current=false;
   if(orbAudio.current){orbAudio.current.pause();orbAudio.current=null;}
   if(orbRecognizer.current){try{orbRecognizer.current.abort()}catch{}orbRecognizer.current=null;}
   if('speechSynthesis'in window)window.speechSynthesis.cancel();
   setVoiceMode(false);orbState('idle');setStatus('Toque no orbe para conversar');
 }
 function listenOrb(){
   if(!orbActive.current)return;
   const w=window as any;
   const Recognition=w.SpeechRecognition||w.webkitSpeechRecognition;
   if(!Recognition){orbState('listening');setStatus('Escuta automática indisponível. Use o microfone da barra ou digite.');return;}
   try{
     const rec=new Recognition();orbRecognizer.current=rec;
     rec.lang='pt-BR';rec.interimResults=false;rec.continuous=false;
     rec.onresult=(event:any)=>{if(!orbActive.current)return;orbRecognizer.current=null;const text=String(event.results?.[0]?.[0]?.transcript||'').trim();if(text)void submit(undefined,undefined,text);};
     rec.onerror=(event:any)=>{if(!orbActive.current)return;orbRecognizer.current=null;orbState('listening');setStatus(event.error==='not-allowed'?'Permita o microfone no Safari ou use o botão de gravação.':'Não consegui ouvir. Use o microfone da barra ou toque novamente.');};
     rec.onend=()=>{if(orbRecognizer.current===rec)orbRecognizer.current=null;};
     orbState('listening');setStatus('Ouvindo…');rec.start();
   }catch{orbState('listening');setStatus('Escuta automática indisponível. Use o microfone da barra.');}
 }
 function tapOrb(){
   if(orbActive.current){stopOrb();return;}
   orbActive.current=true;setVoiceMode(true);orbState('speaking',true);setStatus('SIGMA está falando…');
   const audio=new Audio('https://sigma-home-conceito.felipevieiraribeiro19.workers.dev/voice/greeting.mp3');
   orbAudio.current=audio;
   audio.addEventListener('ended',()=>{orbAudio.current=null;if(orbActive.current)listenOrb()},{once:true});
   audio.addEventListener('error',()=>{orbAudio.current=null;if(orbActive.current){orbState('listening');setStatus('Não foi possível reproduzir a saudação. Use o microfone da barra.');}},{once:true});
   void audio.play().catch(()=>{if(orbActive.current){orbState('listening');setStatus('Áudio bloqueado. Toque novamente ou use o microfone da barra.');}});
 }
 orbTap.current=tapOrb;
 useEffect(()=>{
   const handler=(event:MessageEvent)=>{
     if(event.origin!==window.location.origin||event.source!==orbFrame.current?.contentWindow)return;
     if(event.data?.type==='sigma:tap')orbTap.current();
     if(event.data?.type==='sigma:ready')orbState('idle');
   };
   window.addEventListener('message',handler);
   return()=>{window.removeEventListener('message',handler);};
 },[]);

 useEffect(()=>{bootstrap(setUser).then(setConfig).catch(e=>setError(readableError(e)));return()=>abort.current?.abort()},[]);
 useEffect(()=>{const version=++epoch.current;abort.current?.abort();setMessages([]);setTurns([]);pending.current=null;setStatus('Conexão pendente');if(!user||!config)return;setBusy(true);(async()=>{const [,records]=await Promise.all([verifyDatabase(user),loadHistory(config,user)]);if(epoch.current!==version)return;setTurns(records);setMessages(records.slice(-15).flatMap(t=>[{role:'user' as const,text:t.userText},{role:'assistant' as const,text:t.assistantText}]));setStatus('Histórico recuperado')})().catch(e=>{if(epoch.current===version)setError(readableError(e))}).finally(()=>{if(epoch.current===version)setBusy(false)});},[user?.uid,config]);
 useEffect(()=>{try{bottom.current?.scrollIntoView({behavior:'smooth'});}catch(error){console.warn('SIGMA: rolagem indisponível neste navegador',error);}},[messages,busy]);
 async function submit(e?:React.FormEvent,voiceFile?:File,spokenText?:string){e?.preventDefault();const file=voiceFile||attachment;if((!(spokenText??draft).trim()&&!file)||busy)return;if(!user||!config?.apiBaseUrl){setError('Conecte o Firebase e o backend nas configurações para conversar.');setMenu(true);return}const version=epoch.current,original=(spokenText??draft).trim(),text=(original||(file?.type.startsWith('audio/')?'🎙️ Mensagem de voz':'Analise o arquivo anexado.'))+(file?'\n📎 '+file.name.slice(0,90):'');if(pending.current?.text!==text)pending.current={text,id:crypto.randomUUID()};const turnId=pending.current.id;const next:Message[]=[...messages,{role:'user',text}];setMessages(next);setDraft('');setError('');setBusy(true);setStatus('Consultando memória…');if(orbActive.current)orbState('thinking');const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),file?95000:65000);try{const history=next.slice(-15);while(history[0]?.role!=='user')history.shift();const answer=await sendChat(config,user,history,controller.signal,turnId,file||undefined);if(epoch.current!==version)return;setMessages([...next,{role:'assistant',text:answer}]);setTurns(t=>[...t,{id:turnId,userText:text,assistantText:answer,createdAt:new Date().toISOString()}]);pending.current=null;setAttachment(null);setStatus('Conversa salva no Firebase');if(voiceMode||orbActive.current){if(orbActive.current)orbState('speaking');if(!speakReply(answer,()=>{if(orbActive.current)listenOrb()})){if(orbActive.current)listenOrb();}}}catch(e){if(epoch.current!==version)return;setMessages(messages);setDraft(original);setAttachment(file||null);setStatus('Gravação não confirmada');if(orbActive.current)orbState('listening');setError(controller.signal.aborted?'A confirmação demorou. Tente novamente: a mesma mensagem reutiliza seu identificador para evitar duplicação.':readableError(e))}finally{clearTimeout(timer);if(epoch.current===version)setBusy(false)}}
 async function signIn(){try{setError('');await login()}catch(e){setError(readableError(e))}}
 function exportRecords(){const url=URL.createObjectURL(new Blob([JSON.stringify({scope:'Até 100 interações recuperadas mais as desta sessão; não é uma exportação completa',turns},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sigma-registros.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <div className="app sigma-production"><iframe ref={orbFrame} className="orb-visual" title="Orbe animado SIGMA" src="/sigma-orb.html" aria-hidden="true"/><header><a href="#" className="brand">Σ <span>SIGMA</span></a><button aria-label="Abrir menu" onClick={()=>setMenu(true)}><Menu size={22}/></button></header><main><div className="conversation" aria-live="polite">{messages.length===0?<div className="welcome sigma-welcome" aria-hidden="true"/>:messages.map((m,i)=><article key={i} className={m.role}><span>{m.role==='user'?'Você':'SIGMA'}</span><p><LinkedMessage text={m.text}/></p>{m.role==='assistant'&&<button type="button" className="listen-answer" onClick={()=>{if(!speakReply(m.text))setError('Leitura em voz alta indisponível neste navegador.')}} aria-label="Ouvir resposta do SIGMA"><Volume2 size={15}/> Ouvir</button>}</article>)}{busy&&<p className="thinking"><LoaderCircle size={15}/> Consultando e organizando…</p>}<div ref={bottom}/></div><div className="composer-wrap">{error&&<div className="error" role="alert">{error}<button aria-label="Fechar aviso" onClick={()=>setError('')}><X size={16}/></button></div>}<form onSubmit={submit}><MediaControls busy={busy} attachment={attachment} onAttachment={setAttachment} voiceMode={voiceMode} onVoiceMode={setVoiceMode} onVoiceReady={file=>{void submit(undefined,file)}} onError={setError}/><textarea aria-label="Mensagem para o SIGMA" placeholder="Converse com o SIGMA…" rows={2} maxLength={3800} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/><button className="send" aria-label="Enviar" disabled={busy||(!draft.trim()&&!attachment)}><ArrowUp size={21}/></button></form><small className="status">{voiceMode?'Conversa por voz ativada · toque no microfone para falar · ':''}{status}</small></div></main>{menu&&<div className="backdrop" onClick={()=>setMenu(false)}><aside role="dialog" aria-modal="true" aria-label="Estudos e configurações" onClick={e=>e.stopPropagation()}><button className="close" aria-label="Fechar menu" onClick={()=>setMenu(false)}><X/></button><h2>Seu espaço</h2><p>Analista de Finanças · Curitiba</p><h3>Registros de estudo</h3><p>Conte por mensagem o que estudou. O relato original fica no histórico. Tempo e desempenho só são considerados quando você os informa.</p><p>Memória da IA: até 100 interações recentes. PDFs e áudios enviados são analisados na hora; os arquivos originais não ficam guardados no Firebase nesta versão.</p><button disabled={busy} onClick={()=>{setMessages([]);setMenu(false)}}>Nova conversa · preservar registros</button><button disabled={!turns.length} onClick={exportRecords}>Exportar registros carregados</button><h3>Conexões</h3><p>{user?'Conta Google conectada':config?.firebase.apiKey?'Entre com sua conta Google':'Firebase ainda não configurado'}</p><p>{config?.apiBaseUrl?'Backend configurado · requer teste real':'Backend ainda não configurado'}</p>{user?<button disabled={busy} onClick={()=>logout().catch(e=>setError(readableError(e)))}>Sair da conta</button>:<button disabled={!config?.firebase.apiKey} onClick={signIn}>Entrar com Google</button>}<h3>Privacidade</h3><p>O histórico recuperado é enviado ao provedor para responder. Evite dados pessoais ou sensíveis no Gemini gratuito. Exclusão e edição dos registros ainda não disponíveis nesta versão.</p><a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Abrir Firebase</a></aside></div>}</div>
}
createRoot(document.getElementById('root')!).render(<App/>);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
