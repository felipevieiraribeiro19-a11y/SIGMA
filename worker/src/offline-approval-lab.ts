/**
 * OFFLINE laboratory only. DO NOT reference from worker/wrangler.toml.
 * This worker uses a separate Durable Object, a local-only wrangler config,
 * fictional identities and a fixed fictional calendar operation.
 * It never calls Google, Firestore, Gemini or external APIs.
 */
import {AuditedDurableApprovalStore} from './core/audited-approval';
import {
 stageActionReview,acceptActionReview,rejectActionReview,simulateActionReview,previewAction
} from './core/action-flow';

interface LabEnv {
 APPROVAL_LAB:DurableObjectNamespace;
 LAB_MARKER:string;
}
type Actor='fictional_owner'|'fictional_other';
const parseActor=(url:URL):Actor=>url.searchParams.get('actor')==='fictional_other'?'fictional_other':'fictional_owner';
const response=(value:unknown,status=200):Response=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const exampleParams={
 kind:'calendar.create' as const,calendarId:'primary',title:'Evento fictício do laboratório SIGMA',
 startsAt:'2035-05-20T14:00:00-03:00',endsAt:'2035-05-20T15:00:00-03:00'
};
function requestId(value:unknown):string{
 if(typeof value!=='string'||!/^test_[A-Za-z0-9_-]{5,65}$/.test(value))
  throw new Error('Somente IDs artificiais são permitidos.');
 return value;
}
async function parseBody(request:Request):Promise<{id:string;digest?:string}>{
 if(Number(request.headers.get('Content-Length'))>800)throw Error('Pedido grande demais.');
 const raw=await request.text();
 if(raw.length>800)throw Error('Pedido grande demais.');
 let value:unknown;
 try{value=JSON.parse(raw)}catch{throw Error('JSON inválido.')}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Formato inválido.');
 const data=value as Record<string,unknown>;
 if(!Object.keys(data).every(k=>k==='id'||k==='digest'))throw Error('Parâmetro inesperado.');
 const id=requestId(data.id);
 if(data.digest!==undefined&&
  (typeof data.digest!=='string'||!/^[a-f0-9]{64}$/.test(data.digest)))
  throw Error('Fingerprint inválida.');
 return {id,digest:data.digest as string|undefined};
}

export class OfflineApprovalLab{
 constructor(private readonly state:DurableObjectState){}
 async fetch(request:Request):Promise<Response>{
  try{
   const url=new URL(request.url),actor=parseActor(url);
   const store=new AuditedDurableApprovalStore(this.state.storage,actor);
   const action=url.pathname.replace(/^\/offline-lab\//,'');
   if(action==='health'&&request.method==='GET')
    return response({mode:'offline-lab',actionsEnabled:false,externalProviders:false});
   if(action==='audit'&&request.method==='GET'){
    const id=requestId(url.searchParams.get('id'));
    const audit=await store.audit(actor,id);
    return response({audit,executed:false});
   }
   if(request.method!=='POST'||!['issue','approve','cancel','consume'].includes(action))
    return response({error:'Operação indisponível.'},404);
   const data=await parseBody(request),now=Date.now();
   if(action==='issue'){
    const preview=previewAction({
     utterance:'Agende um evento no calendário',
     config:{googleConnected:false,searchConfigured:false},
     params:exampleParams,now
    });
    const item=await stageActionReview(store,{
     preview,authenticatedUid:actor,proposalId:data.id,now
    });
    return response({state:item.state,digest:item.digest,expiresAt:item.expiresAt,
     capabilityId:item.capabilityId,executed:false});
   }
   if(action==='approve'){
    if(!data.digest)throw Error('Revisão exata obrigatória.');
    const confirmed=await acceptActionReview(store,{
     authenticatedUid:actor,proposalId:data.id,displayedDigest:data.digest,now
    });
    return response({state:confirmed.item.state,executed:false});
   }
   if(action==='cancel'){
    const cancelled=await rejectActionReview(store,{
     authenticatedUid:actor,proposalId:data.id,now
    });
    return response({cancelled,executed:false});
   }
   const consumed=await simulateActionReview(store,{
    authenticatedUid:actor,proposalId:data.id,
    capabilityId:'integration.calendar.write',now
   });
   return response({status:consumed.status,executed:false});
  }catch(error){
   return response({error:error instanceof Error?error.message.slice(0,140):'Erro controlado.',
    executed:false},409);
  }
 }
}

export default {
 async fetch(request:Request,env:LabEnv):Promise<Response>{
  // Marker is hardcoded in the local-only config, not a production secret.
  if(env.LAB_MARKER!=='fictional-test-runner'||request.headers.get('X-SIGMA-LAB')!=='offline-fixture')
   return response({error:'Laboratório não autorizado.'},403);
  const stub=env.APPROVAL_LAB.get(env.APPROVAL_LAB.idFromName('offline-test-instance'));
  return stub.fetch(request);
 }
};
