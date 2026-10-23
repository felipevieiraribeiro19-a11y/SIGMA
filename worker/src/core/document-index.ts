/** SIGMA LAB - deterministic, source-attributed document catalog. No AI calls or secret storage. */
import {HttpError} from '../validation';
export type DocumentSource='drive'|'notion';
export type IndexedDocument={
 key:string;source:DocumentSource;sourceId:string;title:string;version:string;
 updatedAt:string;url:string;mimeType:string;text:string;indexedAt:string;
 contentStatus:'indexed'|'metadata-only';
};
export type SourceDocument=Omit<IndexedDocument,'key'|'indexedAt'|'contentStatus'|'text'> &{text?:string};
export type DocumentSnapshot={source:DocumentSource;complete:true;documents:SourceDocument[]};
export type DocumentChanges={added:number;updated:number;unchanged:number;removed:number;total:number};
// Inventário de até 1.000 itens por origem; 2.000 no índice combinado.
export const MAX_DOCUMENTS_PER_SOURCE=1000;
export const DOCUMENT_LIMIT=2*MAX_DOCUMENTS_PER_SOURCE;
const illegal=/[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const allowedUrl=/^https:\/\/(?:drive\.google\.com|docs\.google\.com|www\.notion\.so|notion\.so)(?:\/|$)/i;
export function validateSnapshot(data:unknown):DocumentSnapshot{
 if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'Lote de documentos inválido.');
 const s=data as Record<string,unknown>;
 if(s.source!=='drive'&&s.source!=='notion')throw new HttpError(400,'Fonte de documento desconhecida.');
 if(s.complete!==true)throw new HttpError(409,'Listagem incompleta: o índice foi preservado.');
 if(!Array.isArray(s.documents)||s.documents.length>MAX_DOCUMENTS_PER_SOURCE)throw new HttpError(413,'Limite de documentos por sincronização excedido.');
 const source=s.source as DocumentSource;
 const keys=new Set<string>();
 const documents=s.documents.map((raw,i)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Documento inválido: '+i);
  const doc=raw as Record<string,unknown>;
  const id=doc.sourceId,title=doc.title,version=doc.version,updatedAt=doc.updatedAt,url=doc.url,mimeType=doc.mimeType;
  if(doc.source!==source||typeof id!=='string'||id.length<1||id.length>130||!/^[-_A-Za-z0-9]+$/.test(id))
   throw new HttpError(400,'Identificador de documento inválido.');
  if(keys.has(id))throw new HttpError(409,'Documento duplicado na listagem.');keys.add(id);
  if(typeof title!=='string'||!title.trim()||title.length>200||illegal.test(title))
   throw new HttpError(400,'Título de documento inválido.');
  if(typeof version!=='string'||!version||version.length>140||illegal.test(version))
   throw new HttpError(400,'Versão do documento inválida.');
  if(typeof updatedAt!=='string'||updatedAt.length>45||!Number.isFinite(Date.parse(updatedAt)))
   throw new HttpError(400,'Data do documento inválida.');
  if(typeof url!=='string'||url.length>550||(url!==''&&!allowedUrl.test(url)))
   throw new HttpError(400,'Link de documento inválido.');
  if(typeof mimeType!=='string'||!mimeType||mimeType.length>130||illegal.test(mimeType))
   throw new HttpError(400,'Tipo de documento inválido.');
  if(doc.text!==undefined&&(typeof doc.text!=='string'||doc.text.length>12000||illegal.test(doc.text)))
   throw new HttpError(400,'Texto extraído inválido.');
  const text=typeof doc.text==='string'?doc.text:undefined;
  return {source,sourceId:id,title:title.trim(),version,updatedAt,url,mimeType,...(text===undefined?{}:{text})} as SourceDocument;
 });
 return {source,complete:true,documents};
}
export function reconcileDocuments(old:IndexedDocument[],snapshot:DocumentSnapshot,now=new Date().toISOString()):
 {documents:IndexedDocument[];changes:DocumentChanges}{
 const validated=validateSnapshot(snapshot);
 const other=old.filter(x=>x.source!==validated.source);
 const previous=new Map(old.filter(x=>x.source===validated.source).map(x=>[x.sourceId,x]));
 let added=0,updated=0,unchanged=0;
 const replacement=validated.documents.map(d=>{
  const existing=previous.get(d.sourceId);
  // A metadata-only scan must not discard extracted text from the SAME source version.
  const keepText=existing&&existing.version===d.version&&d.text===undefined;
  const text=keepText?existing.text:(d.text||'');
  const candidate:IndexedDocument={...d,key:d.source+':'+d.sourceId,text,
   indexedAt:existing?.indexedAt||now,contentStatus:text?'indexed':'metadata-only'};
  if(!existing){added++;return candidate;}
  if(existing.version===candidate.version&&existing.title===candidate.title&&
   existing.url===candidate.url&&existing.mimeType===candidate.mimeType&&
   existing.updatedAt===candidate.updatedAt&&existing.text===candidate.text){
   unchanged++;return existing;
  }
  updated++;return {...candidate,indexedAt:now};
 });
 const removed=previous.size-replacement.filter(x=>previous.has(x.sourceId)).length;
 const documents=[...other,...replacement].sort((a,b)=>a.key.localeCompare(b.key));
 if(documents.length>DOCUMENT_LIMIT)throw new HttpError(409,'O índice atingiu o limite seguro do laboratório.');
 return {documents,changes:{added,updated,unchanged,removed,total:documents.length}};
}
const stop=new Set('qual quais para como uma umas uns sobre este esta essas esse desses seus suas meus minhas você voce isso quero posso pode onde quando todos todas pelo pela com sem dos das que uma nos nas por mais aos nao não'.split(' '));
export function documentTokens(value:string):string[]{
 return [...new Set((value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(t=>!stop.has(t)))].slice(0,24);
}
export type DocumentHit={key:string;title:string;source:DocumentSource;url:string;
 updatedAt:string;contentStatus:IndexedDocument['contentStatus'];excerpt:string;score:number};
export function searchDocuments(documents:IndexedDocument[],query:string):DocumentHit[]{
 if(typeof query!=='string'||!query.trim()||query.length>180||illegal.test(query))throw new HttpError(400,'Pesquisa inválida.');
 const terms=documentTokens(query);
 if(!terms.length)return [];
 const hits:DocumentHit[]=[];
 for(const doc of documents){
  const title=doc.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const content=doc.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const titleCount=terms.filter(t=>title.includes(t)).length;
  const textCount=terms.filter(t=>content.includes(t)).length;
  const score=titleCount*6+textCount*2;
  if(score<=0)continue;
  const first=terms.map(t=>content.indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b)[0]??0;
  const from=Math.max(0,first-85);
  const excerpt=doc.text?doc.text.slice(from,Math.min(doc.text.length,from+360)):'Somente metadados: conteúdo ainda não indexado.';
  hits.push({key:doc.key,title:doc.title,source:doc.source,url:doc.url,updatedAt:doc.updatedAt,
   contentStatus:doc.contentStatus,excerpt,score});
 }
 return hits.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,15);
}
