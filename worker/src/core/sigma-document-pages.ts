/** Paginated, read-only metadata crawlers. No file downloading, no indexing of content. */
import {HttpError} from '../validation';
import {publicProviderError,validGoogleToken} from './sigma-connectors';
import {normalizeDocument,normalizeNotionRecord,type DocSource,type RemoteDocument} from './sigma-document-index';
export type RemotePage={items:RemoteDocument[];nextCursor:string|null};
function nextCursor(value:unknown):string|null{
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||value.length>2048||/[\x00-\x1f]/.test(value))
  throw new HttpError(502,'Cursor da integração inválido.');
 return value;
}
function parseApiResponse(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new HttpError(502,'Resposta externa inválida.');
 return value as Record<string,unknown>;
}
export async function readDocumentPage(source:DocSource,auth:string, cursor:string|null,
 transport:typeof fetch=fetch):Promise<RemotePage>{
 const safeCursor=nextCursor(cursor);
 let endpoint:string,init:RequestInit;
 if(source==='drive'){
  validGoogleToken(auth);
  const qs=new URLSearchParams({q:'trashed = false',pageSize:'100',spaces:'drive',
   fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,webViewLink)'});
  if(safeCursor)qs.set('pageToken',safeCursor);
  endpoint='https://www.googleapis.com/drive/v3/files?'+qs;
  init={method:'GET',headers:{Authorization:'Bearer '+auth,Accept:'application/json'},
   signal:AbortSignal.timeout(10000)};
 }else if(source==='notion'){
  if(!auth||auth.length<10||auth.length>500||/[\r\n]/.test(auth))
   throw new HttpError(503,'Conexão Notion ainda não configurada.');
  endpoint='https://api.notion.com/v1/search';
  init={method:'POST',headers:{Authorization:'Bearer '+auth,'Notion-Version':'2026-03-11',
   'Content-Type':'application/json'},body:JSON.stringify({
    page_size:100,...(safeCursor?{start_cursor:safeCursor}:{})
   }),signal:AbortSignal.timeout(10000)};
 }else throw new HttpError(400,'Fonte inválida.');
 let res:Response;
 try{res=await transport(endpoint,init);}
 catch{throw new HttpError(502,'Falha de rede ao consultar documentos.');}
 if(!res.ok)throw publicProviderError(res,source);
 const data=parseApiResponse(await res.json().catch(()=>null));
 if(source==='drive'){
  if(data.incompleteSearch===true)
   throw new HttpError(503,'O Google informou busca incompleta; o índice anterior foi preservado.');
  if(!Array.isArray(data.files)||data.files.length>100)
   throw new HttpError(502,'Lista de arquivos Google inválida.');
  const items=data.files.map(x=>normalizeDocument('drive',x));
  return {items,nextCursor:nextCursor(data.nextPageToken)};
 }
 if(!Array.isArray(data.results)||data.results.length>100)
  throw new HttpError(502,'Lista Notion inválida.');
 const pages=data.results.filter(x=>x&&typeof x==='object'&&
  ['page','database','data_source'].includes((x as {object?:string}).object||''));
 const token=nextCursor(data.next_cursor);
 if(data.has_more===true&&!token)
  throw new HttpError(502,'Notion não retornou cursor para continuar.');
 if(data.has_more!==true&&data.has_more!==false)
  throw new HttpError(502,'Resposta de paginação Notion inválida.');
 return {items:pages.map(normalizeNotionRecord),nextCursor:data.has_more?token:null};
}
