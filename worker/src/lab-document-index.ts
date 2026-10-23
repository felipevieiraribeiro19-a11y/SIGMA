/** Per-Firebase-UID isolated Durable Object document catalog. A sync never modifies provider files. */
import {HttpError} from './validation';
import {DOCUMENT_LIMIT,reconcileDocuments,searchDocuments,validateSnapshot,type IndexedDocument} from './core/document-index';
type Storage={transaction:<T>(fn:(tx:{
 get:<V>(key:string)=>Promise<V|undefined>;
 put:(key:string,value:unknown)=>Promise<unknown>;
})=>Promise<T>)=>Promise<T>};
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
