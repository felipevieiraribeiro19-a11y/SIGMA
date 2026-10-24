/**
 * SIGMA Beta: deterministic, READ-ONLY inventory of the two existing stores.
 *
 * Main SIGMA: Firestore users/{uid}/turns.
 * LAB: per-UID Durable Objects (LAB_MEMORY and LAB_WORKSPACE).
 *
 * This module does not fetch, migrate, deduplicate by text, update or delete data.
 * A source-specific identity prevents accidental overwrites when IDs collide.
 * It is intentionally a first step toward a unified Beta, not a migration.
 */
export type BetaOrigin='main-firestore'|'lab-durable-object';
export type BetaKind='conversation'|'memory'|'project'|'study'|'daily'|'task'|'finance';
export type MainTurn={id:string;userText:string;assistantText:string;createdAt:string};
export type LabMemory={id:string;text:string;createdAt:string;updatedAt:string};
export type LabProject={id:string;title:string;status:string;createdAt:string;updatedAt:string};
export type LabEntry={id:string;kind:'study'|'daily'|'task'|'finance';title:string;createdAt:string;updatedAt:string;done:boolean};
export type MainBetaSnapshot={uid:string;turns:MainTurn[]};
export type LabBetaSnapshot={uid:string;memories:LabMemory[];projects:LabProject[];entries:LabEntry[]};
export type BetaInventoryRecord={
 key:string;origin:BetaOrigin;kind:BetaKind;sourceId:string;
 title:string;createdAt:string;updatedAt:string;status?:string
};
export type BetaInventory={
 ownerUid:string;readOnly:true;migrationPerformed:false;
 records:BetaInventoryRecord[];
 counts:{conversations:number;memories:number;projects:number;studies:number;daily:number;tasks:number;finances:number};
 sources:{main:'available';lab:'available'};
};

function validUid(uid:unknown):uid is string{
 return typeof uid==='string'&&uid.length>=4&&uid.length<=128&&/^[A-Za-z0-9_-]+$/.test(uid);
}
function validId(id:unknown):id is string{
 return typeof id==='string'&&id.length>=1&&id.length<=160&&/^[A-Za-z0-9_-]+$/.test(id);
}
function validDate(value:unknown):value is string{
 return typeof value==='string'&&value.length>=20&&value.length<=35&&
  !Number.isNaN(Date.parse(value))&&/^\d{4}-\d{2}-\d{2}T/.test(value);
}
function title(value:unknown):string{
 if(typeof value!=='string')throw Error('Registro com título inválido.');
 const cleaned=value.trim();
 if(!cleaned)throw Error('Registro sem título.');
 return cleaned.slice(0,120);
}
function checkedRows<T>(rows:unknown,label:string):T[]{
 if(!Array.isArray(rows)||rows.length>2000)throw Error('Fonte '+label+' incompleta ou inválida.');
 return rows as T[];
}
/**
 * Requires both snapshots: unavailable is not silently treated as empty.
 * The caller must authenticate each read for the same Firebase UID.
 */
export function buildBetaInventory(main:MainBetaSnapshot,lab:LabBetaSnapshot):BetaInventory{
 if(!main||!lab||!validUid(main.uid)||!validUid(lab.uid)||main.uid!==lab.uid)
  throw Error('As fontes não pertencem à mesma conta autenticada.');
 const records:BetaInventoryRecord[]=[];
 const seen=new Set<string>();
 const add=(origin:BetaOrigin,kind:BetaKind,id:unknown,label:unknown,createdAt:unknown,updatedAt:unknown,status?:string)=>{
  if(!validId(id)||!validDate(createdAt)||!validDate(updatedAt))
   throw Error('Registro de origem inválido; a consolidação foi interrompida.');
  const key=origin+':'+kind+':'+id;
  if(seen.has(key))throw Error('Identificador duplicado na mesma fonte: '+origin+'/'+kind);
  seen.add(key);
  records.push({key,origin,kind,sourceId:id,title:title(label),createdAt,updatedAt,...(status?{status}:{})});
 };
 for(const turn of checkedRows<MainTurn>(main.turns,'principal')){
  if(!turn||typeof turn.assistantText!=='string')throw Error('Conversa inválida.');
  add('main-firestore','conversation',turn.id,turn.userText,turn.createdAt,turn.createdAt);
 }
 for(const memory of checkedRows<LabMemory>(lab.memories,'memórias LAB')){
  if(!memory)throw Error('Memória inválida.');
  add('lab-durable-object','memory',memory.id,memory.text,memory.createdAt,memory.updatedAt);
 }
 for(const project of checkedRows<LabProject>(lab.projects,'projetos LAB')){
  if(!project||!['active','paused','archived'].includes(project.status))throw Error('Projeto inválido.');
  add('lab-durable-object','project',project.id,project.title,project.createdAt,project.updatedAt,project.status);
 }
 for(const entry of checkedRows<LabEntry>(lab.entries,'registros LAB')){
  if(!entry||!['study','daily','task','finance'].includes(entry.kind)||typeof entry.done!=='boolean')
   throw Error('Registro LAB inválido.');
  add('lab-durable-object',entry.kind,entry.id,entry.title,entry.createdAt,entry.updatedAt,
   entry.kind==='task'?(entry.done?'done':'pending'):undefined);
 }
 records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.key.localeCompare(b.key));
 const count=(kind:BetaKind)=>records.filter(x=>x.kind===kind).length;
 return {
  ownerUid:main.uid,readOnly:true,migrationPerformed:false,records,
  counts:{conversations:count('conversation'),memories:count('memory'),projects:count('project'),
   studies:count('study'),daily:count('daily'),tasks:count('task'),finances:count('finance')},
  sources:{main:'available',lab:'available'}
 };
}
