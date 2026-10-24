/** Isolated account-owned operational records for the SIGMA ecosystem LAB. */
import {HttpError} from './validation';
import {buildDailyBriefing} from './core/workspace-briefing';
import {parseCycleSubjects,summarizeStudyCycle,type StudyCycleConfig} from './core/study-cycle';
import {PROJECT_LIMIT,projectCreatePayload,projectPatchPayload,projectOverview,type Project} from './core/universal-projects';
export type EntryKind='study'|'daily'|'task'|'finance';
export type WorkspaceEntry={id:string;kind:EntryKind;title:string;notes:string;minutes:number;amount:number;done:boolean;createdAt:string;updatedAt:string;dueDate?:string;priority?:'low'|'normal'|'high';subject?:string;questionsTotal?:number;questionsCorrect?:number;projectId?:string};
export function entryPayload(value:unknown):Omit<WorkspaceEntry,'id'|'createdAt'|'updatedAt'>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Registro inválido.');
 const obj=value as Record<string,unknown>;
 if(Object.keys(obj).some(x=>!['kind','title','notes','minutes','amount','done','dueDate','priority','subject','questionsTotal','questionsCorrect','projectId'].includes(x)))throw new HttpError(400,'Campos inesperados.');
 const {kind,title,notes='',minutes=0,amount=0,done=false,dueDate,priority,subject,questionsTotal,questionsCorrect,projectId}=obj;
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
 if(projectId!==undefined&&(typeof projectId!=='string'||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)))
  throw new HttpError(400,'Identificador de projeto inválido.');
 if((subject!==undefined||questionsTotal!==undefined||questionsCorrect!==undefined)&&kind!=='study')
  throw new HttpError(400,'Matéria e questões só podem ser usadas em registros de estudo.');
 if(subject!==undefined&&(typeof subject!=='string'||subject.trim().length<2||
  subject.trim().length>80||/[\x00-\x1f]/.test(subject)))
  throw new HttpError(400,'Matéria inválida.');
 if((questionsTotal===undefined)!==(questionsCorrect===undefined))
  throw new HttpError(400,'Informe juntas as quantidades de questões e de acertos.');
 if(questionsTotal!==undefined&&(
  !Number.isSafeInteger(questionsTotal)||Number(questionsTotal)<0||Number(questionsTotal)>5000||
  !Number.isSafeInteger(questionsCorrect)||Number(questionsCorrect)<0||
  Number(questionsCorrect)>Number(questionsTotal)))
  throw new HttpError(400,'Quantidade de questões ou acertos inválida.');
 return {kind:kind as EntryKind,title:title.trim(),notes:notes.trim(),minutes:minutes as number,
  amount:Math.round((amount as number)*100)/100,done,
  ...(dueDate===undefined?{}:{dueDate:dueDate as string}),
  ...(priority===undefined?{}:{priority:priority as 'low'|'normal'|'high'}),
  ...(subject===undefined?{}:{subject:(subject as string).trim().replace(/\s+/g,' ')}),
  ...(questionsTotal===undefined?{}:{
   questionsTotal:questionsTotal as number,questionsCorrect:questionsCorrect as number}),
  ...(projectId===undefined?{}:{projectId:projectId as string})};
}
type Tx={get:<V>(key:string)=>Promise<V|undefined>;put:(key:string,value:unknown)=>Promise<unknown>};
type Storage={transaction:<T>(fn:(tx:Tx)=>Promise<T>)=>Promise<T>};
export class LabWorkspaceStore{
 constructor(private state:{storage:Storage}){}
 async fetch(request:Request):Promise<Response>{
  const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const {pathname}=new URL(request.url);
  if(!/^\/entries(?:\/(?:briefing|cycle|cycle\/reset)|\/[0-9a-f-]{36}(?:\/complete)?)?$/.test(pathname)&&
   !/^\/projects(?:\/[0-9a-f-]{36})?$/.test(pathname))return json({error:'Rota inexistente.'},404);
  const id=pathname.startsWith('/entries/')?pathname.slice(9):null;
  try{
   if(pathname==='/projects'&&request.method==='GET'){
    const result=await this.state.storage.transaction(async tx=>{
     const projects=(await tx.get<Project[]>('projects'))||[];
     const entries=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     return {projects:projectOverview(projects,entries)};
    });
    return json(result);
   }
   if(pathname==='/projects'&&request.method==='POST'){
    const payload=projectCreatePayload(await request.json());
    const project=await this.state.storage.transaction(async tx=>{
     const projects=(await tx.get<Project[]>('projects'))||[];
     if(projects.length>=PROJECT_LIMIT)
      throw new HttpError(409,'Limite de 50 projetos atingido. Nenhum projeto foi apagado.');
     const at=new Date().toISOString();
     const row:Project={...payload,id:crypto.randomUUID(),status:'active',
      createdAt:at,updatedAt:at};
     await tx.put('projects',[...projects,row]);
     return row;
    });
    return json({project},201);
   }
   if(pathname.startsWith('/projects/')){
    const projectId=pathname.slice('/projects/'.length);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId))
     throw new HttpError(400,'Identificador de projeto inválido.');
    if(request.method==='GET'){
     const result=await this.state.storage.transaction(async tx=>{
      const projects=(await tx.get<Project[]>('projects'))||[];
      const entry=projects.find(p=>p.id===projectId);
      if(!entry)throw new HttpError(404,'Projeto não encontrado.');
      const records=(await tx.get<WorkspaceEntry[]>('entries'))||[];
      return {project:entry,entries:records.filter(x=>x.projectId===projectId)};
     });
     return json(result);
    }
    if(request.method==='PATCH'){
     const patch=projectPatchPayload(await request.json());
     const updated=await this.state.storage.transaction(async tx=>{
      const projects=(await tx.get<Project[]>('projects'))||[];
      if(!projects.some(p=>p.id===projectId))
       throw new HttpError(404,'Projeto não encontrado.');
      const next=projects.map(p=>p.id===projectId?
       {...p,...patch,updatedAt:new Date().toISOString()}:p);
      await tx.put('projects',next);
      return next.find(p=>p.id===projectId)!;
     });
     return json({project:updated});
    }
    throw new HttpError(405,'Projeto: somente consulta e alteração permitidas.');
   }
   if(pathname==='/projects')throw new HttpError(405,'Projetos: somente consulta e criação.');
   if(pathname==='/entries/cycle'&&request.method==='GET'){
    const response=await this.state.storage.transaction(async tx=>{
     const config=(await tx.get<StudyCycleConfig>('study-cycle'))||null;
     const entries=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     return {config,summary:summarizeStudyCycle(config,entries)};
    });
    return json(response);
   }
   if(pathname==='/entries/cycle'&&request.method==='PUT'){
    const payload=await request.json() as unknown;
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
      Object.keys(payload).some(x=>x!=='subjects'))
     throw new HttpError(400,'Configuração do ciclo inválida.');
    const subjects=parseCycleSubjects((payload as Record<string,unknown>).subjects);
    const config=await this.state.storage.transaction(async tx=>{
     const previous=await tx.get<StudyCycleConfig>('study-cycle');
     const now=new Date().toISOString();
     const next:StudyCycleConfig={subjects,startedAt:previous?.startedAt||now,updatedAt:now};
     await tx.put('study-cycle',next);
     return next;
    });
    return json({config,saved:true});
   }
   if(pathname==='/entries/cycle/reset'&&request.method==='POST'){
    const payload=await request.json() as unknown;
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
      Object.keys(payload).length!==1||(payload as Record<string,unknown>).confirm!==true)
     throw new HttpError(400,'Confirmação explícita necessária para reiniciar o ciclo.');
    const config=await this.state.storage.transaction(async tx=>{
     const current=await tx.get<StudyCycleConfig>('study-cycle');
     if(!current)throw new HttpError(404,'Configure o ciclo antes de reiniciar.');
     const now=new Date().toISOString();
     const next:StudyCycleConfig={...current,startedAt:now,updatedAt:now};
     await tx.put('study-cycle',next);
     return next;
    });
    return json({config,reset:true,historyPreserved:true});
   }
   if(pathname.startsWith('/entries/cycle'))throw new HttpError(405,'Método não permitido.');
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
     if(data.projectId){
      const projects=(await tx.get<Project[]>('projects'))||[];
      const project=projects.find(p=>p.id===data.projectId);
      if(!project||project.status==='archived')
       throw new HttpError(409,'Projeto inexistente ou arquivado. Selecione outro.');
     }
     const at=new Date().toISOString(),row={...data,id:crypto.randomUUID(),createdAt:at,updatedAt:at};
     await tx.put('entries',[...list,row]);return row;
    });
    return json({entry},201);
   }
   if(pathname==='/entries/briefing')throw new HttpError(405,'Método não permitido.');
   if(id&&!id.endsWith('/complete')&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new HttpError(400,'Identificador inválido.');
   if(id?.endsWith('/complete')){
    const taskId=id.slice(0,-'/complete'.length);
    if(request.method!=='PATCH')throw new HttpError(405,'Conclusão exige PATCH.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId))
     throw new HttpError(400,'Tarefa inválida.');
    const payload=await request.json() as unknown;
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
      Object.keys(payload).length!==1||
      typeof (payload as {expectedUpdatedAt?:unknown}).expectedUpdatedAt!=='string')
     throw new HttpError(400,'Revisão da tarefa obrigatória.');
    const expected=(payload as {expectedUpdatedAt:string}).expectedUpdatedAt;
    if(expected.length>40||Number.isNaN(Date.parse(expected)))
     throw new HttpError(400,'Revisão inválida.');
    const entry=await this.state.storage.transaction(async tx=>{
     const list=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     const current=list.find(x=>x.id===taskId);
     if(!current)throw new HttpError(404,'Tarefa não encontrada.');
     if(current.kind!=='task')throw new HttpError(409,'Registro não é uma tarefa.');
     if(current.done)throw new HttpError(409,'Tarefa já concluída. Nada foi alterado.');
     if(current.updatedAt!==expected)
      throw new HttpError(409,'Tarefa foi modificada. Atualize a lista antes de confirmar.');
     const updated={...current,done:true,updatedAt:new Date().toISOString()};
     await tx.put('entries',list.map(x=>x.id===taskId?updated:x));
     return updated;
    });
    return json({entry,completed:true});
   }
   if(id&&request.method==='PATCH'){
    const data=entryPayload(await request.json());
    const entry=await this.state.storage.transaction(async tx=>{
     const list=(await tx.get<WorkspaceEntry[]>('entries'))||[];
     const original=list.find(x=>x.id===id);
     if(!original)throw new HttpError(404,'Registro não encontrado.');
     if(data.projectId&&data.projectId!==original.projectId){
      const projects=(await tx.get<Project[]>('projects'))||[];
      const project=projects.find(p=>p.id===data.projectId);
      if(!project||project.status==='archived')
       throw new HttpError(409,'Projeto de destino inexistente ou arquivado.');
     }
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
