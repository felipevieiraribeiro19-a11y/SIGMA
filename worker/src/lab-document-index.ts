/** Per-Firebase-UID isolated Durable Object document catalog. A sync never modifies provider files. */
import {HttpError} from './validation';
import {DOCUMENT_LIMIT,MAX_DOCUMENTS_PER_SOURCE,reconcileDocuments,searchDocuments,validateSnapshot,type IndexedDocument,type DocumentSource,type SourceDocument} from './core/document-index';
type Storage={transaction:<T>(fn:(tx:{
 get:<V>(key:string)=>Promise<V|undefined>;
 put:(key:string,value:unknown)=>Promise<unknown>;
})=>Promise<T>)=>Promise<T>};

type Scan={
 id:string;source:DocumentSource;startedAt:string;updatedAt:string;page:number;
 cursor:string|null;seenCursors:string[];documents:SourceDocument[];
 includeContent:boolean;textReads:number;
};
const SCAN_TTL_MS=20*60*1000;
const MAX_SCAN_PAGES=20;
const scanExpired=(scan:Scan)=>Date.now()-Date.parse(scan.updatedAt)>SCAN_TTL_MS;
const scanPublic=(scan:Scan)=>({
 id:scan.id,source:scan.source,page:scan.page,scanned:scan.documents.length,
 startedAt:scan.startedAt,includeContent:scan.includeContent,textReads:scan.textReads
});
const sourceParam=(source:unknown):DocumentSource=>{
 if(source!=='drive'&&source!=='notion')throw new HttpError(400,'Fonte de documentos inválida.');
 return source;
};
const parseJson=async(request:Request):Promise<Record<string,unknown>>=>{
 const raw=await request.text();
 if(raw.length>250000)throw new HttpError(413,'Página de sincronização muito grande.');
 let value:unknown;
 try{value=JSON.parse(raw);}catch{throw new HttpError(400,'JSON inválido.');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Pedido inválido.');
 return value as Record<string,unknown>;
};
const validCursor=(value:unknown):string|null=>{
 if(value===null)return null;
 if(typeof value!=='string'||!value||value.length>2048||/[\x00-\x1f]/.test(value))
  throw new HttpError(400,'Cursor inválido.');
 return value;
};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export class LabDocumentIndex{
 constructor(private readonly state:{storage:Storage}){}
 async fetch(request:Request):Promise<Response>{
  const {pathname,searchParams}=new URL(request.url);
  try{
   if(pathname==='/documents'&&request.method==='GET'){
    const docs=await this.state.storage.transaction(async tx=>(await tx.get<IndexedDocument[]>('catalog'))||[]);
    return json({documents:docs.map(({text,...metadata})=>({...metadata,textLength:text.length})),count:docs.length,limit:DOCUMENT_LIMIT});
   }
   if(pathname==='/search'&&request.method==='GET'){
    const docs=await this.state.storage.transaction(async tx=>(await tx.get<IndexedDocument[]>('catalog'))||[]);
    return json({results:searchDocuments(docs,searchParams.get('q')||'')});
   }

   if(pathname==='/scan/status'&&request.method==='GET'){
    const source=sourceParam(searchParams.get('source'));
    const scan=await this.state.storage.transaction(async tx=>
     (await tx.get<Scan>('scan:'+source))||null);
    return json({source,scan:scan&&!scanExpired(scan)?scanPublic(scan):null});
   }
   if(pathname==='/scan/peek'&&request.method==='GET'){
    // Internal-only endpoint: caller is an authenticated Worker with the per-UID stub.
    const source=sourceParam(searchParams.get('source'));
    const scan=await this.state.storage.transaction(async tx=>
     (await tx.get<Scan>('scan:'+source))||null);
    if(!scan||scanExpired(scan))throw new HttpError(404,'Sincronização inexistente ou expirada.');
    return json({scan:{...scanPublic(scan),cursor:scan.cursor}});
   }
   if(pathname==='/scan/start'&&request.method==='POST'){
    const input=await parseJson(request);
    if(Object.keys(input).some(k=>!['source','includeContent'].includes(k))||
      (input.includeContent!==undefined&&typeof input.includeContent!=='boolean'))
     throw new HttpError(400,'Campos de sincronização inválidos.');
    const source=sourceParam(input.source),includeContent=input.includeContent===true;
    const scan=await this.state.storage.transaction(async tx=>{
     const old=await tx.get<Scan>('scan:'+source);
     if(old&&!scanExpired(old))throw new HttpError(409,'Já existe uma sincronização. Continue ou cancele.');
     const now=new Date().toISOString();
     const fresh:Scan={id:crypto.randomUUID(),source,startedAt:now,updatedAt:now,
      page:0,cursor:null,seenCursors:[],documents:[],includeContent,textReads:0};
     await tx.put('scan:'+source,fresh);
     return fresh;
    });
    return json({completed:false,scan:scanPublic(scan)},201);
   }
   if(pathname==='/scan/cancel'&&request.method==='POST'){
    const input=await parseJson(request);
    if(Object.keys(input).some(k=>!['source','scanId'].includes(k)))
     throw new HttpError(400,'Campos de cancelamento inválidos.');
    const source=sourceParam(input.source);
    await this.state.storage.transaction(async tx=>{
     const scan=await tx.get<Scan>('scan:'+source);
     if(!scan||scan.id!==input.scanId)throw new HttpError(409,'Sincronização inexistente.');
     await tx.put('scan:'+source,null);
    });
    return json({cancelled:true,documentsPreserved:true});
   }
   if(pathname==='/scan/page'&&request.method==='POST'){
    const input=await parseJson(request);
    if(Object.keys(input).some(k=>
       !['source','scanId','page','cursor','nextCursor','documents','textReads'].includes(k)))
     throw new HttpError(400,'Campos de página inválidos.');
    const source=sourceParam(input.source);
    if(typeof input.scanId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.scanId)||
       !Number.isSafeInteger(input.page)||Number(input.page)<0||
       !Number.isSafeInteger(input.textReads)||Number(input.textReads)<0||Number(input.textReads)>8||
       !Array.isArray(input.documents)||input.documents.length>100)
     throw new HttpError(400,'Lote de página inválido.');
    const cursor=validCursor(input.cursor),nextCursor=validCursor(input.nextCursor);
    const incoming=validateSnapshot({source,complete:true,documents:input.documents}).documents;
    const response=await this.state.storage.transaction(async tx=>{
     const scan=await tx.get<Scan>('scan:'+source);
     if(!scan||scanExpired(scan)||scan.id!==input.scanId||
       scan.page!==input.page||scan.cursor!==cursor)
      throw new HttpError(409,'Página duplicada, atrasada ou sessão expirada.');
     if(scan.textReads+Number(input.textReads)>(scan.includeContent?8:0))
      throw new HttpError(409,'Limite de leitura de conteúdo excedido.');
     const documents=[...scan.documents,...incoming];
     if(documents.length>MAX_DOCUMENTS_PER_SOURCE)
      throw new HttpError(413,'Máximo de mil documentos por origem. Índice anterior preservado.');
     if(new Set(documents.map(x=>x.sourceId)).size!==documents.length)
      throw new HttpError(409,'Documento duplicado entre páginas: índice anterior preservado.');
     if(nextCursor!==null){
      if(scan.page>=MAX_SCAN_PAGES-1||nextCursor===cursor||scan.seenCursors.includes(nextCursor))
       throw new HttpError(409,'Paginação cíclica ou longa demais: índice anterior preservado.');
      const updated:Scan={...scan,page:scan.page+1,cursor:nextCursor,
       seenCursors:[...scan.seenCursors,nextCursor],documents,
       textReads:scan.textReads+Number(input.textReads),updatedAt:new Date().toISOString()};
      await tx.put('scan:'+source,updated);
      return {completed:false,scan:scanPublic(updated),changes:null};
     }
     // Atomic publication: no prior catalog modifications until every remote page succeeds.
     const previous=(await tx.get<IndexedDocument[]>('catalog'))||[];
     const reconciled=reconcileDocuments(previous,{source,complete:true,documents});
     await tx.put('catalog',reconciled.documents);
     await tx.put('scan:'+source,null);
     return {completed:true,scan:null,changes:reconciled.changes,readonly:true};
    });
    return json(response);
   }

   if(pathname==='/sync'&&request.method==='POST'){
    const raw=await request.text();
    if(raw.length>250000)throw new HttpError(413,'Lote excessivamente grande.');
    let input:unknown;try{input=JSON.parse(raw);}catch{throw new HttpError(400,'Lote JSON inválido.');}
    const snapshot=validateSnapshot(input);
    const changes=await this.state.storage.transaction(async tx=>{
     const existing=(await tx.get<IndexedDocument[]>('catalog'))||[];
     const result=reconcileDocuments(existing,snapshot);
     await tx.put('catalog',result.documents);
     return result.changes;
    });
    return json({source:snapshot.source,changes,readonly:true});
   }
   if(pathname==='/clear'&&request.method==='DELETE'){
    const source=searchParams.get('source');
    if(source!=='drive'&&source!=='notion')throw new HttpError(400,'Informe a fonte a apagar do índice.');
    const result=await this.state.storage.transaction(async tx=>{
     const old=(await tx.get<IndexedDocument[]>('catalog'))||[];
     const remaining=old.filter(x=>x.source!==source);
     await tx.put('catalog',remaining);
     await tx.put('scan:'+source,null);
     return {removed:old.length-remaining.length,total:remaining.length};
    });
    return json({source,...result,deletedFromProvider:false});
   }
   return json({error:'Rota inexistente ou método inválido.'},404);
  }catch(error){
   const code=error instanceof HttpError?error.status:503;
   return json({error:error instanceof HttpError?error.message:'Índice temporariamente indisponível.'},code);
  }
 }
}
