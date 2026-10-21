export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export type MediaAttachment = {name:string;mimeType:string;data:string};

export function mediaMime(file:File):string {
  const ext=file.name.toLowerCase().split('.').pop() || '';
  if(ext==='pdf') return 'application/pdf';
  if(ext==='txt'||ext==='md') return 'text/plain';
  if(['jpg','jpeg'].includes(ext)) return 'image/jpeg';
  if(ext==='png') return 'image/png';
  if(ext==='webp') return 'image/webp';
  if(ext==='mp3') return 'audio/mpeg';
  if(ext==='wav') return 'audio/wav';
  if(ext==='m4a'||ext==='mp4'||file.type.startsWith('audio/mp4')) return 'audio/m4a';
  if(ext==='webm'||file.type.startsWith('audio/webm')) return 'audio/webm';
  if(ext==='ogg') return 'audio/ogg';
  if(ext==='aac') return 'audio/aac';
  return '';
}

export async function encodeMedia(file:File):Promise<MediaAttachment> {
  const mimeType=mediaMime(file);
  if(!mimeType) throw new Error('Arquivo não aceito. Use PDF, TXT, imagem ou áudio (MP3, M4A, WAV, WebM).');
  if(!file.size||file.size>MAX_MEDIA_BYTES) throw new Error('O anexo precisa ter até 10 MB nesta versão.');
  const data=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const value=reader.result;
      if(typeof value!=='string'||!value.includes(',')) reject(new Error('Não foi possível ler o arquivo.'));
      else resolve(value.slice(value.indexOf(',')+1));
    };
    reader.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
  return {name:file.name.slice(0,100),mimeType,data};
}

export function speakReply(text:string,onFinish?:()=>void):boolean {
  if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text.slice(0,7000));
  utterance.lang='pt-BR';
  utterance.rate=1.04;
  const voice=window.speechSynthesis.getVoices().find(v=>v.lang.toLowerCase()==='pt-br');
  if(voice) utterance.voice=voice;
  utterance.onend=()=>onFinish?.();
  utterance.onerror=()=>onFinish?.();
  window.speechSynthesis.speak(utterance);
  return true;
}
