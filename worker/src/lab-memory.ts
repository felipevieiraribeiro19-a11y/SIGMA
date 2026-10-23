/**
 * Stage 16: separate, opt-in LAB memory store.
 * A record exists ONLY after an authenticated, explicit user action.
 * Never reads Firestore, production memory, messages or Google accounts.
 */
import {HttpError} from './validation';

export type LabMemoryEntry={
 id:string; text:string; createdAt:string; updatedAt:string
};
export const LAB_MEMORY_LIMIT=30;
export const LAB_MEMORY_MAX_LENGTH=500;

export function validateLabMemoryText(value:unknown):string{
 if(typeof value!=='string')throw new HttpError(400,'Memória deve ser texto.');
 const text=value.trim();
 if(text.length<3||text.length>LAB_MEMORY_MAX_LENGTH)
  throw new HttpError(400,'A memória deve conter entre 3 e 500 caracteres.');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
  throw new HttpError(400,'Caracteres de controle não permitidos.');
 return text;
}
export function validateLabMemoryId(value:unknown):string{
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
  throw new HttpError(400,'Identificador inválido.');
 return value;
}
export function parseLabMemoryPayload(value:unknown):string{
 if(!value||typeof value!=='object'||Array.isArray(value)||
   Object.keys(value).length!==1||!Object.hasOwn(value,'text'))
  throw new HttpError(400,'Envie somente o campo text.');
 return validateLabMemoryText((value as {text:unknown}).text);
}
type Store={transaction:<T>(cb:(tx:{
 get:<V>(key:string)=>Promise<V|undefined>;
 put:(key:string,value:unknown)=>Promise<unknown>
 })=>Promise<T>)=>Promise<T>};
export class LabMemoryStore{
 constructor(private readonly state:{storage:Store}){}
 async fetch(request:Request):Promise<Response>{
  const json=(v:unknown,code=200)=>new Response(JSON.stringify(v),{
   status:code,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
  });
  const url=new URL(request.url);
  if(url.origin!=='https://lab-memory.internal'||url.search||url.hash)
   return json({error:'Rota interna inválida.'},404);
  const path=url.pathname;
  if(path!=='/entries'&&path!=='/settings'&&!/^\/entries\/[0-9a-f-]{36}$/i.test(path))
   return json({error:'Rota inexistente.'},404);
  try{
   if(path==='/settings'){
    if(request.method==='GET'){
     const recallEnabled=await this.state.storage.transaction(async tx=>
      (await tx.get<boolean>('recallEnabled'))===true);
     return json({recallEnabled});
    }
    if(request.method==='PATCH'){
     const value=await request.json().catch(()=>null);
     if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).length!==1||typeof (value as {recallEnabled?:unknown}).recallEnabled!=='boolean')
      throw new HttpError(400,'Envie somente recallEnabled como verdadeiro ou falso.');
     const recallEnabled=(value as {recallEnabled:boolean}).recallEnabled;
     await this.state.storage.transaction(async tx=>{await tx.put('recallEnabled',recallEnabled);});
     return json({recallEnabled});
    }
    return json({error:'Método não permitido.'},405);
   }
   const read=async()=>await this.state.storage.transaction(async tx=>
    (await tx.get<LabMemoryEntry[]>('entries'))||[]);
   if(request.method==='GET'&&path==='/entries'){
    const entries=await read();
    return json({entries:entries.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
   }
   if(request.method==='POST'&&path==='/entries'){
    const text=parseLabMemoryPayload(await request.json());
    const entry=await this.state.storage.transaction(async tx=>{
     const rows=(await tx.get<LabMemoryEntry[]>('entries'))||[];
     if(rows.length>=LAB_MEMORY_LIMIT)throw new HttpError(409,'Limite de 30 memórias atingido.');
     const stamp=new Date().toISOString();
     const created:LabMemoryEntry={id:crypto.randomUUID(),text,createdAt:stamp,updatedAt:stamp};
     await tx.put('entries',[...rows,created]);
     return created;
    });
    return json({entry},201);
   }
   if(request.method==='PATCH'&&path.startsWith('/entries/')){
    const id=validateLabMemoryId(path.slice(9));
    const text=parseLabMemoryPayload(await request.json());
    const entry=await this.state.storage.transaction(async tx=>{
     const rows=(await tx.get<LabMemoryEntry[]>('entries'))||[];
     const index=rows.findIndex(x=>x.id===id);
     if(index<0)throw new HttpError(404,'Memória não encontrada.');
     const updated={...rows[index],text,updatedAt:new Date().toISOString()};
     await tx.put('entries',rows.map((x,i)=>i===index?updated:x));
     return updated;
    });
    return json({entry});
   }
   if(request.method==='DELETE'&&path==='/entries'){
    await this.state.storage.transaction(async tx=>{await tx.put('entries',[]);});
    return json({deletedAll:true});
   }
   if(request.method==='DELETE'&&path.startsWith('/entries/')){
    const id=validateLabMemoryId(path.slice(9));
    await this.state.storage.transaction(async tx=>{
     const rows=(await tx.get<LabMemoryEntry[]>('entries'))||[];
     if(!rows.some(x=>x.id===id))throw new HttpError(404,'Memória não encontrada.');
     await tx.put('entries',rows.filter(x=>x.id!==id));
    });
    return json({deleted:true});
   }
   return json({error:'Método não permitido.'},405);
  }catch(e){
   const code=e instanceof HttpError?e.status:503;
   return json({error:e instanceof HttpError?e.message:'Armazenamento indisponível.'},code);
  }
 }
}
