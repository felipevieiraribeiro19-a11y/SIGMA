import {useState} from 'react';
import type {User} from 'firebase/auth';
import {validLabApiBase} from './jarvis-chat-protocol';

const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
export type LabProject={
 id:string;title:string;goal:string;notes:string;status:'active'|'paused'|'archived';
 createdAt:string;updatedAt:string;recordCount:number;tasksOpen:number;
 tasksDone:number;studyMinutes:number;financeBalance:number;
};
const statusLabel={active:'Ativo',paused:'Pausado',archived:'Arquivado'};
export function LabProjectsPanel({user,projects,selectedId,onSelect,onRefresh}:{
 user:User|null;projects:LabProject[];selectedId:string;
 onSelect:(id:string)=>void;onRefresh:()=>Promise<void>;
}){
 const [title,setTitle]=useState('');
 const [goal,setGoal]=useState('');
 const [notes,setNotes]=useState('');
 const [editingId,setEditingId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 async function call(path:string,method:string,body:unknown){
  if(!user||!api)throw Error('Faça login no laboratório para gerenciar projetos.');
  const token=await user.getIdToken();
  const resp=await fetch(api+'/api/lab/workspace/projects'+path,{method,cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(body)});
  const result=await resp.json().catch(()=>null) as {error?:string}|null;
  if(!resp.ok)throw Error(result?.error||'Operação de projeto indisponível.');
 }
 async function execute(action:()=>Promise<void>){
  if(busy||!user)return;
  setBusy(true);setError('');setNotice('');
  try{await action();await onRefresh();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar o projeto.');}
  finally{setBusy(false);}
 }
 function edit(project:LabProject){
  setEditingId(project.id);setTitle(project.title);setGoal(project.goal);
  setNotes(project.notes);setError('');setNotice('Edite e salve; os registros do projeto serão preservados.');
 }
 function clear(){
  setEditingId(null);setTitle('');setGoal('');setNotes('');
 }
 async function save(){
  await execute(async()=>{
   const form={title,goal,notes};
   await call(editingId?'/'+editingId:'',editingId?'PATCH':'POST',form);
   setNotice(editingId?'Projeto atualizado; registros preservados.':'Projeto criado.');
   clear();
  });
 }
 async function changeStatus(project:LabProject,status:LabProject['status']){
  if(status==='archived'&&!window.confirm(
   'Arquivar "'+project.title+'"? Os dados serão preservados e poderão ser reativados.'))return;
  await execute(async()=>{
   await call('/'+project.id,'PATCH',{status});
   if(status==='archived'&&selectedId===project.id)onSelect('');
   setNotice('Estado alterado: '+statusLabel[status]+'. Nenhum registro foi apagado.');
  });
 }
 return <section className="lab-workspace-form" aria-label="Projetos do SIGMA">
  <h3>Meus projetos — uma área para cada objetivo</h3>
  <p>Crie projetos para estudos, vendas, empresas ou qualquer assunto. As ferramentas de tarefas, registros e finanças podem ser usadas dentro deles. Não é preciso criar uma pasta nem programar outro aplicativo.</p>
  <div className="lab-workspace-form">
   <strong>{editingId?'Editar projeto':'Novo projeto'}</strong>
   <label>Nome<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}
    placeholder="Ex.: Clientes e vendas, Império da Batata"/></label>
   <label>Objetivo<textarea rows={2} maxLength={1000} value={goal} onChange={e=>setGoal(e.target.value)}
    placeholder="O que você quer alcançar com este projeto?"/></label>
   <label>Contexto e observações (opcional)<textarea rows={3} maxLength={2000} value={notes}
    onChange={e=>setNotes(e.target.value)} placeholder="Regras, informações úteis, próximos passos"/></label>
   <button type="button" disabled={!user||busy||title.trim().length<2||goal.trim().length<2}
    onClick={()=>void save()}>{editingId?'Salvar alterações':'Criar projeto'}</button>
   {editingId&&<button type="button" disabled={busy} onClick={clear}>Cancelar edição</button>}
  </div>
  {projects.length===0?<p>Nenhum projeto cadastrado. Seus registros antigos continuam disponíveis sem projeto.</p>:
   <ul className="lab-workspace-list">
    {projects.map(project=><li key={project.id}>
     <strong>{project.title} · {statusLabel[project.status]}</strong>
     <p>{project.goal}</p>
     {project.notes&&<small>{project.notes}</small>}
     <small>{project.recordCount} registros · {project.tasksOpen} tarefas abertas · {project.studyMinutes} min estudados
      {' · Saldo registrado: '}{project.financeBalance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</small>
     {project.status!=='archived'&&<button type="button" disabled={busy}
      onClick={()=>onSelect(project.id)}>
      {selectedId===project.id?'Projeto selecionado':'Usar projeto nos próximos registros'}
     </button>}
     <button type="button" disabled={busy} onClick={()=>edit(project)}>Editar</button>
     {project.status==='active'&&<button type="button" disabled={busy}
      onClick={()=>void changeStatus(project,'paused')}>Pausar</button>}
     {project.status==='paused'&&<button type="button" disabled={busy}
      onClick={()=>void changeStatus(project,'active')}>Retomar</button>}
     {project.status!=='archived'&&<button type="button" disabled={busy}
      onClick={()=>void changeStatus(project,'archived')}>Arquivar (preserva dados)</button>}
     {project.status==='archived'&&<button type="button" disabled={busy}
      onClick={()=>void changeStatus(project,'active')}>Reativar</button>}
    </li>)}
   </ul>}
  <button type="button" disabled={busy} onClick={()=>onSelect('')}>Mostrar todos os registros / sem projeto</button>
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" className="lab-error">{error}</p>}
  <small>Você também pode solicitar projetos pelo chat. Antes de salvar, o SIGMA apresenta uma proposta para sua revisão e confirmação.</small>
 </section>;
}
