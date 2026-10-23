/** Per-Firebase-UID OAuth credential vault. Internal Durable Object only; AES-256-GCM at rest. */
import {HttpError} from './validation';
import {utf8,validPreset,type ScopePreset,noStore} from './core/google-oauth';
type Tx={get:<T>(k:string)=>Promise<T|undefined>;put:(k:string,v:unknown)=>Promise<unknown>};
type Store={transaction:<T>(f:(tx:Tx)=>Promise<T>)=>Promise<T>};
type Env={
 GOOGLE_OAUTH_CLIENT_ID?:string;GOOGLE_OAUTH_CLIENT_SECRET?:string;
 GOOGLE_OAUTH_ENCRYPTION_KEY?:string;
};
type Pending={uid:string;nonce:string;verifier:string;preset:ScopePreset;expiresAt:number};
type Cipher={iv:string;data:string};
type Linked={uid:string;preset:ScopePreset;cipher:Cipher;connectedAt:string;
 scopes:string;reauthorize:boolean};
const now=()=>Date.now();
const encoding=(s:string)=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
const base64=(v:Uint8Array)=>btoa(String.fromCharCode(...v));
export async function importVaultKey(secret:string):Promise<CryptoKey>{
 let bytes:Uint8Array;
 try{bytes=encoding(secret);}catch{throw new HttpError(503,'Chave de criptografia OAuth não configurada.');}
 if(bytes.length!==32)throw new HttpError(503,'Chave de criptografia OAuth inválida.');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptRefresh(token:string,key:CryptoKey,uid:string):Promise<Cipher>{
 if(typeof token!=='string'||token.length<10||token.length>8192)
  throw new HttpError(502,'Credencial OAuth recebida é inválida.');
 const iv=new Uint8Array(12);crypto.getRandomValues(iv);
 const bytes=new Uint8Array(await crypto.subtle.encrypt(
  {name:'AES-GCM',iv,additionalData:utf8('SIGMA-LAB-GOOGLE:'+uid)},key,utf8(token)));
 return {iv:base64(iv),data:base64(bytes)};
}
export async function decryptRefresh(cipher:Cipher,key:CryptoKey,uid:string):Promise<string>{
 try{
  const result=await crypto.subtle.decrypt({
   name:'AES-GCM',iv:encoding(cipher.iv),additionalData:utf8('SIGMA-LAB-GOOGLE:'+uid)},
   key,encoding(cipher.data));
  return new TextDecoder().decode(result);
 }catch{throw new HttpError(503,'Credencial Google indisponível. Reconecte a conta.');}
}
export class LabGoogleOAuthVault{
 private readonly storage:Store;
 private readonly env:Env;
 private refreshing=new Map<ScopePreset,Promise<{accessToken:string;expiresAt:number}>>();
 private cached=new Map<ScopePreset,{accessToken:string;expiresAt:number}>();
 constructor(state:{storage:Store},env:Env){this.storage=state.storage;this.env=env;}
 async fetch(request:Request):Promise<Response>{
  const path=new URL(request.url).pathname;
  try{
   if(path==='/status'&&request.method==='GET'){
    const connections=await this.storage.transaction(async tx=>{
     const all:Record<string,unknown>={};
     for(const preset of ['calendar','drive_metadata','drive_content'] as ScopePreset[]){
      const linked=await tx.get<Linked>('linked:'+preset);
      all[preset]=linked?{connected:!linked.reauthorize,needsReauthorization:linked.reauthorize,
       connectedAt:linked.connectedAt,scopes:linked.scopes}:{connected:false};
     }
     return all;
    });
    return noStore({connections});
   }
   if(path==='/start'&&request.method==='POST'){
    const input=await request.json() as Record<string,unknown>;
    if(!input||typeof input.uid!=='string'||!/^[-_A-Za-z0-9]{1,128}$/.test(input.uid)||
       typeof input.nonce!=='string'||!/^[a-zA-Z0-9_-]{40,60}$/.test(input.nonce)||
       typeof input.verifier!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(input.verifier))
     throw new HttpError(400,'Solicitação OAuth inválida.');
    const preset=validPreset(input.preset);
    const pending:Pending={uid:input.uid,nonce:input.nonce,verifier:input.verifier,
     preset,expiresAt:now()+10*60*1000};
    await this.storage.transaction(async tx=>{await tx.put('pending',pending);});
    return noStore({created:true});
   }
   if(path==='/consume'&&request.method==='POST'){
    const input=await request.json() as Record<string,unknown>;
    const result=await this.storage.transaction(async tx=>{
     const pending=await tx.get<Pending>('pending');
     // One-time use, including failures and expired states.
     await tx.put('pending',null);
     if(!pending||pending.uid!==input?.uid||pending.nonce!==input?.nonce||
        pending.expiresAt<now())throw new HttpError(400,'Autorização expirada ou já utilizada.');
     return {verifier:pending.verifier,preset:pending.preset};
    });
    return noStore(result);
   }
   if(path==='/save'&&request.method==='POST'){
    const input=await request.json() as Record<string,unknown>;
    if(!input||typeof input.uid!=='string'||!/^[-_A-Za-z0-9]{1,128}$/.test(input.uid))
     throw new HttpError(400,'Conta inválida.');
    const preset=validPreset(input.preset);
    const key=await importVaultKey(this.env.GOOGLE_OAUTH_ENCRYPTION_KEY||'');
    const cipher=await encryptRefresh(String(input.refreshToken||''),key,input.uid);
    const scopes=typeof input.scopes==='string'?input.scopes:'';
    const linked:Linked={uid:input.uid,preset,cipher,connectedAt:new Date().toISOString(),
     scopes,reauthorize:false};
    await this.storage.transaction(async tx=>{await tx.put('linked:'+preset,linked);});
    this.cached.delete(preset);
    return noStore({connected:true,preset});
   }
   if(path==='/disconnect'&&request.method==='POST'){
    const data=await request.json().catch(()=>null) as {preset?:unknown}|null;
    const preset=validPreset(data?.preset);
    await this.storage.transaction(async tx=>{
     await tx.put('pending',null);await tx.put('linked:'+preset,null);
    });
    this.cached.delete(preset);
    // Local only; OAuth grant can be revoked independently at Google Account settings.
    return noStore({disconnected:true,preset,remoteRevoked:false});
   }
   if(path==='/access'&&request.method==='POST'){
    const data=await request.json().catch(()=>null) as {preset?:unknown}|null;
    const preset=validPreset(data?.preset);
    const result=await this.accessToken(preset);
    // Only parent Worker via private DO binding sees accessToken. No browser route returns it.
    return noStore({accessToken:result.accessToken,expiresAt:result.expiresAt});
   }
   return noStore({error:'Rota OAuth inexistente.'},404);
  }catch(error){
   const code=error instanceof HttpError?error.status:503;
   return noStore({error:error instanceof HttpError?error.message:'Falha segura no cofre OAuth.'},code);
  }
 }
 private async accessToken(preset:ScopePreset):Promise<{accessToken:string;expiresAt:number}>{
  const cached=this.cached.get(preset);
  if(cached&&cached.expiresAt>now()+60_000)return cached;
  const active=this.refreshing.get(preset);
  if(active)return active;
  const promise=this.refreshGoogle(preset);
  this.refreshing.set(preset,promise);
  try{return await promise;}finally{this.refreshing.delete(preset);}
 }
 private async refreshGoogle(preset:ScopePreset):Promise<{accessToken:string;expiresAt:number}>{
  const linked=await this.storage.transaction(tx=>tx.get<Linked>('linked:'+preset));
  if(!linked||linked.reauthorize)throw new HttpError(401,'Conta Google precisa ser reconectada.');
  const key=await importVaultKey(this.env.GOOGLE_OAUTH_ENCRYPTION_KEY||'');
  const token=await decryptRefresh(linked.cipher,key,linked.uid);
  if(!this.env.GOOGLE_OAUTH_CLIENT_ID||!this.env.GOOGLE_OAUTH_CLIENT_SECRET)
   throw new HttpError(503,'Cliente OAuth não configurado.');
  let result:Response;
  try{result=await fetch('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:this.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret:this.env.GOOGLE_OAUTH_CLIENT_SECRET,refresh_token:token,
    grant_type:'refresh_token'}).toString(),
   signal:AbortSignal.timeout(10000)
  });}catch{throw new HttpError(502,'Google temporariamente indisponível.');}
  const payload=await result.json().catch(()=>null) as {
   access_token?:string;refresh_token?:string;expires_in?:number;error?:string
  }|null;
  if(!result.ok||!payload?.access_token){
   if(payload?.error==='invalid_grant'){
    await this.storage.transaction(async tx=>{
     const existing=await tx.get<Linked>('linked:'+preset);
     if(existing&&existing.connectedAt===linked.connectedAt)
      await tx.put('linked:'+preset,{...existing,reauthorize:true});
    });
    this.cached.delete(preset);
    throw new HttpError(401,'Autorização Google expirou ou foi revogada. Reconecte.');
   }
   throw new HttpError(502,'Google não renovou o acesso. Tente novamente.');
  }
  if(payload.refresh_token&&payload.refresh_token!==token){
   const rotated=await encryptRefresh(payload.refresh_token,key,linked.uid);
   await this.storage.transaction(async tx=>{
    const latest=await tx.get<Linked>('linked:'+preset);
    if(latest&&latest.connectedAt===linked.connectedAt)
     await tx.put('linked:'+preset,{...latest,cipher:rotated});
   });
  }
  const duration=Number.isFinite(payload.expires_in)?Math.min(3600,Math.max(60,payload.expires_in!)):3600;
  const value={accessToken:payload.access_token,expiresAt:now()+duration*1000};
  this.cached.set(preset,value);
  return value;
 }
}
