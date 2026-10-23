/** Generic project workspace for SIGMA LAB. No domain-specific schemas or external integrations. */
import {HttpError} from '../validation';

export const PROJECT_LIMIT=50;
export type ProjectStatus='active'|'paused'|'archived';
export type Project={
 id:string;title:string;goal:string;notes:string;status:ProjectStatus;
 createdAt:string;updatedAt:string;
};
export type ProjectDraft=Pick<Project,'title'|'goal'|'notes'>;
export type ProjectPatch=Partial<ProjectDraft&Pick<Project,'status'>>;
export type ProjectOverview=Project&{
 recordCount:number;tasksOpen:number;tasksDone:number;studyMinutes:number;
 financeBalance:number;
};
const allowedFields=new Set(['title','goal','notes','status']);
const clean=(value:unknown,label:string,max:number,min=0):string=>{
 if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
  throw new HttpError(400,label+' inválido.');
 return value.trim();
};
const object=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new HttpError(400,'Dados de projeto inválidos.');
 return value as Record<string,unknown>;
};
export function projectCreatePayload(value:unknown):ProjectDraft{
 const v=object(value);
 if(Object.keys(v).some(k=>!allowedFields.has(k))||v.status!==undefined||
  v.title===undefined||v.goal===undefined)
  throw new HttpError(400,'Informe apenas título, objetivo e observações.');
 return {
  title:clean(v.title,'Título do projeto',120,2),
  goal:clean(v.goal,'Objetivo do projeto',1000,2),
  notes:v.notes===undefined?'':clean(v.notes,'Observações do projeto',2000)
 };
}
export function projectPatchPayload(value:unknown):ProjectPatch{
 const v=object(value),keys=Object.keys(v);
 if(!keys.length||keys.some(k=>!allowedFields.has(k)))
  throw new HttpError(400,'Campos de projeto inválidos.');
 const patch:ProjectPatch={};
 if('title'in v)patch.title=clean(v.title,'Título do projeto',120,2);
 if('goal'in v)patch.goal=clean(v.goal,'Objetivo do projeto',1000,2);
 if('notes'in v)patch.notes=clean(v.notes,'Observações do projeto',2000);
 if('status'in v){
  if(v.status!=='active'&&v.status!=='paused'&&v.status!=='archived')
   throw new HttpError(400,'Estado de projeto inválido.');
  patch.status=v.status;
 }
 return patch;
}
type ProjectLinkedEntry={
 kind:string;projectId?:string;minutes:number;amount:number;done:boolean;
};
export function projectOverview(
 projects:readonly Project[],entries:readonly ProjectLinkedEntry[]
):ProjectOverview[]{
 const stat=new Map<string,Pick<ProjectOverview,'recordCount'|'tasksOpen'|'tasksDone'|'studyMinutes'|'financeBalance'>>();
 for(const project of projects)
  stat.set(project.id,{recordCount:0,tasksOpen:0,tasksDone:0,studyMinutes:0,financeBalance:0});
 for(const item of entries){
  const value=item.projectId?stat.get(item.projectId):undefined;
  if(!value)continue;
  value.recordCount++;
  if(item.kind==='task'){if(item.done)value.tasksDone++;else value.tasksOpen++;}
  if(item.kind==='study')value.studyMinutes+=item.minutes;
  if(item.kind==='finance')value.financeBalance+=item.amount;
 }
 return projects.map(project=>{
  const value=stat.get(project.id)!;
  return {...project,...value,financeBalance:Math.round(value.financeBalance*100)/100};
 }).sort((a,b)=>{
  const rank=(status:ProjectStatus)=>status==='active'?0:status==='paused'?1:2;
  return rank(a.status)-rank(b.status)||b.updatedAt.localeCompare(a.updatedAt)||
   a.title.localeCompare(b.title,'pt-BR');
 });
}
