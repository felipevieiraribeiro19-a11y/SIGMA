import {useEffect,useRef,useState} from 'react';
import {Paperclip,Mic,Square,Volume2,VolumeX,X} from 'lucide-react';
import {MAX_MEDIA_BYTES,mediaMime} from './media';

type Props={
 busy:boolean;
 attachment:File|null;
 onAttachment:(file:File|null)=>void;
 voiceMode:boolean;
 onVoiceMode:(value:boolean)=>void;
 onVoiceReady:(file:File)=>void;
 onError:(message:string)=>void;
};

export function MediaControls({busy,attachment,onAttachment,voiceMode,onVoiceMode,onVoiceReady,onError}:Props){
 const input=useRef<HTMLInputElement>(null);
 const recorder=useRef<MediaRecorder|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const limit=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [recording,setRecording]=useState(false);

 useEffect(()=>()=>{if(limit.current)clearTimeout(limit.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());},[]);

 function pick(file?:File){
  if(!file)return;
  if(!mediaMime(file)){onError('Arquivo não aceito. Use PDF, imagem, TXT, MP3, M4A ou WAV.');return}
  if(!file.size||file.size>MAX_MEDIA_BYTES){onError(`Arquivo de ${(file.size/(1024*1024)).toFixed(1).replace('.',',')} MB. O limite atual é de 10 MB.`);return}
  onAttachment(file);
 }

 async function toggleRecord(){
  if(recording){
   if(limit.current)clearTimeout(limit.current);
   if(recorder.current?.state==='recording')recorder.current.stop();
   setRecording(false);
   return;
  }
  if(busy)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   onError('Este navegador não permite gravar áudio. Use o ditado do teclado do iPhone.');
   return;
  }
  try{
   const source=await navigator.mediaDevices.getUserMedia({audio:true});
   stream.current=source;
   const formats=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'];
   const mime=formats.find(format=>MediaRecorder.isTypeSupported(format));
   const mediaRecorder=mime?new MediaRecorder(source,{mimeType:mime}):new MediaRecorder(source);
   recorder.current=mediaRecorder;
   const chunks:Blob[]=[];
   const automatic=voiceMode;
   mediaRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   mediaRecorder.onerror=()=>onError('Não foi possível gravar este áudio. Tente novamente.');
   mediaRecorder.onstop=()=>{
    if(limit.current)clearTimeout(limit.current);
    source.getTracks().forEach(t=>t.stop());
    stream.current=null;
    setRecording(false);
    const rawMime=mediaRecorder.mimeType.split(';')[0]||'audio/mp4';
    const ext=rawMime.includes('webm')?'webm':rawMime.includes('ogg')?'ogg':'m4a';
    const normalized=rawMime==='audio/mp4'?'audio/m4a':rawMime;
    const file=new File(chunks,'mensagem-de-voz.'+ext,{type:normalized});
    if(!file.size){onError('O áudio ficou vazio. Grave novamente.');return}
    if(file.size>MAX_MEDIA_BYTES){onError('Áudio acima de 10 MB. Grave uma mensagem mais curta.');return}
    if(automatic)onVoiceReady(file);else onAttachment(file);
   };
   mediaRecorder.start();
   setRecording(true);
   limit.current=setTimeout(()=>{if(mediaRecorder.state==='recording')mediaRecorder.stop()},45000);
  }catch{
   stream.current?.getTracks().forEach(t=>t.stop());
   setRecording(false);
   onError('Microfone indisponível. Permita o acesso nas configurações do iPhone e tente novamente.');
  }
 }

 return <>
  <input ref={input} type="file" className="file-picker" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.webm,.ogg,.aac,application/pdf,image/*,audio/*,text/plain" onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}} aria-label="Selecionar arquivo para o SIGMA"/>
  <button type="button" className="media-action" title="Anexar PDF ou arquivo" aria-label="Anexar PDF ou arquivo" disabled={busy||recording} onClick={()=>input.current?.click()}><Paperclip size={20}/></button>
  <button type="button" className={'media-action '+(recording?'recording':'')} title={recording?'Parar gravação': 'Gravar mensagem de voz'} aria-label={recording?'Parar gravação':'Gravar mensagem de voz'} disabled={busy&&!recording} onClick={()=>void toggleRecord()}>{recording?<Square size={19}/>:<Mic size={20}/>}</button>
  <button type="button" className={'media-action '+(voiceMode?'voice-on':'')} title={voiceMode?'Desativar conversa por voz':'Ativar conversa por voz'} aria-label={voiceMode?'Desativar conversa por voz':'Ativar conversa por voz'} aria-pressed={voiceMode} onClick={()=>onVoiceMode(!voiceMode)}>{voiceMode?<Volume2 size={20}/>:<VolumeX size={20}/>}</button>
  {recording&&<span className="record-hint" role="status">Gravando… toque no quadrado para enviar ou anexar</span>}
  {attachment&&<div className="selected-file" title={attachment.name}><span>Anexo: {attachment.name}</span><button type="button" aria-label="Remover anexo" title="Remover anexo" disabled={busy||recording} onClick={()=>onAttachment(null)}><X size={14}/></button></div>}
 </>;
}
