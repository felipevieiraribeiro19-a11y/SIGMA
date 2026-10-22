/** Contrato do chat experimental. Zero persistência, sem backend de produção. */
export type LabChatMessage={role:'user'|'assistant';text:string};
export type LabWebSource={title:string;url:string;publishedDate?:string};
export function validLabApiBase(value:unknown):string|null{
 if(typeof value!=='string'||!value.trim())return null;
 try{
  const url=new URL(value);
  // Não aceitar o Worker de produção, nem domínios de terceiros.
  if(url.protocol!=='https:'||!/^sigma-jarvis-cerebro-lab\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
   ||url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password)
   return null;
  return url.origin;
 }catch{return null;}
}
export function nextLabMessages(history:LabChatMessage[],text:string):LabChatMessage[]{
 const trimmed=text.trim();
 if(!trimmed||trimmed.length>2000)throw Error('Envie até 2.000 caracteres.');
 const recent=history.slice(-10);
 if(recent.some((m,i)=>m.role!==(i%2===0?'user':'assistant')))
  throw Error('Histórico local inconsistente.');
 return [...recent,{role:'user',text:trimmed}];
}
export function assertLabReply(data:unknown):string{
 if(!data||typeof data!=='object')throw Error('Resposta inválida do laboratório.');
 const r=data as Record<string,unknown>;
 if(r.persisted!==false||r.executed!==false||(r.provider!=='gemini'&&r.provider!=='lab')||
  typeof r.text!=='string'||!r.text.trim()||r.text.length>12000)
  throw Error('Servidor respondeu fora do contrato seguro.');
 return r.text;
}

export function readLabWebSources(data:unknown):LabWebSource[]{
 const body=data as {web?:{searched?:unknown;sources?:unknown}}|null;
 if(!body?.web)return [];
 if(body.web.searched!==true||!Array.isArray(body.web.sources)||body.web.sources.length>4)
  throw Error('Lista de fontes inválida.');
 return body.web.sources.map((x:unknown)=>{
  const item=x as Record<string,unknown>|null;
  if(!item||typeof item.title!=='string'||!item.title.trim()||item.title.length>130||
   typeof item.url!=='string'||item.url.length>1500)throw Error('Fonte inválida.');
  let link:URL;
  try{link=new URL(item.url);}catch{throw Error('Link inválido.');}
  if(link.protocol!=='https:'||!link.hostname.includes('.'))
   throw Error('Fonte precisa de HTTPS.');
  return {title:item.title,url:link.href,
   ...(typeof item.publishedDate==='string'&&item.publishedDate.length<=40?
    {publishedDate:item.publishedDate}:{})};
 });
}
