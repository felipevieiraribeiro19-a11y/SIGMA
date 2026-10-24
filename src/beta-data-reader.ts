import {buildBetaInventory,type BetaInventory,type MainBetaSnapshot,type LabBetaSnapshot} from './beta-data-inventory';

/**
 * Read-only authenticated bridge for the future Beta UI.
 * The same Firebase ID token is sent to each existing backend; neither
 * credentials nor returned personal data are persisted by this adapter.
 * Both Workers must explicitly allow the Beta origin before it is enabled.
 */
export type BetaReadOptions={
 uid:string;
 idToken:string;
 mainApiBase:string;
 labApiBase:string;
 signal?:AbortSignal;
 transport?:typeof fetch;
};
function apiBase(value:string):string{
 const parsed=new URL(value);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||
    parsed.pathname!=='/'||parsed.search||parsed.hash||
    !parsed.hostname.endsWith('.workers.dev'))
  throw Error('Origem de API Beta não autorizada.');
 return parsed.origin;
}
async function readJson(base:string,path:string,token:string,transport:typeof fetch,signal?:AbortSignal):Promise<unknown>{
 const response=await transport(base+path,{
  method:'GET',cache:'no-store',signal,
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}
 });
 if(!response.ok)throw Error('Uma fonte do SIGMA não respondeu à consulta autenticada.');
 const data:unknown=await response.json();
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw Error('Uma fonte retornou dados inválidos.');
 return data;
}
function rows(data:unknown,key:string):unknown[]{
 const value=(data as Record<string,unknown>)[key];
 if(!Array.isArray(value))throw Error('Uma fonte retornou dados incompletos.');
 return value;
}
export async function readBetaInventory(options:BetaReadOptions):Promise<BetaInventory>{
 const {uid,idToken,signal,transport=fetch}=options;
 if(typeof uid!=='string'||uid.length<4||typeof idToken!=='string'||idToken.length<20)
  throw Error('Autenticação Beta inválida.');
 const main=apiBase(options.mainApiBase),lab=apiBase(options.labApiBase);
 if(main===lab)throw Error('Fontes principal e LAB devem permanecer distintas.');
 const [history,memory,workspace,projects]=await Promise.all([
  readJson(main,'/api/history',idToken,transport,signal),
  readJson(lab,'/api/lab/memory',idToken,transport,signal),
  readJson(lab,'/api/lab/workspace',idToken,transport,signal),
  readJson(lab,'/api/lab/workspace/projects',idToken,transport,signal)
 ]);
 const mainSnapshot:MainBetaSnapshot={uid,turns:rows(history,'turns') as MainBetaSnapshot['turns']};
 const labSnapshot:LabBetaSnapshot={
  uid,memories:rows(memory,'entries') as LabBetaSnapshot['memories'],
  entries:rows(workspace,'entries') as LabBetaSnapshot['entries'],
  projects:rows(projects,'projects') as LabBetaSnapshot['projects']
 };
 return buildBetaInventory(mainSnapshot,labSnapshot);
}
