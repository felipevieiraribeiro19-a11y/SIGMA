import {findCapability,type CapabilityConfig} from './capabilities';

/** Checagem de acesso independente do modelo de IA. Não executa operações. */
export type OperationRequest={capabilityId:string;ownerAuthenticated:boolean;oauthGranted:boolean;confirmed:boolean};
export type OperationDecision={allowed:boolean;reason:'ok'|'not-authenticated'|'not-implemented'|'not-configured'|'needs-oauth'|'requires-confirmation'|'unknown-capability'};

export function authorizeOperation(request:OperationRequest,config:CapabilityConfig):OperationDecision{
 if(!request.ownerAuthenticated)return {allowed:false,reason:'not-authenticated'};
 const capability=findCapability(request.capabilityId,config);
 if(!capability)return {allowed:false,reason:'unknown-capability'};
 if(capability.status==='planned')return {allowed:false,reason:'not-implemented'};
 if(capability.status==='not-configured')return {allowed:false,reason:'not-configured'};
 if(capability.access==='user-google-oauth'&&!request.oauthGranted)return {allowed:false,reason:'needs-oauth'};
 if(capability.risk!=='read'&&!request.confirmed)return {allowed:false,reason:'requires-confirmation'};
 // Ações com efeitos colaterais não são habilitadas enquanto os executores auditáveis não existirem.
 if(capability.risk!=='read')return {allowed:false,reason:'not-implemented'};
 return {allowed:true,reason:'ok'};
}
