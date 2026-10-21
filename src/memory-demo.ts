/**
 * Demonstration state ONLY. Not connected to user memory, Firestore, network,
 * localStorage, sessionStorage, model messages or source documents.
 * This file must never be used as a production repository.
 */
export type DemoMemoryStatus='pending'|'saved'|'deleted';
export type DemoMemoryState={
  status:DemoMemoryStatus;
  content:string;
  originalContent:string;
  revision:number;
  sourceLabel:string;
};
export type DemoMemoryAction='approve'|'correct'|'delete'|'reset';

export const DEMO_ORIGINAL='Exemplo fictício: prefiro lembretes curtos.';
export const DEMO_CORRECTED='Exemplo fictício: prefiro lembretes com horário.';
export const DEMO_SOURCE='Exemplo artificial para demonstrar o funcionamento da memória.';

export function initialDemoMemory():DemoMemoryState{
 return {status:'pending',content:DEMO_ORIGINAL,originalContent:DEMO_ORIGINAL,revision:0,sourceLabel:DEMO_SOURCE};
}
export function transitionDemoMemory(state:DemoMemoryState,action:DemoMemoryAction):DemoMemoryState{
 if(action==='reset')return initialDemoMemory();
 if(action==='approve'&&state.status==='pending')
  return {...state,status:'saved',revision:1};
 if(action==='correct'&&state.status==='saved'&&state.content!==DEMO_CORRECTED)
  return {...state,content:DEMO_CORRECTED,revision:state.revision+1};
 if(action==='delete'&&state.status==='saved')
  return {...state,status:'deleted',content:''};
 return state;
}
