import {searchIntent,type SearchIntent} from '../web-search';
import {authorizeOperation} from './authorization';
import type {CapabilityConfig} from './capabilities';

export type ReadToolId='research.web'|'integration.calendar.read'|'integration.drive.list';
export type WriteToolId='integration.calendar.write'|'integration.drive.write';
export type ToolStep={id:ReadToolId;status:'ready'|'unavailable';reason:string};
export type AssistantPlan={
 mode:'conversation'|'read-tools'|'action-proposal';
 steps:ToolStep[];
 proposedAction?:{capabilityId:WriteToolId;status:'not-implemented';requiresConfirmation:true};
 search:SearchIntent;
 google:{calendar:boolean;drive:boolean};
};

// Planejamento conservador e barato. Não executa nem registra operações.
const calendar=/\b(agenda|calend[aá]rio|compromissos?|reuni[oõ]es?|eventos?|meus hor[aá]rios)\b/i;
const drive=/\b(google drive|meu drive|no drive|arquivos? (?:do|no|meus?|que tenho)|documentos? (?:do|no|meus?|que tenho)|pastas? (?:do|no|minhas?)|pdfs? (?:do|no|meus?|que tenho))\b/i;
const readRequest=/\b(me mostr[ea]|mostr[ea]|liste|listar|list[ea]|procure|procurar|encontre|encontrar|consult[ea]|consulte|verifique|confira|quais|qual|o que|quando|onde|tenho|veja|ver|pesquise|buscar|busque|meus|minhas|hoje|amanh[aã]|pr[oó]xim[oa]s?)\b/i;
const writeRequest=/\b(crie|criar|agend[ea]|agendar|marque|marcar|adicione|adicionar|inclua|incluir|altere|alterar|mude|mudar|renomeie|renomear|mova|mover|remova|remover|cancele|cancelar|apague|apagar|exclua|excluir)\b/i;

export function makeAssistantPlan(message:string,config:CapabilityConfig):AssistantPlan{
 const text=message.slice(0,3800).trim();
 const search=searchIntent(text);
 const hasCalendar=calendar.test(text);
 const hasDrive=drive.test(text);
 const writing=writeRequest.test(text);
 const reading=readRequest.test(text);
 const hasDirectCalendarQuestion=/\b(o que (?:eu )?tenho (?:para |pra )?(?:hoje|amanh[aã]|essa semana)|meus compromissos)\b/i.test(text);
 // Se a intenção é mudar dados externos, primeiro apresentar proposta;
 // nunca transformar um pedido de escrita em consulta automática.
 const proposedAction=writing&&(hasCalendar||hasDrive)?{
  capabilityId:(hasCalendar?'integration.calendar.write':'integration.drive.write') as WriteToolId,
  status:'not-implemented' as const,requiresConfirmation:true as const
 }:undefined;
 if(proposedAction)return {mode:'action-proposal',steps:[],proposedAction,search:{needed:false,explicit:false},google:{calendar:false,drive:false}};
 const calendarRequested=(hasCalendar&&reading)||hasDirectCalendarQuestion;
 const driveRequested=hasDrive&&reading;
 const steps:ToolStep[]=[];
 const add=(id:ReadToolId,desired:boolean)=>{
  if(!desired)return;
  const allowed=authorizeOperation({
   capabilityId:id,ownerAuthenticated:true,oauthGranted:config.googleConnected,confirmed:false
  },config);
  steps.push({id,status:allowed.allowed?'ready':'unavailable',reason:allowed.reason});
 };
 add('research.web',search.needed);
 add('integration.calendar.read',calendarRequested);
 add('integration.drive.list',driveRequested);
 return {
  mode:steps.length?'read-tools':'conversation',
  steps,search,google:{
   calendar:steps.some(t=>t.id==='integration.calendar.read'&&t.status==='ready'),
   drive:steps.some(t=>t.id==='integration.drive.list'&&t.status==='ready')
  }
 };
}
