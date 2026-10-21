import type {ApprovalItem,ApprovalState,ApprovalStore} from './approval-ledger';

/**
 * Transactional approval + minimal audit, using a dedicated keyspace in the
 * existing Cloudflare Durable Object. DISCONNECTED from HTTP routes and UI.
 *
 * Does not log natural-language requests, document names, OAuth credentials,
 * personal memory, or action parameters. Every event has executed:false.
 * "consumed" is only a TEST SIMULATION, not a provider operation.
 */
export type AuditEventName='proposed'|'approved'|'cancelled'|'simulation-consumed';
export type AuditEvent={
 sequence:number;kind:AuditEventName;at:number;digest:string;executed:false
};
export type ActionAuditSnapshot={
 actionId:string;capabilityId:string;state:ApprovalState;
 events:AuditEvent[];executed:false
};
type Stored={item:ApprovalItem;events:AuditEvent[]};

const opaqueId=/^[A-Za-z0-9_-]{4,100}$/;
function id(value:string):void{
 if(typeof value!=='string'||!opaqueId.test(value))throw Error('Identificador inválido.');
}
function validTime(value:number):void{
 if(!Number.isSafeInteger(value)||value<0)throw Error('Horário inválido.');
}
function copy<T>(value:T):T{return structuredClone(value);}
function event(kind:AuditEventName,at:number,digest:string,sequence:number):AuditEvent{
 return {sequence,kind,at,digest,executed:false};
}
export class AuditedDurableApprovalStore implements ApprovalStore{
 private readonly prefix:string;
 constructor(private readonly storage:DurableObjectStorage,private readonly ownerUid:string){
  id(ownerUid);
  this.prefix='sigma:audited-approvals:v1:'+ownerUid+':';
 }
 private key(uid:string,actionId:string):string{
  id(uid);id(actionId);
  if(uid!==this.ownerUid)throw Error('Autorização pertence a outra conta.');
  return this.prefix+actionId;
 }
 async createOnce(item:ApprovalItem):Promise<boolean>{
  const key=this.key(item.actorUid,item.id);
  validTime(item.issuedAt);validTime(item.expiresAt);
  if(item.state!=='pending'||item.expiresAt<=item.issuedAt||
   item.expiresAt-item.issuedAt>600000||
   !/^[0-9a-f]{64}$/.test(item.digest)||
   !item.capabilityId||!item.target||!item.change)
   throw Error('Proposta inválida.');
  return this.storage.transaction(async tx=>{
   if(await tx.get<Stored>(key))return false;
   await tx.put(key,{item:copy(item),events:[event('proposed',item.issuedAt,item.digest,1)]} satisfies Stored);
   return true;
  });
 }
 async read(uid:string,actionId:string):Promise<ApprovalItem|null>{
  const stored=await this.storage.get<Stored>(this.key(uid,actionId));
  return stored?copy(stored.item):null;
 }
 async transition(
  uid:string,actionId:string,from:ApprovalState,to:ApprovalState,now:number
 ):Promise<ApprovalItem|null>{
  const key=this.key(uid,actionId);validTime(now);
  const kind:AuditEventName=
   from==='pending'&&to==='approved'?'approved':
   from==='pending'&&to==='cancelled'?'cancelled':
   from==='approved'&&to==='consumed'?'simulation-consumed':
   (()=>{throw Error('Transição de autorização proibida.');})();
  return this.storage.transaction(async tx=>{
   const old=await tx.get<Stored>(key);
   if(!old||old.item.actorUid!==uid||old.item.state!==from||
    now<old.item.issuedAt||now>=old.item.expiresAt||
    now<old.events[old.events.length-1].at)return null;
   const updated:ApprovalItem={...old.item,state:to};
   const events=[...old.events,event(kind,now,old.item.digest,old.events.length+1)];
   await tx.put(key,{item:updated,events} satisfies Stored);
   return copy(updated);
  });
 }
 async audit(uid:string,actionId:string):Promise<ActionAuditSnapshot|null>{
  const stored=await this.storage.get<Stored>(this.key(uid,actionId));
  if(!stored)return null;
  return {actionId:stored.item.id,capabilityId:stored.item.capabilityId,
   state:stored.item.state,events:copy(stored.events),executed:false};
 }
}
