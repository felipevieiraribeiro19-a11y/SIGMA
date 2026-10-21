/**
 * Consent-gated action protocol. NOT CONNECTED TO WORKER ROUTES.
 *
 * Security boundary:
 * - actorUid MUST come from verified Firebase auth on the future server endpoint,
 *   never from a client-supplied field or a model output;
 * - proposal data originates from a trusted server, not directly from a model response;
 * - client confirms a SHA-256 fingerprint of the *exact* proposal shown to the user;
 * - store implementations MUST have atomic conditional transitions; no execution on
 *   this module. Provider adapters must refuse non-consumed authorization receipts.
 */
export type ApprovalState='pending'|'approved'|'consumed'|'cancelled';
export type ApprovalItem={
 id:string;actorUid:string;capabilityId:string;target:string;change:string;
 digest:string;issuedAt:number;expiresAt:number;state:ApprovalState;
};
export type ApprovalReceipt={
 id:string;actorUid:string;capabilityId:string;target:string;change:string;
 digest:string;consumedAt:number;
};
export interface ApprovalStore{
 createOnce(item:ApprovalItem):Promise<boolean>;
 read(actorUid:string,id:string):Promise<ApprovalItem|null>;
 transition(actorUid:string,id:string,from:ApprovalState,to:ApprovalState,now:number):Promise<ApprovalItem|null>;
}
const idPattern=/^[A-Za-z0-9_-]{4,100}$/;
function requireId(value:string){if(typeof value!=='string'||!idPattern.test(value))throw new Error('Identificador de autorização inválido.');}
function requireShortText(value:string,max:number){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))
  throw new Error('Detalhes da proposta inválidos.');
 return value.trim();
}
function requireTime(now:number){if(!Number.isSafeInteger(now)||now<0)throw new Error('Horário inválido.');}
function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}

/** Canonical, versioned fingerprint; digest never authorizes an action by itself. */
export async function fingerprint(input:{
 id:string;actorUid:string;capabilityId:string;target:string;change:string;issuedAt:number;expiresAt:number
}):Promise<string>{
 const fields=[1,input.id,input.actorUid,input.capabilityId,input.target,input.change,input.issuedAt,input.expiresAt];
 return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields))));
}
export async function issueApproval(store:ApprovalStore,input:{
 id:string;actorUid:string;capabilityId:string;target:string;change:string;now:number;ttlMs?:number
}):Promise<ApprovalItem>{
 requireId(input.id);requireId(input.actorUid);requireId(input.capabilityId);requireTime(input.now);
 const target=requireShortText(input.target,250),change=requireShortText(input.change,2000);
 const ttl=input.ttlMs??300000;
 if(!Number.isSafeInteger(ttl)||ttl<1000||ttl>600000)throw new Error('Validade da autorização inválida.');
 const issuedAt=input.now,expiresAt=input.now+ttl;
 const digest=await fingerprint({id:input.id,actorUid:input.actorUid,capabilityId:input.capabilityId,target,change,issuedAt,expiresAt});
 const item:ApprovalItem={id:input.id,actorUid:input.actorUid,capabilityId:input.capabilityId,target,change,issuedAt,expiresAt,digest,state:'pending'};
 if(!await store.createOnce(item))throw new Error('Identificador de aprovação já utilizado.');
 return item;
}
export async function confirmApproval(store:ApprovalStore,input:{
 id:string;authenticatedUid:string;displayedDigest:string;now:number
}):Promise<ApprovalItem>{
 requireId(input.id);requireId(input.authenticatedUid);requireTime(input.now);
 const stored=await store.read(input.authenticatedUid,input.id);
 if(!stored)throw new Error('Proposta não encontrada.');
 if(stored.actorUid!==input.authenticatedUid)throw new Error('Conta não autorizada.');
 if(stored.expiresAt<=input.now)throw new Error('Proposta expirada.');
 if(stored.digest!==input.displayedDigest)throw new Error('A proposta foi alterada: revise os detalhes.');
 if(stored.state!=='pending')throw new Error('Esta proposta já foi decidida.');
 const approved=await store.transition(input.authenticatedUid,input.id,'pending','approved',input.now);
 if(!approved)throw new Error('A proposta mudou enquanto era confirmada.');
 return approved;
}
export async function cancelApproval(store:ApprovalStore,input:{id:string;authenticatedUid:string;now:number}):Promise<boolean>{
 requireId(input.id);requireId(input.authenticatedUid);requireTime(input.now);
 const item=await store.read(input.authenticatedUid,input.id);
 if(!item||item.state!=='pending'||item.expiresAt<=input.now)return false;
 return Boolean(await store.transition(input.authenticatedUid,input.id,'pending','cancelled',input.now));
}
/**
 * Consent receipt is returned only once. Still does NOT perform any external
 * operation. Future executors must authorize capability and current scopes again.
 */
export async function consumeApproval(store:ApprovalStore,input:{
 id:string;authenticatedUid:string;capabilityId:string;now:number
}):Promise<ApprovalReceipt>{
 requireId(input.id);requireId(input.authenticatedUid);requireId(input.capabilityId);requireTime(input.now);
 const item=await store.read(input.authenticatedUid,input.id);
 if(!item||item.actorUid!==input.authenticatedUid)throw new Error('Autorização não encontrada.');
 if(item.capabilityId!==input.capabilityId)throw new Error('Ferramenta diferente da autorizada.');
 if(item.expiresAt<=input.now)throw new Error('Autorização expirada.');
 if(item.state!=='approved')throw new Error('Autorização não disponível.');
 const consumed=await store.transition(input.authenticatedUid,input.id,'approved','consumed',input.now);
 if(!consumed)throw new Error('A autorização já foi utilizada.');
 return {id:consumed.id,actorUid:consumed.actorUid,capabilityId:consumed.capabilityId,
  target:consumed.target,change:consumed.change,digest:consumed.digest,consumedAt:input.now};
}
/** For tests only. Production MUST use transactional durable storage. */
export class TestApprovalStore implements ApprovalStore{
 private entries=new Map<string,ApprovalItem>();
 private key(uid:string,id:string){return uid+'|'+id;}
 async createOnce(item:ApprovalItem){
  const key=this.key(item.actorUid,item.id);
  if(this.entries.has(key))return false;
  this.entries.set(key,structuredClone(item));return true;
 }
 async read(uid:string,id:string){return structuredClone(this.entries.get(this.key(uid,id))||null);}
 async transition(uid:string,id:string,from:ApprovalState,to:ApprovalState,_now:number){
  const key=this.key(uid,id),old=this.entries.get(key);
  if(!old||old.state!==from)return null;
  const updated={...old,state:to};this.entries.set(key,updated);
  return structuredClone(updated);
 }
}
