import type {ApprovalItem,ApprovalState,ApprovalStore} from './approval-ledger';

/**
 * Storage adapter for the EXISTING Cloudflare QUOTA Durable Object.
 *
 * Dormant by design: this class is not connected to any public Worker route,
 * action executor, memory endpoint or scheduled event.
 *
 * All operations run inside Durable Object storage transactions. An approval
 * cannot be approved/consumed twice, even across object restarts.
 */
export class DurableApprovalStore implements ApprovalStore {
 private readonly prefix:string;
 constructor(private readonly storage:DurableObjectStorage,ownerUid:string){
  if(!/^[A-Za-z0-9_-]{4,100}$/.test(ownerUid))throw new Error('Proprietário inválido.');
  this.prefix='sigma:approvals:v1:'+ownerUid+':';
 }
 private key(uid:string,id:string):string{
  if(!/^[A-Za-z0-9_-]{4,100}$/.test(uid)||!/^[A-Za-z0-9_-]{4,100}$/.test(id))throw new Error('Identificador inválido.');
  const owner=this.prefix.slice('sigma:approvals:v1:'.length,-1);
  if(uid!==owner)throw new Error('Acesso a autorização de outra conta negado.');
  return this.prefix+id;
 }
 async createOnce(item:ApprovalItem):Promise<boolean>{
  const key=this.key(item.actorUid,item.id);
  if(item.state!=='pending'||!Number.isSafeInteger(item.issuedAt)||
     !Number.isSafeInteger(item.expiresAt)||item.issuedAt>=item.expiresAt ||
     !/^[a-f0-9]{64}$/.test(item.digest))throw new Error('Proposta inválida.');
  return this.storage.transaction(async tx=>{
   if(await tx.get<ApprovalItem>(key))return false;
   await tx.put(key,structuredClone(item));
   return true;
  });
 }
 async read(actorUid:string,id:string):Promise<ApprovalItem|null>{
  const value=await this.storage.get<ApprovalItem>(this.key(actorUid,id));
  return value?structuredClone(value):null;
 }
 async transition(
  actorUid:string,id:string,from:ApprovalState,to:ApprovalState,now:number
 ):Promise<ApprovalItem|null>{
  const key=this.key(actorUid,id);
  if(!Number.isSafeInteger(now))throw new Error('Horário inválido.');
  // Explicit state machine: a consumed or cancelled approval never reopens.
  if(!(
   (from==='pending'&&(to==='approved'||to==='cancelled'))||
   (from==='approved'&&to==='consumed')
  ))throw new Error('Transição de autorização proibida.');
  return this.storage.transaction(async tx=>{
   const old=await tx.get<ApprovalItem>(key);
   if(!old||old.actorUid!==actorUid||old.state!==from||old.expiresAt<=now||now<old.issuedAt)return null;
   const updated:ApprovalItem={...old,state:to};
   await tx.put(key,updated);
   return structuredClone(updated);
  });
 }
}
