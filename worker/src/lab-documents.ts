/** Owner-isolated Durable Object holding metadata snapshots, never source file contents. */
import {HttpError} from './validation';
import {
 MAX_DOCUMENTS_PER_SOURCE,mergeCompleteSnapshot,publicDocumentSearch,
 type DocSource,type IndexedDocument,type RemoteDocument,type DocumentDelta
} from './core/sigma-document-index';
export type DocumentScan={
 id:string;source:DocSource;startedAt:string;page:number;
 cursor:string|null;staged:RemoteDocument[];
};
export type DocumentSummary={source:DocSource;count:number;missing:number;lastSyncedAt:string|null;lastDelta:DocumentDelta|null;scan:{id:string;page:number;scanned:number;startedAt:string}|null};
export type DocumentState={items:IndexedDocument[];lastSyncedAt:string|null;lastDelta:DocumentDelta|null};
type Tx={get:<T>(key:string)=>Promise<T|undefined>;put:(key:string,value:unknown)=>Promise<unknown>;delete?:(key:string)=>Promise<unknown>};
type Storage={transaction:<T>(fn:(tx:Tx)=>Promise<T>)=>Promise<T>};
const sources:DocSource[]=['drive','notion'];
const emptyState=():DocumentState=>({items:[],lastSyncedAt:null,lastDelta:null});
const validSource=(v:unknown):DocSource=>{
 if(v!=='drive'&&v!=='notion')throw new HttpError(400,'Fonte documental inválida.');
 return v;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stale=(run:DocumentScan)=>Date.now()-Date.parse(run.startedAt)>20*60*1000;
function normalizeRun(body:unknown):Record<string,unknown>{
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Solicitação inválida.');
 return body as Record<string,unknown>;
}
function safeCursor(v:unknown):string|null{
 if(v===null)return null;
 if(typeof v!=='string'||!v||v.length>2048||/[\x00-\x1f]/.test(v))
  throw new HttpError(400,'Cursor inválido.');
 return v;
}
function publicScan(scan:DocumentScan|null){
 return scan?{id:scan.id,page:scan.page,scanned:scan.staged.length,startedAt:scan.startedAt}:null;
}
function validateRemoteRows(source:DocSource,input:unknown):RemoteDocument[]{
 if(!Array.isArray(input)||input.length>100)throw new HttpError(400,'Lote documental inválido.');
 const ids=new Set<string>();
 for(const row of input){
  if(!row||typeof row!=='object'||Array.isArray(row))throw new HttpError(400,'Item inválido.');
  const o=row as Record<string,unknown>;
  if(Object.keys(o).some(k=>!['source','externalId','title','mimeType','modifiedAt','url'].includes(k)))
   throw new HttpError(400,'Campos externos inesperados.');
  if(o.source!==source||typeof o.externalId!=='string'||!o.externalId||
   o.externalId.length>200||typeof o.title!=='string'||o.title.length>180||
   typeof o.mimeType!=='string'||o.mimeType.length>100||
   typeof o.modifiedAt!=='string'||o.modifiedAt.length>45||
   o.url!==undefined&&(typeof o.url!=='string'||o.url.length>500))
   throw new HttpError(400,'Metadados inválidos.');
  if(ids.has(o.externalId))throw new HttpError(400,'Duplicata no lote.');
  ids.add(o.externalId);
 }
 return input as RemoteDocument[];
}
export class LabDocumentIndex{
 constructor(private state:{storage:Storage}){}
 async fetch(request:Request):Promise<Response>{
  const response=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{
   'Content-Type':'application/json','Cache-Control':'no-store'
  }});
  const url=new URL(request.url),route=url.pathname;
  try{
   if(route==='/status'&&request.method==='GET'){
    const list=await this.state.storage.transaction(async tx=>{
     const result:DocumentSummary[]=[];
     for(const source of sources){
      const state=(await tx.get<DocumentState>('docs:'+source))||emptyState();
      const raw=(await tx.get<DocumentScan>('scan:'+source))||null;
      const scan=raw&&!stale(raw)?raw:null;
      result.push({source,count:state.items.filter(x=>x.state==='available').length,
       missing:state.items.filter(x=>x.state==='missing').length,
       lastSyncedAt:state.lastSyncedAt,lastDelta:state.lastDelta,scan:publicScan(scan)});
     }
     return result;
    });
    return response({sources:list});
   }
   if(route==='/list'&&request.method==='GET'){
    const source=validSource(url.searchParams.get('source'));
    const query=url.searchParams.get('q')||'';
    if(query.length>100)throw new HttpError(400,'Pesquisa longa demais.');
    const withMissing=url.searchParams.get('missing')==='true';
    const data=await this.state.storage.transaction(async tx=>
     (await tx.get<DocumentState>('docs:'+source))||emptyState());
    return response({source,items:publicDocumentSearch(data.items,query,withMissing),
     total:data.items.filter(x=>x.state==='available').length,lastSyncedAt:data.lastSyncedAt});
   }
   if(!['/scan/start','/scan/peek','/scan/page','/scan/cancel'].includes(route))
    return response({error:'Rota inexistente.'},404);
   if(route==='/scan/peek'&&request.method==='GET'){
    const source=validSource(url.searchParams.get('source'));
    const scan=await this.state.storage.transaction(async tx=>
     (await tx.get<DocumentScan>('scan:'+source))||null);
    if(!scan||stale(scan))throw new HttpError(404,'Não há sincronização em andamento.');
    return response({scan});
   }
   if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
   const body=normalizeRun(await request.json().catch(()=>null));
   const source=validSource(body.source);
   if(route==='/scan/start'){
    if(Object.keys(body).some(k=>k!=='source'))throw new HttpError(400,'Campos inesperados.');
    const scan=await this.state.storage.transaction(async tx=>{
     const old=(await tx.get<DocumentScan>('scan:'+source))||null;
     if(old&&!stale(old))throw new HttpError(409,'Já existe sincronização em andamento.');
     const fresh:DocumentScan={id:crypto.randomUUID(),source,startedAt:new Date().toISOString(),
      page:0,cursor:null,staged:[]};
     await tx.put('scan:'+source,fresh);return fresh;
    });
    return response({scan:publicScan(scan)},201);
   }
   if(typeof body.scanId!=='string'||!uuid.test(body.scanId))
    throw new HttpError(400,'Identificador de sincronização inválido.');
   if(route==='/scan/cancel'){
    if(Object.keys(body).some(k=>!['source','scanId'].includes(k)))
     throw new HttpError(400,'Campos inesperados.');
    await this.state.storage.transaction(async tx=>{
     const current=await tx.get<DocumentScan>('scan:'+source);
     if(!current||current.id!==body.scanId)throw new HttpError(409,'Sincronização não encontrada.');
     await tx.put('scan:'+source,null);
    });
    return response({cancelled:true});
   }
   if(route==='/scan/page'){
    if(Object.keys(body).some(k=>!['source','scanId','page','cursor','nextCursor','items'].includes(k)))
     throw new HttpError(400,'Campos inesperados.');
    if(!Number.isSafeInteger(body.page)||Number(body.page)<0||Number(body.page)>=10)
     throw new HttpError(413,'Sincronização excedeu o limite de páginas.');
    const cursor=safeCursor(body.cursor),nextCursor=safeCursor(body.nextCursor);
    const incoming=validateRemoteRows(source,body.items);
    const result=await this.state.storage.transaction(async tx=>{
     const scan=await tx.get<DocumentScan>('scan:'+source);
     if(!scan||scan.id!==body.scanId||stale(scan)||scan.page!==body.page||scan.cursor!==cursor)
      throw new HttpError(409,'Página desatualizada, duplicada ou sessão expirada.');
     const staged=[...scan.staged,...incoming];
     if(staged.length>MAX_DOCUMENTS_PER_SOURCE)
      throw new HttpError(413,'Limite de mil documentos por fonte no laboratório.');
     const unique=new Set(staged.map(x=>x.externalId));
     if(unique.size!==staged.length)throw new HttpError(409,'Documento repetido entre páginas.');
     if(nextCursor!==null){
      if(scan.page>=9)throw new HttpError(413,'Limite de dez páginas atingido; índice anterior preservado.');
      const next={...scan,page:scan.page+1,cursor:nextCursor,staged};
      await tx.put('scan:'+source,next);
      return {completed:false,scan:publicScan(next),delta:null};
     }
     const previous=(await tx.get<DocumentState>('docs:'+source))||emptyState();
     const at=new Date().toISOString();
     const merged=mergeCompleteSnapshot(source,previous.items,staged,at);
     await tx.put('docs:'+source,{items:merged.entries,lastSyncedAt:at,lastDelta:merged.delta});
     await tx.put('scan:'+source,null);
     return {completed:true,scan:null,delta:merged.delta,total:staged.length,lastSyncedAt:at};
    });
    return response(result);
   }
   return response({error:'Método não permitido.'},405);
  }catch(e){
   return response({error:e instanceof HttpError?e.message:'Falha no índice de documentos.'},
    e instanceof HttpError?e.status:503);
  }
 }
}
