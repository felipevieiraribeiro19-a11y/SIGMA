/** Isolated account-owned operational records for the SIGMA ecosystem LAB. */
import {HttpError} from './validation';
import {buildDailyBriefing} from './core/workspace-briefing';
export type EntryKind='study'|'daily'|'task'|'finance';
export type WorkspaceEntry={id:string;kind:EntryKind;title:string;notes:string;minutes:number;amount:number;done:boolean;createdAt:string;updatedAt:string;dueDate?:string;priority?:'low'|'normal'|'high'};
export function entryPayload(value:unknown):Omit<WorkspaceEntry,'id'|'createdAt'|'updatedAt'>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Registro inválido.');
 const obj=value as Record<string,unknown>;
 if(Object.keys(obj).some(x=>!['kind','title','notes','minutes','amount','done','dueDate','priority'].includes(x)))throw new HttpError(400,'Campos inesperados.');
 const {kind,title,notes='',minutes=0,amount=0,done=false,dueDate,priority}=obj;
 if(!['study','daily','task','finance'].includes(String(kind)))throw new HttpError(400,'Categoria inválida.');
 if(typeof title!=='string'||title.trim().length<2||title.trim().length>160)throw new HttpError(400,'Título inválido.');
 if(typeof notes!=='string'||notes.length>1500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(notes))throw new HttpError(400,'Observações inválidas.');
 if(!Number.isSafeInteger(minutes)||Number(minutes)<0||Number(minutes)>1440)throw new HttpError(400,'Minutos inválidos.');
 if(typeof amount!=='number'||!Number.isFinite(amount)||Math.abs(amount)>1000000)throw new HttpError(400,'Valor financeiro inválido.');
 if(typeof done!=='boolean')throw new HttpError(400,'Conclusão inválida.');
 if((dueDate!==undefined||priority!==undefined)&&kind!=='task')
  throw new HttpError(400,'Prazo e prioridade só podem ser usados em tarefas.');
 if(dueDate!==undefined){
  if(typeof dueDate!=='string'||!/^(?:19|20|21)\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(dueDate)||
     Number.isNaN(Date.parse(dueDate+'T12:00:00Z'))||
     new Date(dueDate+'T12:00:00Z').toISOString().slice(0,10)!==dueDate)
   throw new HttpError(400,'Prazo inválido: informe uma data real no formato AAAA-MM-DD.');
 }
 if(priority!==undefined&&!['low','normal','high'].includes(String(priority)))
  throw new HttpError(400,'Prioridade inválida.');
 return {kind:kind as EntryKind,title:title.trim(),notes:notes.trim(),minutes:minutes as number,
  amount:Math.round((amount as number)*100)/100,done,
  ...(dueDate===undefined?{}:{dueDate:dueDate as string}),
  ...(priority===undefined?{}:{priority:priority as 'low'|'normal'|'high'})};
}
type Tx={get:<V>(key:string)=>Promise<V|undefined>;put:(key:string,value:unknown)=>Promise<unknown>};
type Storage={transaction:<T>(fn:(tx:Tx)=>Promise<T>)=>Promise<T>};
export class LabWorkspaceStore{
 constructor(private state:{storage:Storage}){}
 async fetch(request:Request):Promise<Response>{
  const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const {pathname}=new URL(request.url);
  if(!/^\/entries(?:\/briefing|\/[0-9a-f-]{36})?$/.test(pathname))return json({error:'Rota inexistente.'},404);
  const id=pathname.startsWith('/entries/')?pathname.slice(9):null;
  try{
   if(pathname==='/entries/briefing'&&request.method==='GET'){
    const entries=await this.state.storage.transaction(async tx=>(await tx.get<WorkspaceEntry[]>('entries'))||[]);
    return json(buildDailyBriefing(entries));
   }
   if(request.method==='GET'&&!id){
    const entries=await this.state.storage.transaction(async tx=>(await tx.get<WorkspaceEntry[]>('entries'))||[]);
    const ordered=entries.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const totals={studiedMinutes:entries.filter(x=>x.kind==='study').reduce((a,b)=>a+b.minutes,0),
     financialBalance:Math.round(entries.filter(x=>x.kind==='finance').reduce((a,b)=>a+b.amount,0)*100)/100,
     tasksDone:entries.filter(x=>x.kind==='task'&&x.done).length,
     tasksOpen:entries.filter(x=>x.kind==='task'&&!x.done).length};
    return json({entries:ordered.slice(0,250),totals});
   }
   if(request.method==='POST'&&!id){
    const data=entryPayload(await request.json());
    const entry=await this.state.storage.transaction(async tx=>{
     const list=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     if(list.length>=250)throw new HttpError(409,'Limite de 250 registros no laboratório.');
     const at=new Date().toISOString(),row={...data,id:crypto.randomUUID(),createdAt:at,updatedAt:at};
     await tx.put('entries',[...list,row]);return row;
    });
    return json({entry},201);
   }
   if(pathname==='/entries/briefing')throw new HttpError(405,'Método não permitido.');
   if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new HttpError(400,'Identificador inválido.');
   if(id&&request.method==='PATCH'){
    const data=entryPayload(await request.json());
    const entry=await this.state.storage.transaction(async tx=>{
     const list=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     if(!list.some(x=>x.id===id))throw new HttpError(404,'Registro não encontrado.');
     const changed=list.map(x=>x.id===id?{...x,...data,updatedAt:new Date().toISOString()}:x);
     await tx.put('entries',changed);return changed.find(x=>x.id===id)!;
    });
    return json({entry});
   }
   if(id&&request.method==='DELETE'){
    await this.state.storage.transaction(async tx=>{
     const list=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     if(!list.some(x=>x.id===id))throw new HttpError(404,'Registro não encontrado.');
     await tx.put('entries',list.filter(x=>x.id!==id));
    });
    return json({deleted:true});
   }
   return json({error:'Método não permitido.'},405);
  }catch(e){return json({error:e instanceof HttpError?e.message:'Armazenamento indisponível.'},e instanceof HttpError?e.status:503);}
 }
}
