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
