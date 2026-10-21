/**
 * Read-only, never-persistent action preview boundary.
 * Uses real Firebase-authenticated Worker context but must be feature-flagged OFF
 * in normal deployments until UI and privacy tests pass.
 *
 * No approval is issued, no OAuth token is accepted, and no action is executed.
 */
import {previewAction,type ActionPreview} from './action-flow';
import type {CapabilityConfig} from './capabilities';

export type PreviewRequest={utterance:string;params:unknown};
export type PreviewResult={preview:ActionPreview;authorizedForExecution:false;persisted:false};

export function parsePreviewPayload(payload:unknown):PreviewRequest{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Prévia inválida.');
 const data=payload as Record<string,unknown>;
 const keys=Object.keys(data);
 if(keys.length!==2||!keys.includes('utterance')||!keys.includes('params'))
  throw Error('Formato da prévia inválido.');
 if(typeof data.utterance!=='string'||!data.utterance.trim()||data.utterance.length>500)
  throw Error('Pedido de prévia inválido.');
 if(!data.params||typeof data.params!=='object'||Array.isArray(data.params))
  throw Error('Dados da prévia inválidos.');
 return {utterance:data.utterance,params:data.params};
}

export function buildReadOnlyActionPreview(
 payload:unknown,config:CapabilityConfig,now:number
):PreviewResult{
 const parsed=parsePreviewPayload(payload);
 return {preview:previewAction({utterance:parsed.utterance,params:parsed.params,config,now}),
  authorizedForExecution:false,persisted:false};
}

/** Guard against request bodies that try to exhaust memory before parsing. */
export async function readLimitedPreviewJson(request:Request,maxBytes=4500):Promise<unknown>{
 const reader=request.body?.getReader();
 if(!reader)throw Error('Corpo da prévia ausente.');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes){await reader.cancel();throw Error('Prévia muito grande.');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const data=new Uint8Array(bytes);let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(data));}
 catch{throw Error('JSON de prévia inválido.');}
}
