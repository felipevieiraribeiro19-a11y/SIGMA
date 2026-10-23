/** Stateless suggestions only: a text fragment NEVER creates stored memory. */
export type LearningProposal={text:string;reason:string;requiresApproval:true};
const PII=/\b(?:senha|password|token|api[ _-]?key|chave privada|cartão de crédito|cpf|cvc|cvv|segredo)\b/i;
export function proposeContinuousLearning(message:unknown):LearningProposal|null{
 if(typeof message!=='string'||message.length>4000||PII.test(message))return null;
 const clean=message.trim().replace(/\s+/g,' ');
 if(clean.length<12)return null;
 // Conservative recognizers; can later be replaced with a model producing structured proposals.
 const patterns=[
  /^lembre(?:-se)? (?:de )?que[:;, -]*(.{6,500})[.!?]*$/i,
  /^guarde (?:na memória )?que[:;, -]*(.{6,500})[.!?]*$/i,
  /^meu (?:objetivo|projeto|plano|hábito|compromisso) (?:é|se chama|consiste em)[:;, -]*(.{6,450})[.!?]*$/i,
  /^eu (?:prefiro|gosto de|costumo) (.{6,450})[.!?]*$/i
 ];
 for(const pattern of patterns){
  const match=pattern.exec(clean);
  if(!match)continue;
  const text=match[1].trim().replace(/[.!?]+$/,'');
  if(text.length<6)return null;
  return {text:clean.slice(0,500),reason:'O SIGMA identificou uma possível informação útil. Revise antes de guardar.',requiresApproval:true};
 }
 return null;
}
