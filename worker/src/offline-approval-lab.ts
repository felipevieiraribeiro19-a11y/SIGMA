/**
 * OFFLINE laboratory only. DO NOT reference from worker/wrangler.toml.
 * This worker uses a separate Durable Object, a local-only wrangler config,
 * fictional identities and a fixed fictional calendar operation.
 * It never calls Google, Firestore, Gemini or external APIs.
 */
import {AuditedDurableApprovalStore} from './core/audited-approval';
import {OfflineDurableExecutionJournal,OfflineDurableMockProvider} from './core/offline-mock-store';
import {simulateProviderExecution,reconcileMockExecution} from './core/mock-executor';
import type {ApprovalReceipt} from './core/approval-ledger';
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


type MockScenario='success'|'reject'|'ack-lost'|'outage';
function scenarioFor(id:string):MockScenario{
 if(id.startsWith('test_mock_ok'))return 'success';
 if(id.startsWith('test_mock_reject'))return 'reject';
 if(id.startsWith('test_mock_acklost'))return 'ack-lost';
 if(id.startsWith('test_mock_outage'))return 'outage';
 throw Error('ID fora dos exemplos fictícios de execução.');
}
async function consumedReceipt(store:AuditedDurableApprovalStore,actor:Actor,id:string):Promise<ApprovalReceipt>{
 const [item,audit]=await Promise.all([store.read(actor,id),store.audit(actor,id)]);
 if(!item||item.state!=='consumed'||!audit)throw Error('Autorização ainda não consumida.');
 const event=audit.events.findLast(e=>e.kind==='simulation-consumed');
 if(!event)throw Error('Recibo de consumo indisponível.');
 return {id:item.id,actorUid:actor,capabilityId:item.capabilityId,
  target:item.target,change:item.change,digest:item.digest,consumedAt:event.at};
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
   if(action==='mock-status'&&request.method==='GET'){
    const id=requestId(url.searchParams.get('id'));
    scenarioFor(id);
    const journal=new OfflineDurableExecutionJournal(this.state.storage,actor);
    const provider=new OfflineDurableMockProvider(this.state.storage,scenarioFor(id),actor);
    const recorded=await journal.get(actor,id);
    return response({state:recorded?.state||null,executed:false,
     mockProviderCalls:await provider.callCount('sigma-mock:v1:'+actor+':'+id)});
   }
   if(request.method!=='POST'||!['issue','approve','cancel','consume','mock-execute','mock-reconcile'].includes(action))
    return response({error:'Operação indisponível.'},404);
   const data=await parseBody(request),now=Date.now();
   if(action==='mock-execute'||action==='mock-reconcile'){
    const scenario=scenarioFor(data.id);
    const journal=new OfflineDurableExecutionJournal(this.state.storage,actor);
    const provider=new OfflineDurableMockProvider(this.state.storage,scenario,actor);
    const item=await store.read(actor,data.id);
    if(!item)throw Error('Proposta fictícia não encontrada.');
    if(action==='mock-execute'&&item.state==='approved'){
     const consumed=await simulateActionReview(store,{
      authenticatedUid:actor,proposalId:data.id,
      capabilityId:item.capabilityId,now
     });
     const outcome=await simulateProviderExecution(consumed.receipt,journal,provider);
     return response({state:outcome.state,executed:false,provider:'fictional'});
    }
    // A consumed approval cannot be replayed: only status or reconciliation.
    const receipt=await consumedReceipt(store,actor,data.id);
    if(action==='mock-execute'){
     const outcome=await journal.get(actor,data.id);
     return response({state:outcome?.state||'untracked-consumed',
      executed:false,provider:'fictional'});
    }
    const outcome=await reconcileMockExecution(receipt,journal,provider);
    return response({state:outcome.state,executed:false,provider:'fictional'});
   }
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
