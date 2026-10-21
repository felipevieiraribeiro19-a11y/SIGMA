import type {MemoryKind,MemoryProvenance,MemoryRecord} from './memory-contracts';

/**
 * Memory is not conversation history. The model can propose, but ONLY a trusted
 * user-initiated confirmation may persist, edit or delete data.
 * Nothing in this module is connected to production endpoints yet.
 */
export type PersonalMemoryKind=Extract<MemoryKind,'fact'|'preference'>;
export type MemoryDraft={
 proposalId:string;ownerUid:string;kind:PersonalMemoryKind;
 content:string;source:MemoryProvenance;createdAt:string;status:'pending-review';
};
export type ApprovedMemory=MemoryRecord&{
 kind:PersonalMemoryKind;content:string;revision:number;verification:'confirmed';
 retention:'until-deleted';provenance:[MemoryProvenance];
};
export type MemoryApproval={
 proposalId:string;actorUid:string;approvedContent:string;
 decision:'approve'|'reject';confirmedAt:string;
};
export type MemoryChangeConfirmation={
 actorUid:string;id:string;expectedRevision:number;
 approvedContent:string;confirmedAt:string;
};
export type MemoryRemovalConfirmation={
 actorUid:string;id:string;expectedRevision:number;
 decision:'delete';confirmedAt:string;
};
export type MemorySearchHit={
 id:string;kind:PersonalMemoryKind;content:string;
 source:MemoryProvenance;updatedAt:string;revision:number;matchScore:number;
};

function checkText(value:string):string{
 if(typeof value!=='string')throw new Error('O conteúdo da memória deve ser texto.');
 const text=value.trim().replace(/\s+/g,' ');
 if(!text||text.length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
  throw new Error('Memória vazia, excessivamente longa ou inválida.');
 return text;
}
function checkId(value:string):void{
 if(typeof value!=='string'||!(/^[a-zA-Z0-9_-]{4,100}$/).test(value))
  throw new Error('Identificador de memória inválido.');
}
function checkTimestamp(value:string):void{
 if(typeof value!=='string'||!(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/).test(value)||!Number.isFinite(Date.parse(value)))
  throw new Error('Data da memória inválida.');
}
function checkEvidence(source:MemoryProvenance):void{
 if(!source||!['conversation','user-confirmation','connector','system-action'].includes(source.sourceKind))throw new Error('Origem inválida.');
 checkId(source.sourceId);checkTimestamp(source.observedAt);
}
function checkOwner(uid:string):void{checkId(uid);}
function checkRevision(revision:number):void{
 if(!Number.isSafeInteger(revision)||revision<1)throw new Error('Revisão inválida.');
}
function assertActor(ownerUid:string,actorUid:string):void{
 checkOwner(actorUid);
 if(ownerUid!==actorUid)throw new Error('A memória pertence a outra conta.');
}
export function draftMemory(input:Omit<MemoryDraft,'content'|'status'> &{content:string}):MemoryDraft{
 checkOwner(input.ownerUid);checkId(input.proposalId);checkTimestamp(input.createdAt);checkEvidence(input.source);
 if(input.kind!=='fact'&&input.kind!=='preference')throw new Error('Tipo de memória não autorizado.');
 return {...input,content:checkText(input.content),status:'pending-review'};
}

/** Strong "remember" command is an optional proposal trigger, not permission to save. */
export function suggestExplicitMemory(message:string,input:{
 ownerUid:string;proposalId:string;source:MemoryProvenance;createdAt:string
}):MemoryDraft|null{
 if(typeof message!=='string')return null;
 const match=/^\s*(?:lembre(?:-se)? (?:de )?que|guarde que|quero que voc[eê] se lembre (?:de )?que)\s*[:,-]?\s*(.+)$/is.exec(message);
 if(!match)return null;
 return draftMemory({...input,kind:'fact',content:match[1]});
}

/** Storage contract for future Firestore adapter. All functions MUST scope by owner. */
export interface ControlledMemoryRepository{
 insertIfAbsent(item:ApprovedMemory):Promise<boolean>;
 get(ownerUid:string,id:string):Promise<ApprovedMemory|null>;
 list(ownerUid:string,limit:number):Promise<ApprovedMemory[]>;
 replaceIfRevision(item:ApprovedMemory,expectedRevision:number):Promise<boolean>;
 deleteIfRevision(ownerUid:string,id:string,expectedRevision:number):Promise<boolean>;
}

export async function approveMemory(
 draft:MemoryDraft,review:MemoryApproval,repository:ControlledMemoryRepository
):Promise<{status:'saved'|'already-saved'|'rejected';item?:ApprovedMemory}>{
 assertActor(draft.ownerUid,review.actorUid);
 checkId(review.proposalId);checkTimestamp(review.confirmedAt);
 if(draft.proposalId!==review.proposalId)throw new Error('A confirmação não corresponde à proposta.');
 if(review.decision==='reject')return {status:'rejected'};
 if(review.decision!=='approve'||checkText(review.approvedContent)!==draft.content)
  throw new Error('A confirmação não corresponde ao conteúdo apresentado.');
 const item:ApprovedMemory={
  id:draft.proposalId,ownerUid:draft.ownerUid,kind:draft.kind,content:draft.content,
  schemaVersion:1,revision:1,verification:'confirmed',retention:'until-deleted',
  createdAt:review.confirmedAt,updatedAt:review.confirmedAt,provenance:[draft.source]
 };
 if(await repository.insertIfAbsent(item))return {status:'saved',item};
 const old=await repository.get(draft.ownerUid,item.id);
 if(old&&old.content===item.content&&old.kind===item.kind&&old.provenance[0]?.sourceId===item.provenance[0].sourceId)
  return {status:'already-saved',item:old};
 throw new Error('Identificador já utilizado com conteúdo diferente.');
}

export async function editMemory(
 repository:ControlledMemoryRepository,confirmation:MemoryChangeConfirmation
):Promise<ApprovedMemory>{
 checkOwner(confirmation.actorUid);checkId(confirmation.id);checkRevision(confirmation.expectedRevision);checkTimestamp(confirmation.confirmedAt);
 const text=checkText(confirmation.approvedContent);
 const previous=await repository.get(confirmation.actorUid,confirmation.id);
 if(!previous)throw new Error('Memória não encontrada.');
 assertActor(previous.ownerUid,confirmation.actorUid);
 if(previous.revision!==confirmation.expectedRevision)throw new Error('A memória mudou: atualize antes de editar.');
 const next:ApprovedMemory={
  ...previous,content:text,revision:previous.revision+1,updatedAt:confirmation.confirmedAt,
  provenance:[...previous.provenance,{sourceId:confirmation.id,sourceKind:'user-confirmation',observedAt:confirmation.confirmedAt}]
 };
 if(!await repository.replaceIfRevision(next,confirmation.expectedRevision))throw new Error('A memória mudou: tente novamente.');
 return next;
}
export async function deleteMemory(repository:ControlledMemoryRepository,confirmation:MemoryRemovalConfirmation):Promise<void>{
 checkOwner(confirmation.actorUid);checkId(confirmation.id);checkRevision(confirmation.expectedRevision);checkTimestamp(confirmation.confirmedAt);
 if(confirmation.decision!=='delete')throw new Error('Exclusão não confirmada.');
 const previous=await repository.get(confirmation.actorUid,confirmation.id);
 if(!previous)throw new Error('Memória não encontrada.');
 assertActor(previous.ownerUid,confirmation.actorUid);
 if(previous.revision!==confirmation.expectedRevision||!await repository.deleteIfRevision(confirmation.actorUid,confirmation.id,confirmation.expectedRevision))
  throw new Error('A memória mudou: atualize antes de excluir.');
}

function tokens(text:string):string[]{
 return [...new Set(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]{3,}/gu)||[])].slice(0,32);
}
/**
 * Local lexical search: no vector embedding, API request or global search.
 * Scoped by user in the repository. Never return a record without evidence.
 */
export async function searchMemory(
 repository:ControlledMemoryRepository,ownerUid:string,query:string,limit=5
):Promise<MemorySearchHit[]>{
 checkOwner(ownerUid);
 if(typeof query!=='string'||query.length>300)throw new Error('Consulta inválida.');
 const terms=tokens(query);
 if(!terms.length)return [];
 const rows=await repository.list(ownerUid,200);
 return rows.filter(row=>row.ownerUid===ownerUid&&row.verification==='confirmed')
  .map(row=>{
   const wordset=new Set(tokens(row.content));
   const matchScore=terms.reduce((score,term)=>score+(wordset.has(term)?1:0),0);
   return {id:row.id,kind:row.kind,content:row.content,
    source:row.provenance[0],updatedAt:row.updatedAt,revision:row.revision,matchScore};
  })
  .filter(hit=>hit.matchScore>0&&!!hit.source)
  .sort((a,b)=>b.matchScore-a.matchScore||b.updatedAt.localeCompare(a.updatedAt))
  .slice(0,Math.max(1,Math.min(10,Math.floor(limit))));
}

/** For isolated automated tests only; never use as a production memory database. */
export class InMemoryControlledMemoryRepository implements ControlledMemoryRepository{
 private entries=new Map<string,ApprovedMemory>();
 private key(uid:string,id:string){return uid+':'+id;}
 async insertIfAbsent(item:ApprovedMemory){
  const key=this.key(item.ownerUid,item.id);
  if(this.entries.has(key))return false;
  this.entries.set(key,structuredClone(item));return true;
 }
 async get(ownerUid:string,id:string){return structuredClone(this.entries.get(this.key(ownerUid,id))||null);}
 async list(ownerUid:string,limit:number){
  return [...this.entries.values()].filter(e=>e.ownerUid===ownerUid).slice(0,limit).map(e=>structuredClone(e));
 }
 async replaceIfRevision(item:ApprovedMemory,expectedRevision:number){
  const key=this.key(item.ownerUid,item.id),old=this.entries.get(key);
  if(!old||old.revision!==expectedRevision)return false;
  this.entries.set(key,structuredClone(item));return true;
 }
 async deleteIfRevision(ownerUid:string,id:string,expectedRevision:number){
  const key=this.key(ownerUid,id),old=this.entries.get(key);
  if(!old||old.revision!==expectedRevision)return false;
  return this.entries.delete(key);
 }
}
