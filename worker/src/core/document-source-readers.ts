/** Bounded read-only discovery. Fetch all pages or FAIL without touching the prior index. */
import {HttpError} from '../validation';
import {validGoogleToken} from './sigma-connectors';
import {DOCUMENT_LIMIT,type DocumentSnapshot,type SourceDocument} from './document-index';
type Transport=typeof fetch;
const DRIVE='https://www.googleapis.com';
const NOTION='https://api.notion.com/v1';
const NOTION_VERSION='2026-03-11';
async function apiJson(response:Response,source:'drive'|'notion'):Promise<Record<string,unknown>>{
 if(response.status===401)throw new HttpError(401,'Permissão de '+source+' expirada. Reconecte.');
 if(response.status===403)throw new HttpError(403,'Permissão insuficiente em '+source+'.');
 if(response.status===429)throw new HttpError(429,'Limite de '+source+' atingido.');
 if(!response.ok)throw new HttpError(502,'Erro de consulta ao '+source+'. Índice anterior preservado.');
 const result=await response.json().catch(()=>null);
 if(!result||typeof result!=='object'||Array.isArray(result))throw new HttpError(502,'Resposta inválida de '+source+'.');
 return result as Record<string,unknown>;
}
/** Avoid buffering unexpectedly large provider responses inside a Worker. */
async function limitedPlainText(response:Response,maxBytes=15000):Promise<string|undefined>{
 const body=response.body;
 if(!body)return undefined;
 const reader=body.getReader();
 const chunks:Uint8Array[]=[];let count=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>maxBytes){await reader.cancel().catch(()=>{});return undefined;}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const combined=new Uint8Array(count);let offset=0;
 for(const item of chunks){combined.set(item,offset);offset+=item.byteLength;}
 const decoded=new TextDecoder('utf-8').decode(combined);
 return decoded.length<=12000?decoded:undefined;
}
const str=(value:unknown,max=200)=>typeof value==='string'?value.replace(/[\x00-\x1f]/g,' ').trim().slice(0,max):'';
function rich(arr:unknown):string{
 if(!Array.isArray(arr))return '';
 return arr.map((x:unknown)=>str((x as {plain_text?:unknown})?.plain_text,500)).join('').slice(0,3000);
}
function notionTitle(page:Record<string,unknown>):string{
 const direct=rich(page.title);
 if(direct)return direct;
 const properties=page.properties as Record<string,{type?:unknown;title?:unknown}>|undefined;
 if(properties&&typeof properties==='object'){
  for(const prop of Object.values(properties)){if(prop?.type==='title'&&rich(prop.title))return rich(prop.title);}
 }
 return 'Sem título';
}
function notionBlockText(row:Record<string,unknown>):string{
 const type=str(row.type,45);
 const node=(row as Record<string,unknown>)[type] as {rich_text?:unknown;caption?:unknown;title?:unknown}|undefined;
 const text=rich(node?.rich_text)||rich(node?.title)||rich(node?.caption);
 return text;
}
export async function fetchNotionDocumentSnapshot(key:string,transport:Transport=fetch,includeContent=false):Promise<DocumentSnapshot>{
 if(typeof key!=='string'||key.length<10||key.length>500||/[\r\n]/.test(key))
  throw new HttpError(503,'Configure NOTION_API_KEY no Worker LAB.');
 const headers={Authorization:'Bearer '+key,'Notion-Version':NOTION_VERSION,'Content-Type':'application/json'};
 const rows:Record<string,unknown>[]=[];
 let cursor:string|undefined;
 const seenCursors=new Set<string>();
 while(true){
  const request={page_size:75,sort:{direction:'descending',timestamp:'last_edited_time'},
   filter:{property:'object',value:'page'},...(cursor?{start_cursor:cursor}:{})};
  const response=await transport(NOTION+'/search',{
   method:'POST',headers,body:JSON.stringify(request),signal:AbortSignal.timeout(12000)
  });
  const result=await apiJson(response,'notion');
  if(!Array.isArray(result.results))throw new HttpError(502,'Busca Notion retornou itens inválidos.');
  if(typeof result.has_more!=='boolean')throw new HttpError(502,'Paginação Notion sem indicador válido: índice preservado.');
  rows.push(...result.results as Record<string,unknown>[]);
  if(rows.length>DOCUMENT_LIMIT)throw new HttpError(409,'Mais de 180 páginas: restrinja o acesso da integração Notion antes de sincronizar.');
  if(!result.has_more)break;
  if(typeof result.next_cursor!=='string'||!result.next_cursor||result.next_cursor===cursor||seenCursors.has(result.next_cursor))
   throw new HttpError(502,'Paginação Notion inconsistente: índice preservado.');
  seenCursors.add(result.next_cursor);
  cursor=result.next_cursor;
 }
 let remaining=includeContent?8:0;
 const documents:SourceDocument[]=[];
 for(const row of rows){
  const id=str(row.id,128),updatedAt=str(row.last_edited_time,40);
  if(!id||!updatedAt)throw new HttpError(502,'Página Notion sem identificação ou versão.');
  let text:string|undefined;
  if(remaining>0){
   remaining--;
   // A bounded excerpt only. Large pages and nested blocks are NOT fully indexed.
   try{
    const response=await transport(NOTION+'/blocks/'+encodeURIComponent(id)+'/children?page_size=100',{
     method:'GET',headers,signal:AbortSignal.timeout(10000)
    });
    const data=await apiJson(response,'notion');
    if(Array.isArray(data.results)){
     const content=(data.results as Record<string,unknown>[]).map(notionBlockText).filter(Boolean).join('\n');
     if(content)text=content.slice(0,12000);
    }
   }catch{ /* Keep metadata but never falsely report unavailable text as indexed. */ }
  }
  documents.push({
   source:'notion',sourceId:id.replace(/-/g,''),title:notionTitle(row).slice(0,200),
   version:updatedAt,updatedAt,url:str(row.url,550),mimeType:'application/vnd.notion.page',
   ...(text===undefined?{}:{text})
  });
 }
 return {source:'notion',complete:true,documents};
}
export async function fetchDriveDocumentSnapshot(
 token:string,transport:Transport=fetch,includeContent=false
):Promise<DocumentSnapshot>{
 validGoogleToken(token);
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const rows:Record<string,unknown>[]=[];
 let pageToken:string|undefined;
 const seenPageTokens=new Set<string>();
 while(true){
  const args=new URLSearchParams({
   q:"trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain')",
   fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,webViewLink,version,md5Checksum)',
   pageSize:'100',orderBy:'modifiedTime desc'
  });
  if(pageToken)args.set('pageToken',pageToken);
  const response=await transport(DRIVE+'/drive/v3/files?'+args,{
   headers,signal:AbortSignal.timeout(12000)
  });
  const result=await apiJson(response,'drive');
  if(!Array.isArray(result.files))throw new HttpError(502,'Listagem Drive inválida.');
  // Drive can return HTTP 200 with incompleteSearch=true; never treat that as a complete inventory.
  if(result.incompleteSearch!==undefined&&result.incompleteSearch!==false)
   throw new HttpError(502,'Listagem Drive incompleta: índice anterior preservado.');
  rows.push(...result.files as Record<string,unknown>[]);
  if(rows.length>DOCUMENT_LIMIT)throw new HttpError(409,'Mais de 180 documentos: índice preservado; não ocorreu exclusão parcial.');
  if(!result.nextPageToken)break;
  if(typeof result.nextPageToken!=='string'||result.nextPageToken===pageToken||seenPageTokens.has(result.nextPageToken))
   throw new HttpError(502,'Paginação Drive inconsistente: índice preservado.');
  seenPageTokens.add(result.nextPageToken);
  pageToken=result.nextPageToken;
 }
 let remaining=includeContent?8:0;
 const documents:SourceDocument[]=[];
 for(const row of rows){
  const id=str(row.id,128),updatedAt=str(row.modifiedTime,40),mimeType=str(row.mimeType,128);
  if(!id||!updatedAt||!mimeType)throw new HttpError(502,'Documento Drive sem identificador, tipo ou data.');
  let text:string|undefined;
  if(remaining>0&&(mimeType==='application/vnd.google-apps.document'||mimeType==='text/plain')){
   remaining--;
   const path=mimeType==='application/vnd.google-apps.document'?
    DRIVE+'/drive/v3/files/'+encodeURIComponent(id)+'/export?mimeType=text%2Fplain':
    DRIVE+'/drive/v3/files/'+encodeURIComponent(id)+'?alt=media';
   try{
    const response=await transport(path,{headers,signal:AbortSignal.timeout(9000)});
    if(response.ok){
     const length=Number(response.headers.get('Content-Length')||'0');
     if(length<=15000)text=await limitedPlainText(response);
    }
   }catch{ /* Fail closed for content; metadata remains available. */ }
  }
  const version=str(row.version||row.md5Checksum||updatedAt,140);
  const link=str(row.webViewLink,550);
  documents.push({source:'drive',sourceId:id,title:str(row.name,200)||'Sem título',
   version,updatedAt,url:link.startsWith('https://')?link:'',mimeType,
   ...(text===undefined?{}:{text})});
 }
 return {source:'drive',complete:true,documents};
}
