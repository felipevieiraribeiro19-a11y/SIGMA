/** External writes require prior user-reviewed, one-use Durable Object claim. */
import {HttpError} from '../validation';
import {validGoogleToken} from './sigma-connectors';
import type {LabAction} from '../lab-external-actions';
export async function executeApprovedExternalAction(
 action:LabAction,googleToken:string|null,notionKey:string|undefined,
 transport:typeof fetch=fetch
):Promise<{status:'succeeded'|'failed'|'uncertain';providerId?:string}>{
 if(action.status!=='in_progress')throw new HttpError(409,'Ação não reivindicada.');
 const {operation,title,start,end,parentId}=action.data;
 let url:string,body:Record<string,unknown>,headers:Record<string,string>={'Content-Type':'application/json'};
 if(operation==='calendar.create'){
  const token=validGoogleToken(googleToken);
  url='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  headers.Authorization='Bearer '+token;
  body={id:'sigma'+action.id.replace(/-/g,''),summary:title,
   start:{dateTime:start,timeZone:'America/Sao_Paulo'},
   end:{dateTime:end,timeZone:'America/Sao_Paulo'}};
 }else if(operation==='drive.folder.create'){
  headers.Authorization='Bearer '+validGoogleToken(googleToken);
  url='https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink';
  body={name:title,mimeType:'application/vnd.google-apps.folder',...(parentId?{parents:[parentId]}:{})};
 }else if(operation==='notion.page.create'){
  if(!notionKey||notionKey.length<10)throw new HttpError(503,'Segredo Notion não configurado.');
  headers.Authorization='Bearer '+notionKey;headers['Notion-Version']='2022-06-28';
  url='https://api.notion.com/v1/pages';
  body={parent:{type:'page_id',page_id:parentId},
   properties:{title:{type:'title',title:[{type:'text',text:{content:title}}]}}};
 }else throw new HttpError(400,'Ação desconhecida.');
 try{
  const response=await transport(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(response.status===400||response.status===401||response.status===403||response.status===404||response.status===422)
   return {status:'failed'};
  if(!response.ok)return {status:'uncertain'};
  const responseBody=await response.json().catch(()=>null);
  const id=(responseBody as {id?:unknown}|null)?.id;
  return {status:'succeeded',...(typeof id==='string'?{providerId:id.slice(0,128)}:{})};
 }catch{
  // Request could have been delivered despite a lost response. Never retry blindly.
  return {status:'uncertain'};
 }
}
