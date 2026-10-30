/** Stateless suggestions only: a text fragment NEVER creates stored memory. */
import type {LabMemoryKind} from '../lab-memory';
export type LearningProposal={text:string;kind:LabMemoryKind;reason:string;requiresApproval:true};
const PII=/\b(?:senha|password|token|api[ _-]?key|chave privada|cartão de crédito|cpf|cvc|cvv|segredo)\b/i;

/**
 * Reconhecedores conservadores, cada um com o tipo que declara.
 * Ordem importa: correção antes de preferência, porque "na verdade eu prefiro..."
 * é uma correção do que o SIGMA fez, não uma preferência nova.
 * Podem ser substituídos por um modelo produzindo propostas estruturadas.
 */
const PATTERNS:{kind:LabMemoryKind;pattern:RegExp}[]=[
 {kind:'correcao',pattern:/^(?:n[aã]o[,! ]+)?(?:na verdade|corrigindo|me corrija)[:,; -]*(.{6,450})[.!?]*$/i},
 {kind:'correcao',pattern:/^n[aã]o (?:é|era|foi) (?:assim|isso)[:,; -]*(.{6,450})[.!?]*$/i},
 {kind:'correcao',pattern:/^(?:corrija|corrige|anote a corre[cç][aã]o)[:,; -]*(.{6,450})[.!?]*$/i},
 {kind:'correcao',pattern:/^(?:pare de|n[aã]o fa[cç]a|evite) (.{6,450})[.!?]*$/i},
 {kind:'rotina',pattern:/^(?:todos os dias|todo dia|toda (?:semana|manh[ãa]|tarde|noite)|de manh[ãa]|de tarde|de noite)[:,; -]*(.{6,450})[.!?]*$/i},
 {kind:'preferencia',pattern:/^eu (?:prefiro|gosto de|costumo) (.{6,450})[.!?]*$/i},
 {kind:'preferencia',pattern:/^(?:prefiro|gosto de|costumo) (.{6,450})[.!?]*$/i},
 {kind:'fato',pattern:/^lembre(?:-se)? (?:de )?que[:;, -]*(.{6,500})[.!?]*$/i},
 {kind:'fato',pattern:/^guarde (?:na memória )?que[:;, -]*(.{6,500})[.!?]*$/i},
 {kind:'fato',pattern:/^meu (?:objetivo|projeto|plano|hábito|compromisso) (?:é|se chama|consiste em)[:;, -]*(.{6,450})[.!?]*$/i}
];

export function proposeContinuousLearning(message:unknown):LearningProposal|null{
 if(typeof message!=='string'||message.length>4000||PII.test(message))return null;
 const clean=message.trim().replace(/\s+/g,' ');
 if(clean.length<12)return null;
 for(const {kind,pattern} of PATTERNS){
  const match=pattern.exec(clean);
  if(!match)continue;
  const text=match[1].trim().replace(/[.!?]+$/,'');
  if(text.length<6)return null;
  return {text:clean.slice(0,500),kind,
   reason:'O SIGMA identificou uma possível informação útil. Revise antes de guardar.',
   requiresApproval:true};
 }
 return null;
}
