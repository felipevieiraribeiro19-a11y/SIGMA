/** SIGMA DOCS LAB: metadata-only catalogue, no file content nor provider mutations. */
import {HttpError} from '../validation';
export type DocSource='drive'|'notion';
export type DocState='available'|'missing';
export type IndexedDocument={
  source:DocSource;externalId:string;title:string;mimeType:string;
  modifiedAt:string;url?:string;state:DocState;indexedAt:string;
};
export type RemoteDocument=Omit<IndexedDocument,'state'|'indexedAt'>;
export type DocumentDelta={added:number;updated:number;missing:number;unchanged:number};
export type DocumentSnapshot={entries:IndexedDocument[];delta:DocumentDelta};
export const MAX_DOCUMENTS_PER_SOURCE=1000;
const sanitize=(value:unknown,max:number)=>{
 if(typeof value!=='string')return '';
 return value.replace(/[\x00-\x1f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
};
const ident=/^[A-Za-z0-9_-]{3,200}$/;
const notionId=/^[0-9a-f-]{32,36}$/i;
function sourceLink(source:DocSource,value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>500)return undefined;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return undefined;
  const allowed=source==='drive'
   ?['drive.google.com','docs.google.com']
   :['www.notion.so','notion.so'];
  if(!allowed.includes(url.hostname.toLowerCase()))return undefined;
  return url.href.slice(0,500);
 }catch{return undefined;}
}
export function normalizeDocument(source:DocSource,input:unknown):RemoteDocument{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw new HttpError(502,'Metadados externos inválidos.');
 const o=input as Record<string,unknown>;
 const externalId=sanitize(o.id,200);
 if(source==='drive'&&!ident.test(externalId)||source==='notion'&&!notionId.test(externalId))
  throw new HttpError(502,'Identificador remoto inválido.');
 const title=sanitize(o.name||o.title,180)||'Sem título';
 const modifiedAt=sanitize(o.modifiedTime||o.last_edited_time,45);
 if(modifiedAt&&(!Number.isFinite(Date.parse(modifiedAt))||modifiedAt.length<10))
  throw new HttpError(502,'Data remota inválida.');
 const mimeType=sanitize(o.mimeType||o.object,100)||'application/octet-stream';
 const url=sourceLink(source,o.webViewLink||o.url);
 return {source,externalId,title,mimeType,modifiedAt,...(url?{url}:{})};
}
export function normalizeNotionRecord(raw:unknown):RemoteDocument{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new HttpError(502,'Página Notion inválida.');
 const o=raw as Record<string,unknown>;
 const properties=o.properties as Record<string,unknown>|undefined;
 let title='';
 const propertyList=properties&&typeof properties==='object'?
  Object.values(properties).find(x=>x&&typeof x==='object'&&(x as {type?:unknown}).type==='title') as {title?:unknown}|undefined:undefined;
 const tokens=Array.isArray(o.title)?o.title:Array.isArray(propertyList?.title)?propertyList?.title:[];
 title=tokens.map(x=>x&&typeof x==='object'?(x as {plain_text?:unknown}).plain_text:'').filter(x=>typeof x==='string').join('');
 return normalizeDocument('notion',{...o,title:title||o.object});
}
function sameContent(a:IndexedDocument,b:RemoteDocument):boolean{
 return a.title===b.title&&a.modifiedAt===b.modifiedAt&&
  a.mimeType===b.mimeType&&a.url===b.url;
}
/**
 * Full-source scan is committed only AFTER the final remote page.
 * Missing items are tombstoned in SIGMA only: never deleted from Drive/Notion.
 */
export function mergeCompleteSnapshot(
 source:DocSource,previous:IndexedDocument[],fetched:RemoteDocument[],at:string
):DocumentSnapshot{
 if(!Number.isFinite(Date.parse(at)))throw new HttpError(400,'Hora inválida.');
 if(previous.some(x=>x.source!==source)||fetched.some(x=>x.source!==source))
  throw new HttpError(400,'Fontes não podem ser misturadas.');
 if(fetched.length>MAX_DOCUMENTS_PER_SOURCE)throw new HttpError(413,'Biblioteca maior que o limite experimental.');
 const unique=new Map(fetched.map(x=>[x.externalId,x]));
 if(unique.size!==fetched.length)throw new HttpError(502,'Itens duplicados no resultado da sincronização.');
 const byId=new Map(previous.map(x=>[x.externalId,x]));
 const delta:DocumentDelta={added:0,updated:0,missing:0,unchanged:0};
 const entries:IndexedDocument[]=[];
 for(const doc of fetched){
  const old=byId.get(doc.externalId);
  if(!old)delta.added++;
  else if(old.state==='missing'||!sameContent(old,doc))delta.updated++;
  else delta.unchanged++;
  entries.push({...doc,state:'available',indexedAt:at});
 }
 for(const old of previous){
  if(unique.has(old.externalId))continue;
  if(old.state==='available')delta.missing++;
  entries.push({...old,state:'missing',indexedAt:at});
 }
 // Keep a bounded number of metadata tombstones; never retain file contents.
 const alive=entries.filter(x=>x.state==='available');
 const missing=entries.filter(x=>x.state==='missing').slice(-MAX_DOCUMENTS_PER_SOURCE);
 return {entries:[...alive,...missing].slice(0,2*MAX_DOCUMENTS_PER_SOURCE),delta};
}
export function publicDocumentSearch(entries:IndexedDocument[],query:string,includeMissing=false):IndexedDocument[]{
 const needle=sanitize(query,100).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!needle)return entries.filter(x=>includeMissing||x.state==='available').slice(0,100);
 return entries.filter(x=>(includeMissing||x.state==='available')&&
  (x.title+' '+x.mimeType).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle)).slice(0,100);
}
