import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Volume2,VolumeX} from 'lucide-react';
import {speakReply} from './media';
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((e:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type Constructor=new()=>Recognition;
export function SigmaVoice({busy,answer,onText,onError}:{busy:boolean;answer:string;onText:(text:string)=>void;onError:(text:string)=>void}){
 const [listening,setListening]=useState(false),[spoken,setSpoken]=useState(true),[partial,setPartial]=useState('');
 const active=useRef<Recognition|null>(null),live=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const callback=useRef(onText);callback.current=onText;
 useEffect(()=>{live.current=true;const stop=()=>{if(document.hidden){active.current?.abort();window.speechSynthesis?.cancel();}};document.addEventListener('visibilitychange',stop);return()=>{live.current=false;active.current?.abort();if(timer.current)clearTimeout(timer.current);window.speechSynthesis?.cancel();document.removeEventListener('visibilitychange',stop);};},[]);
 useEffect(()=>{if(spoken&&answer)speakReply(answer.replace(/[*#`]/g,''));},[answer]);
 function start(){
  if(listening){active.current?.stop();return;}
  if(busy)return;
  const w=window as typeof window&{SpeechRecognition?:Constructor;webkitSpeechRecognition?:Constructor};
  const C=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!C){onError('Este navegador não oferece ditado. Use o microfone do teclado para ditar sua mensagem.');return;}
  window.speechSynthesis?.cancel();
  const recognition=new C();active.current=recognition;
  recognition.lang='pt-BR';recognition.continuous=false;recognition.interimResults=true;
  let finalText='',failed=false;
  recognition.onresult=e=>{let text='';finalText='';for(const r of Array.from(e.results)){text+=r[0].transcript;if(r.isFinal)finalText+=r[0].transcript;}if(live.current)setPartial(text);};
  recognition.onerror=e=>{failed=true;if(live.current&&e.error!=='aborted')onError(e.error==='not-allowed'?'Permita o microfone no Safari para falar com o SIGMA.':'Não consegui ouvir. Tente novamente ou use o ditado do teclado.');};
  recognition.onend=()=>{if(document.hidden)failed=true;if(timer.current)clearTimeout(timer.current);active.current=null;if(!live.current)return;setListening(false);setPartial('');if(!failed&&finalText.trim())callback.current(finalText.trim());};
  try{recognition.start();setListening(true);timer.current=setTimeout(()=>recognition.stop(),45000);}catch{onError('Não foi possível iniciar o microfone. Tente novamente.');}
 }
 return <div className="sigma-voice" aria-label="Conversa por voz">
  <button type="button" disabled={busy&&!listening} aria-pressed={listening} onClick={start}>{listening?<Square size={18}/>:<Mic size={18}/>} {listening?'Terminar fala':'Falar com SIGMA'}</button>
  <button type="button" aria-pressed={spoken} onClick={()=>{setSpoken(!spoken);if(spoken)window.speechSynthesis?.cancel();else if(answer)speakReply(answer);}}>{spoken?<Volume2 size={18}/>:<VolumeX size={18}/>} {spoken?'Respostas em voz ligadas':'Ouvir respostas'}</button>
  <button type="button" onClick={()=>window.speechSynthesis?.cancel()}>Parar voz</button>
  <small role="status">{listening?(partial||'Estou ouvindo…'):'Toque para falar. Ao terminar, sua fala será enviada ao chat. Mantenha esta página aberta.'}</small>
 </div>;
}
