import type {Message} from './services';

// Limites espelhados do Worker (worker/src/validation.ts). O Worker recusa mais de
// 15 mensagens, recusa contexto acima de 24.000 caracteres e pode devolver resposta
// de até 16.000. A interface antiga cortava apenas por quantidade, então depois de
// uma resposta longa o contexto estourava e a mensagem seguinte era recusada com
// "O contexto ultrapassou o limite" — a conversa travava sem explicação.
export const MAX_MESSAGES=15;
export const MAX_TOTAL_CHARS=24000;

/** Mantém as mensagens mais recentes dentro do orçamento e garante que o
 *  histórico comece com uma mensagem do usuário, como o Worker exige. */
export function trimHistory(messages:Message[],maxMessages=MAX_MESSAGES,maxChars=MAX_TOTAL_CHARS):Message[]{
 const kept=messages.slice(-Math.max(1,maxMessages)).map(m=>({role:m.role,text:m.text}));
 let total=kept.reduce((sum,m)=>sum+m.text.length,0);
 while(kept.length>1&&total>maxChars){const removed=kept.shift();if(!removed)break;total-=removed.text.length}
 while(kept.length>1&&kept[0].role!=='user')kept.shift();
 return kept;
}
