/** Two-stage, owner-bound, single-claim external action ledger for LAB only. */
import {HttpError} from './validation';
export type Operation='calendar.create'|'drive.folder.create'|'notion.page.create'|'tasks.create'|'drive.note.create';
export type ActionData={operation:Operation;title:string;start?:string;end?:string;parentId?:string;content?:string;dueDate?:string};
export type ActionStatus='pending'|'in_progress'|'succeeded'|'uncertain'|'failed';
export type LabAction={id:string;data:ActionData;status:ActionStatus;createdAt:string;expiresAt:string;finishedAt?:string;providerId?:string};
const uuid=/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
export function actionPayload(raw:unknown):ActionData{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Ação inválida.');
 const obj=raw as Record<string,unknown>;
 if(Object.keys(obj).some(k=>!['operation','title','start','end','parentId','content','dueDate'].includes(k)))throw new HttpError(400,'Campos extras não permitidos.');
 const {operation,title,start,end,parentId,content,dueDate}=obj;
 if(!['calendar.create','drive.folder.create','notion.page.create','tasks.create','drive.note.create'].includes(String(operation)))
  throw new HttpError(400,'Ação não permitida.');
 if(typeof title!=='string'||title.trim().length<3||title.trim().length>130||
  /[\x00-\x1f]/.test(title))throw new HttpError(400,'Título de ação inválido.');
 if(content!==undefined&&(typeof content!=='string'||content.length>4000||/[\x00]/.test(content)))throw new HttpError(400,'Texto inválido (máximo 4.000 caracteres).');
 if(dueDate!==undefined&&(typeof dueDate!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate))||new Date(dueDate).toISOString().slice(0,10)!==dueDate))throw new HttpError(400,'Prazo inválido.');
 if(operation!=='tasks.create'&&dueDate!==undefined)throw new HttpError(400,'Esta ação não usa prazo.');
 if(operation==='drive.folder.create'&&content!==undefined)throw new HttpError(400,'Pasta não usa conteúdo.');
 if(operation==='calendar.create'){
  if(typeof start!=='string'||typeof end!=='string'||start.length>45||end.length>45||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(end)||
   !Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||
   Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>7*86400000)
   throw new HttpError(400,'Horário inicial/final inválido. Use ISO com fuso.');
  if(parentId!==undefined)throw new HttpError(400,'O calendário não usa parentId.');
  return {operation:operation as Operation,title:title.trim(),start,end,...(content?{content:content as string}:{})};
 }
 if(start!==undefined||end!==undefined)throw new HttpError(400,'Esta ação não usa horários.');
 if(operation==='tasks.create'){
  if(parentId!==undefined)throw new HttpError(400,'Tarefas são criadas na lista padrão.');
  return {operation,title:title.trim(),...(content?{content:content as string}:{}),...(dueDate?{dueDate:dueDate as string}:{})};
 }
 if(operation==='notion.page.create'){
  if(typeof parentId!=='string'||!uuid.test(parentId))throw new HttpError(400,'Informe o ID da página-mãe do Notion.');
  return {operation:operation as Operation,title:title.trim(),parentId,...(content?{content:content as string}:{})};
 }
 if(parentId!==undefined&&typeof parentId!=='string')throw new HttpError(400,'Pasta-mãe inválida.');
 if(parentId&&(!/^[A-Za-z0-9_-]{4,120}$/.test(parentId)))throw new HttpError(400,'ID da pasta-mãe inválido.');
 return {operation:operation as Operation,title:title.trim(),...(parentId?{parentId}:{}),...(content?{content:content as string}:{})};
}
type Tx={get:<T>(k:string)=>Promise<T|undefined>;put:(k:string,v:unknown)=>Promise<unknown>};
type Storage={transaction:<T>(fn:(tx:Tx)=>Promise<T>)=>Promise<T>};
export class LabExternalActionStore{
 constructor(private state:{storage:Storage}){}
 async fetch(request:Request):Promise<Response>{
  const json=(x:unknown,code=200)=>new Response(JSON.stringify(x),{status:code,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const path=new URL(request.url).pathname;
  const params=/^\/(?:claim|finish|status)\/([0-9a-f-]{36})$/.exec(path);
  if(path!=='/propose'&&!params)return json({error:'Rota inexistente.'},404);
  try{
   if(path==='/propose'&&request.method==='POST'){
    const data=actionPayload(await request.json());
    const result=await this.state.storage.transaction(async tx=>{
     const entries=(await tx.get<LabAction[]>('actions'))||[];
     const keep=entries.filter(a=>Date.parse(a.createdAt)>Date.now()-30*86400000);
     if(keep.length>=100)throw new HttpError(429,'Muitas propostas nesta conta.');
     const at=new Date().toISOString(),id=crypto.randomUUID();
     const row:LabAction={id,data,status:'pending',createdAt:at,expiresAt:new Date(Date.now()+600000).toISOString()};
     await tx.put('actions',[...keep,row]);return row;
    });
    return json({action:result,requiresConfirmation:true},201);
   }
   const id=params?.[1];
   if(!id||!uuid.test(id))throw new HttpError(400,'Identificador inválido.');
   if(path.startsWith('/status/')&&request.method==='GET'){
    const entries=await this.state.storage.transaction(async tx=>(await tx.get<LabAction[]>('actions'))||[]);
    const row=entries.find(x=>x.id===id);
    return row?json({action:row}):json({error:'Ação não encontrada.'},404);
   }
   if(path.startsWith('/claim/')&&request.method==='POST'){
    const value=await request.json().catch(()=>null);
    if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).length!==1||(value as {confirmed?:unknown}).confirmed!==true)
     throw new HttpError(400,'Confirmação literal obrigatória.');
    const row=await this.state.storage.transaction(async tx=>{
     const items=(await tx.get<LabAction[]>('actions'))||[];
     const found=items.find(x=>x.id===id);
     if(!found)throw new HttpError(404,'Ação não encontrada.');
     if(found.status!=='pending')throw new HttpError(409,'Ação já confirmada ou em execução; não repetir.');
     if(Date.parse(found.expiresAt)<=Date.now())throw new HttpError(410,'Proposta expirada. Crie uma nova.');
     const next={...found,status:'in_progress' as const};
     await tx.put('actions',items.map(x=>x.id===id?next:x));return next;
    });
    return json({action:row});
   }
   if(path.startsWith('/finish/')&&request.method==='POST'){
    const val=await request.json().catch(()=>null) as {status?:unknown;providerId?:unknown}|null;
    if(!val||Object.keys(val).some(k=>!['status','providerId'].includes(k))||
     !['succeeded','uncertain','failed'].includes(String(val.status)))
     throw new HttpError(400,'Resultado inválido.');
    const result=await this.state.storage.transaction(async tx=>{
     const list=(await tx.get<LabAction[]>('actions'))||[];
     const found=list.find(x=>x.id===id);
     if(!found)throw new HttpError(404,'Ação não encontrada.');
     if(found.status!=='in_progress')throw new HttpError(409,'Ação já finalizada.');
     const status=val.status as 'succeeded'|'uncertain'|'failed';
     const providerId=typeof val.providerId==='string'?val.providerId.slice(0,128):undefined;
     const next={...found,status,finishedAt:new Date().toISOString(),...(providerId?{providerId}:{})};
     await tx.put('actions',list.map(x=>x.id===id?next:x));return next;
    });
    return json({action:result});
   }
   return json({error:'Método não permitido.'},405);
  }catch(e){return json({error:e instanceof HttpError?e.message:'Falha ao registrar proposta.'},e instanceof HttpError?e.status:503);}
 }
}
