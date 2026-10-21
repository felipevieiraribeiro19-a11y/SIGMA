export type Message={role:'user'|'assistant';text:string};
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export function validateMessages(value:unknown):Message[]{
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>k!=='messages'))throw new HttpError(400,'Formato de mensagem inválido.');
 const messages=(value as {messages?:unknown}).messages;
 if(!Array.isArray(messages)||!messages.length||messages.length>15)throw new HttpError(400,'Envie de 1 a 15 mensagens.');
 let total=0;
 for(let i=0;i<messages.length;i++){const m=messages[i];if(!m||typeof m!=='object'||Object.keys(m).some(k=>!['role','text'].includes(k))||m.role!==(i%2===0?'user':'assistant')||typeof m.text!=='string'||!m.text.trim()||m.text.length>(m.role==='user'?4000:12000))throw new HttpError(400,'Mensagem inválida ou muito longa.');total+=m.text.length}
 if(messages.at(-1).role!=='user'||total>24000)throw new HttpError(400,'O contexto ultrapassou o limite. Comece uma nova conversa.');
 return messages;
}
export function quotaDecision(state:{day:string;count:number;minute:number;minuteCount:number}|undefined,now:number,daily=60){const day=new Date(now).toISOString().slice(0,10),minute=Math.floor(now/60000);const next=state?.day===day?{...state}:{day,count:0,minute,minuteCount:0};if(next.minute!==minute){next.minute=minute;next.minuteCount=0}if(next.count>=daily||next.minuteCount>=5)return {allowed:false,state:next};next.count++;next.minuteCount++;return {allowed:true,state:next};}

export type Attachment={name:string;mimeType:string;data:string};
export function validateAttachment(raw:unknown):Attachment|undefined {
 if(raw===undefined||raw===null)return undefined;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Anexo inválido.');
 const a=raw as Record<string,unknown>;
 if(Object.keys(a).some(k=>!['name','mimeType','data'].includes(k)))throw new HttpError(400,'Anexo inválido.');
 const types=['application/pdf','text/plain','image/jpeg','image/png','image/webp','audio/mpeg','audio/mp3','audio/wav','audio/m4a','audio/webm','audio/ogg','audio/aac'];
 if(typeof a.name!=='string'||!a.name.trim()||a.name.length>100||/[\\x00-\\x1f]/.test(a.name)||typeof a.mimeType!=='string'||!types.includes(a.mimeType)||typeof a.data!=='string'||a.data.length<4||a.data.length>4194304||!(/^[A-Za-z0-9+/]+={0,2}$/).test(a.data)||a.data.length%4!==0)throw new HttpError(400,'Anexo inválido ou maior que 3 MB.');
 return {name:a.name,mimeType:a.mimeType,data:a.data};
}
