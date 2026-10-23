import type {LabChatMessage} from './jarvis-chat-protocol';
export type SharedMemoryChoice={id:string;text:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Browser choices are display-only: backend reads owner data again by UID. */
export function readMemoryChoices(result:unknown):SharedMemoryChoice[]{
 const rows=(result as {entries?:unknown}|null)?.entries;
 if(!Array.isArray(rows)||rows.length>30)throw Error('Lista de memórias inválida.');
 return rows.map(entry=>{
  const obj=entry as Record<string,unknown>|null;
  if(!obj||typeof obj.id!=='string'||!UUID.test(obj.id)||
   typeof obj.text!=='string'||obj.text.length<3||obj.text.length>500)
   throw Error('Registro de memória inválido.');
  return {id:obj.id,text:obj.text};
 });
}
/** Never bundle memory text into chat body, only explicitly checked IDs. */
export function approvedChatRequest(messages:LabChatMessage[],ids:string[],auto=false,connectors:string[]=[],useLibrary=false,useProjects=false){
 if(ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!UUID.test(id)))
  throw Error('Selecione no máximo três memórias diferentes.');
 if(auto&&ids.length)throw Error('Escolha seleção manual ou busca contextual, não ambas.');
 const unique=new Set(connectors);
 if(unique.size!==connectors.length||connectors.length>3||
  connectors.some(x=>!['calendar','drive','notion'].includes(x)))
  throw Error('Integrações selecionadas inválidas.');
 const memory=auto?{memoryMode:'relevant' as const}:
  ids.length?{memoryIds:ids.slice()}:{};
 if(typeof useLibrary!=='boolean')throw Error('Biblioteca inválida.');
 if(typeof useProjects!=='boolean')throw Error('Autorização de projetos inválida.');
 const base={messages,...memory,...(useLibrary?{useLibrary:true}:{}),...(useProjects?{useProjects:true}:{})};
 return connectors.length?{...base,connectors:connectors.slice()}:base;
}
