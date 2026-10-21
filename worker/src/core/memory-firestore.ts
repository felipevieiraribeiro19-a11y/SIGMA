import type {ApprovedMemory,ControlledMemoryRepository} from './memory-engine';
import type {MemoryProvenance} from './memory-contracts';

/**
 * NOT WIRED to the Worker: Firebase adapter for future opt-in personal memory.
 * Firestore Security Rules currently DENY /users/{uid}/personalMemories.
 * Do not enable until rules and user-facing review/erase UI have passed tests.
 */
type FValue={
 stringValue?:string;integerValue?:string;timestampValue?:string;booleanValue?:boolean;
 arrayValue?:{values?:FValue[]};mapValue?:{fields?:Record<string,FValue>};
};
type Document={name?:string;fields?:Record<string,FValue>;updateTime?:string};
const validId=/^[a-zA-Z0-9_-]{4,100}$/;
const validProject=/^[a-z][a-z0-9-]{4,40}$/;
const kinds=new Set(['fact','preference']);
const sourceKinds=new Set(['conversation','user-confirmation','connector','system-action']);
function fields(item:ApprovedMemory):Record<string,FValue>{
 return {
  ownerUid:{stringValue:item.ownerUid},
  kind:{stringValue:item.kind},
  content:{stringValue:item.content},
  revision:{integerValue:String(item.revision)},
  schemaVersion:{integerValue:String(item.schemaVersion)},
  verification:{stringValue:'confirmed'},
  retention:{stringValue:'until-deleted'},
  createdAt:{timestampValue:item.createdAt},
  updatedAt:{timestampValue:item.updatedAt},
  provenance:{arrayValue:{values:item.provenance.map(src=>({mapValue:{fields:{
   sourceId:{stringValue:src.sourceId},sourceKind:{stringValue:src.sourceKind},observedAt:{timestampValue:src.observedAt}
  }}}))}}
 };
}
function parseDoc(doc:Document,uid:string):ApprovedMemory|null{
 if(doc.fields?.deleted?.booleanValue===true)return null;
 const f=doc.fields;
 if(!doc.name||!f||f.ownerUid?.stringValue!==uid)return null;
 const id=doc.name.split('/').pop()||'';
 const revision=Number(f.revision?.integerValue),schemaVersion=Number(f.schemaVersion?.integerValue);
 const kind=f.kind?.stringValue,verification=f.verification?.stringValue;
 const sources=f.provenance?.arrayValue?.values||[];
 if(!validId.test(id)||!kinds.has(kind||'')||verification!=='confirmed'||f.retention?.stringValue!=='until-deleted')return null;
 if(!Number.isSafeInteger(revision)||revision<1||schemaVersion!==1||typeof f.content?.stringValue!=='string'||f.content.stringValue.length>1000)return null;
 if(!f.createdAt?.timestampValue||!f.updatedAt?.timestampValue||!sources.length||sources.length>100)return null;
 const provenance:MemoryProvenance[]=[];
 for(const source of sources){
  const entry=source.mapValue?.fields;
  if(!entry||!validId.test(entry.sourceId?.stringValue||'')||!sourceKinds.has(entry.sourceKind?.stringValue||'')||!entry.observedAt?.timestampValue)return null;
  provenance.push({
   sourceId:entry.sourceId!.stringValue!,
   sourceKind:entry.sourceKind!.stringValue! as MemoryProvenance['sourceKind'],
   observedAt:entry.observedAt.timestampValue
  });
 }
 return {
  id,ownerUid:uid,kind:kind as ApprovedMemory['kind'],content:f.content.stringValue,
  revision,schemaVersion:1,verification:'confirmed',retention:'until-deleted',
  createdAt:f.createdAt.timestampValue,updatedAt:f.updatedAt.timestampValue,
  provenance:provenance as [MemoryProvenance,...MemoryProvenance[]]
 };
}

export function firebasePersonalMemoryRepository(
 projectId:string,uid:string,idToken:string,transport:typeof fetch=fetch
):ControlledMemoryRepository{
 if(!validProject.test(projectId)||!validId.test(uid)||typeof idToken!=='string'||!idToken||idToken.length>10000||/[\s\x00-\x1f]/.test(idToken))
  throw new Error('Autenticação ou configuração da memória inválida.');
 const root='projects/'+projectId+'/databases/(default)/documents';
 const collection=root+'/users/'+encodeURIComponent(uid)+'/personalMemories';
 const base='https://firestore.googleapis.com/v1/';
 const headers={'Authorization':'Bearer '+idToken,'Content-Type':'application/json'};
 const options=(method:'GET'|'POST',body?:unknown):RequestInit=>({
  method,headers,signal:AbortSignal.timeout(10000),...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 function scoped(id:string){if(!validId.test(id))throw new Error('Identificador inválido.');return collection+'/'+encodeURIComponent(id);}
 function checkActor(inputUid:string){if(inputUid!==uid)throw new Error('Conta não autorizada para esta memória.');}
 async function request(path:string,method:'GET'|'POST',body?:unknown){
  return transport(base+path,options(method,body));
 }
 async function raw(id:string):Promise<Document|null>{
  const response=await request(scoped(id),'GET');
  if(response.status===404)return null;
  if(!response.ok)throw new Error('Não foi possível consultar memórias.'); // Do not reveal provider response.
  return response.json() as Promise<Document>;
 }
 function isConflict(status:number){return status===409||status===412;}
 return {
  async insertIfAbsent(item){
   checkActor(item.ownerUid);
   const response=await request(root+':commit','POST',{writes:[{
    update:{name:scoped(item.id),fields:fields(item)},currentDocument:{exists:false}
   }]});
   if(isConflict(response.status))return false;
   if(!response.ok)throw new Error('Não foi possível confirmar a gravação da memória.');
   return true;
  },
  async get(ownerUid,id){
   checkActor(ownerUid);
   const value=await raw(id);
   return value?parseDoc(value,uid):null;
  },
  async list(ownerUid,limit){
   checkActor(ownerUid);
   const safeLimit=Math.max(1,Math.min(200,Math.floor(limit)));
   const response=await request(root+'/users/'+encodeURIComponent(uid)+':runQuery','POST',{
    structuredQuery:{from:[{collectionId:'personalMemories'}],limit:safeLimit}
   });
   if(!response.ok)throw new Error('Não foi possível listar memórias.');
   const rows=await response.json() as {document?:Document}[];
   if(!Array.isArray(rows))throw new Error('Resposta de memória inválida.');
   return rows.map(row=>row.document?parseDoc(row.document,uid):null).filter((x):x is ApprovedMemory=>x!==null);
  },
  async replaceIfRevision(item,expectedRevision){
   checkActor(item.ownerUid);
   const old=await raw(item.id);
   const parsed=old&&parseDoc(old,uid);
   if(!parsed||parsed.revision!==expectedRevision||item.revision!==expectedRevision+1||!old?.updateTime)return false;
   const response=await request(root+':commit','POST',{writes:[{
    update:{name:scoped(item.id),fields:fields(item)},currentDocument:{updateTime:old.updateTime}
   }]});
   if(isConflict(response.status))return false;
   if(!response.ok)throw new Error('Não foi possível atualizar a memória.');
   return true;
  },
  async deleteIfRevision(ownerUid,id,expectedRevision){
   checkActor(ownerUid);
   const old=await raw(id),parsed=old&&parseDoc(old,uid);
   if(!parsed||parsed.revision!==expectedRevision||!old?.updateTime)return false;
   // Overwrite all fields: retained tombstone has NO text, source or personal details.
   const response=await request(root+':commit','POST',{writes:[{
    update:{name:scoped(id),fields:{
     deleted:{booleanValue:true},revision:{integerValue:String(expectedRevision+1)}
    }},currentDocument:{updateTime:old.updateTime}
   }]});
   if(isConflict(response.status))return false;
   if(!response.ok)throw new Error('Não foi possível excluir a memória.');
   return true;
  }
 };
}
