/** Private LAB document-index API. Requires Firebase UID & exact origin at router. */
import {HttpError} from './validation';
import {validGoogleToken} from './core/sigma-connectors';
import {readDocumentPage} from './core/sigma-document-pages';
import type {DocSource} from './core/sigma-document-index';
type ApiEnv={
 LAB_DOCUMENTS_ENABLED?:string;
 LAB_DOCUMENTS?:DurableObjectNamespace;
 NOTION_API_KEY?:string;
};
const sourceFrom=(value:unknown):DocSource=>{
 if(value!=='drive'&&value!=='notion')throw new HttpError(400,'Fonte documental inválida.');
 return value;
};
async function delegated(stub:DurableObjectStub,path:string,init?:RequestInit):Promise<any>{
 const response=await stub.fetch('https://sigma-lab-documents.internal'+path,init);
 const data:any=await response.json().catch(()=>null);
 if(!response.ok)throw new HttpError(response.status,data?.error||'Índice temporariamente indisponível.');
 return data;
}
export async function handleLabDocumentApi(
 request:Request,env:ApiEnv,uid:string,transport:typeof fetch=fetch
):Promise<{data:unknown;status:number}>{
 if(env.LAB_DOCUMENTS_ENABLED!=='true'||!env.LAB_DOCUMENTS)
  throw new HttpError(503,'Biblioteca de documentos ainda desativada no laboratório.');
 const stub=env.LAB_DOCUMENTS.get(env.LAB_DOCUMENTS.idFromName(uid));
 const url=new URL(request.url);
 if(url.pathname==='/api/lab/documents/status'){
  if(request.method!=='GET')throw new HttpError(405,'Método não permitido.');
  return {data:await delegated(stub,'/status'),status:200};
 }
 if(url.pathname==='/api/lab/documents/list'){
  if(request.method!=='GET')throw new HttpError(405,'Método não permitido.');
  const qs=new URLSearchParams({
   source:sourceFrom(url.searchParams.get('source')),
   q:url.searchParams.get('q')||'',
   missing:url.searchParams.get('missing')==='true'?'true':'false'
  });
  return {data:await delegated(stub,'/list?'+qs),status:200};
 }
 if(url.pathname!=='/api/lab/documents/sync')throw new HttpError(404,'Rota não encontrada.');
 if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))
  throw new HttpError(415,'Envie JSON.');
 const raw=await request.text();
 if(raw.length>300)throw new HttpError(413,'Solicitação longa demais.');
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{throw new HttpError(400,'JSON inválido.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw new HttpError(400,'Solicitação inválida.');
 const payload=parsed as Record<string,unknown>;
 if(Object.keys(payload).some(k=>!['source','action','scanId'].includes(k)))
  throw new HttpError(400,'Campos não permitidos.');
 const source=sourceFrom(payload.source);
 if(!['start','continue','cancel'].includes(String(payload.action)))
  throw new HttpError(400,'Ação de sincronização inválida.');
 const action=payload.action as 'start'|'continue'|'cancel';
 if(action==='start'&&payload.scanId!==undefined)
  throw new HttpError(400,'Novo scan não recebe scanId.');
 if(action!=='start'&&
  (typeof payload.scanId!=='string'||!(/^[0-9a-f-]{36}$/i).test(payload.scanId)))
  throw new HttpError(400,'Identificador de varredura inválido.');
 if(action==='cancel'){
  const data=await delegated(stub,'/scan/cancel',{method:'POST',body:JSON.stringify({
   source,scanId:payload.scanId
  })});
  return {data,status:200};
 }
 // Ensure credentials exist BEFORE starting a scan, without persisting tokens.
 const access=source==='drive'?
  validGoogleToken(request.headers.get('X-Google-Token')):env.NOTION_API_KEY||'';
 if(source==='notion'&&(access.length<10||access.length>500))
  throw new HttpError(503,'Configure o segredo NOTION_API_KEY no Worker de laboratório.');
 if(action==='start')
  await delegated(stub,'/scan/start',{method:'POST',body:JSON.stringify({source})});
 const state=await delegated(stub,'/scan/peek?source='+source);
 const scan=state.scan as {
  id:string;cursor:string|null;page:number;source:DocSource;
 };
 if(action==='continue'&&payload.scanId!==scan.id)
  throw new HttpError(409,'Essa sincronização já mudou ou foi encerrada.');
 const page=await readDocumentPage(source,access,scan.cursor,transport);
 const result=await delegated(stub,'/scan/page',{method:'POST',body:JSON.stringify({
  source,scanId:scan.id,page:scan.page,cursor:scan.cursor,
  nextCursor:page.nextCursor,items:page.items
 })});
 return {data:result,status:200};
}
