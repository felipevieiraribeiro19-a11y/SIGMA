/** External writes require prior user-reviewed, one-use Durable Object claim. */
import {HttpError} from '../validation';
import {validGoogleToken} from './sigma-connectors';
import type {LabAction} from '../lab-external-actions';
export async function executeApprovedExternalAction(
 action:LabAction,googleToken:string|null,notionKey:string|undefined,
 transport:typeof fetch=fetch
):Promise<{status:'succeeded'|'failed'|'uncertain';providerId?:string}>{
 if(action.status!=='in_progress')throw new HttpError(409,'Ação não reivindicada.');
 const {operation,title,start,end,parentId,content,dueDate}=action.data;
 let url:string,body:Record<string,unknown>,headers:Record<string,string>={'Content-Type':'application/json'};
 if(operation==='calendar.create'){
  const token=validGoogleToken(googleToken);
  url='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  headers.Authorization='Bearer '+token;
  body={id:'sigma'+action.id.replace(/-/g,''),summary:title,...(content?{description:content}:{}),
   start:{dateTime:start,timeZone:'America/Sao_Paulo'},
   end:{dateTime:end,timeZone:'America/Sao_Paulo'}};
 }else if(operation==='tasks.create'){
  headers.Authorization='Bearer '+validGoogleToken(googleToken);
  url='https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';
  body={title,...(content?{notes:content}:{}),...(dueDate?{due:dueDate+'T00:00:00.000Z'}:{})};
 }else if(operation==='drive.note.create'){
  headers.Authorization='Bearer '+validGoogleToken(googleToken);
  const boundary='sigma_'+crypto.randomUUID();
  headers['Content-Type']='multipart/related; boundary='+boundary;
  const metadata={name:title+'.txt',mimeType:'text/plain',...(parentId?{parents:[parentId]}:{})};
  const payload=['--'+boundary,'Content-Type: application/json; charset=UTF-8','',JSON.stringify(metadata),'--'+boundary,'Content-Type: text/plain; charset=UTF-8','',content||title,'--'+boundary+'--'].join('\r\n');
  try{
   const result=await transport('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers,body:payload,signal:AbortSignal.timeout(12000)});
   if([400,401,403,404,422].includes(result.status))return {status:'failed'};
   if(!result.ok)return {status:'uncertain'};
   const data=await result.json() as {id?:unknown};
   return typeof data.id==='string'?{status:'succeeded',providerId:data.id}:{status:'uncertain'};
  }catch{return {status:'uncertain'};}
 }else if(operation==='drive.folder.create'){
  headers.Authorization='Bearer '+validGoogleToken(googleToken);
  url='https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink';
  body={name:title,mimeType:'application/vnd.google-apps.folder',...(parentId?{parents:[parentId]}:{})};
 }else if(operation==='notion.page.create'){
  if(!notionKey||notionKey.length<10)throw new HttpError(503,'Segredo Notion não configurado.');
  headers.Authorization='Bearer '+notionKey;headers['Notion-Version']='2026-03-11';
  url='https://api.notion.com/v1/pages';
  body={parent:{type:'page_id',page_id:parentId},
   properties:{title:{type:'title',title:[{type:'text',text:{content:title}}]}},
   ...(content?{children:[{object:'block',type:'paragraph',paragraph:{rich_text:(content.match(/[\s\S]{1,1900}/g)||[]).map(text=>({type:'text',text:{content:text}}))}}]}:{})};
 }else throw new HttpError(400,'Ação desconhecida.');
 try{
  const response=await transport(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(response.status===400||response.status===401||response.status===403||response.status===404||response.status===422)
   return {status:'failed'};
  if(!response.ok)return {status:'uncertain'};
  const responseBody=await response.json().catch(()=>null);
  const id=(responseBody as {id?:unknown}|null)?.id;
  return typeof id==='string'?{status:'succeeded',providerId:id.slice(0,128)}:{status:'uncertain'};
 }catch{
  // Request could have been delivered despite a lost response. Never retry blindly.
  return {status:'uncertain'};
 }
}
