/** Preparação de ações: schema, confirmação e execução são responsabilidades separadas. */
import {authorizeOperation} from './authorization';
import type {CapabilityConfig,ToolRisk} from './capabilities';

export type ActionProposal={
 id:string;capabilityId:string;summary:string;target:string;
 intendedChange:string;actorUid:string;createdAt:string;
 risk:ToolRisk;status:'proposed';
};
export type ActionConfirmation={actionId:string;actorUid:string;approved:boolean;approvedAt:string};
export type ActionExecutionResult={actionId:string;status:'succeeded'|'failed'|'cancelled';providerReference?:string;message:string;executedAt:string};

export function planAction(input:{id:string;capabilityId:string;summary:string;target:string;intendedChange:string;actorUid:string;createdAt:string;risk:ToolRisk}):ActionProposal{
 for(const key of ['id','capabilityId','summary','target','intendedChange','actorUid','createdAt'] as const){
  if(!input[key]?.trim())throw new Error('Proposta incompleta: '+key);
 }
 if(input.risk==='read')throw new Error('Consultas de leitura não exigem plano de alteração.');
 return {...input,status:'proposed'};
}
/** Bloqueado por padrão: sem executor, confirmação não é autorização para agir. */
export function mayExecute(proposal:ActionProposal,confirmation:ActionConfirmation|undefined,config:CapabilityConfig){
 if(!confirmation||!confirmation.approved||confirmation.actionId!==proposal.id||confirmation.actorUid!==proposal.actorUid)return false;
 return authorizeOperation({
  capabilityId:proposal.capabilityId,ownerAuthenticated:true,oauthGranted:true,confirmed:true
 },config).allowed;
}
