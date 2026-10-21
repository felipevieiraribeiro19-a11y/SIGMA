import test from 'node:test';
import assert from 'node:assert/strict';
import {trimHistory,MAX_MESSAGES,MAX_TOTAL_CHARS} from '../src/history';

const user=(text:string)=>({role:'user' as const,text});
const assistant=(text:string)=>({role:'assistant' as const,text});

test('mantém a conversa curta intacta e na ordem',()=>{
 const conversation=[user('Estudei AFO por 40 min'),assistant('Registrado'),user('E agora?')];
 assert.deepEqual(trimHistory(conversation),conversation);
});

test('limita a quantidade de mensagens enviadas',()=>{
 const many=Array.from({length:40},(_,i)=>i%2===0?user(`relato ${i}`):assistant(`resposta ${i}`));
 const kept=trimHistory(many);
 assert.ok(kept.length<=MAX_MESSAGES);
 assert.equal(kept.at(-1)?.text,'resposta 39');
});

test('uma resposta longa não estoura o contexto da mensagem seguinte',()=>{
 // Cenário real: resposta no limite do Worker, seguida de novo relato.
 const conversation=[user('Explique a reforma tributária em detalhe'),assistant('x'.repeat(15000)),user('Agora me dê questões')];
 const kept=trimHistory(conversation);
 const total=kept.reduce((sum,m)=>sum+m.text.length,0);
 assert.ok(total<=MAX_TOTAL_CHARS,`total ${total} excedeu o limite`);
 assert.equal(kept.at(-1)?.text,'Agora me dê questões');
 assert.equal(kept[0]?.role,'user');
});

test('descarta as mensagens mais antigas até caber no orçamento',()=>{
 const conversation=[user('a'.repeat(4000)),assistant('b'.repeat(16000)),user('c'.repeat(4000)),assistant('d'.repeat(16000)),user('pergunta final')];
 const kept=trimHistory(conversation);
 assert.ok(kept.reduce((sum,m)=>sum+m.text.length,0)<=MAX_TOTAL_CHARS);
 assert.equal(kept.at(-1)?.text,'pergunta final');
});

test('histórico recuperado começa com pergunta do usuário',()=>{
 const kept=trimHistory([assistant('resposta órfã'),user('relato'),assistant('resposta')]);
 assert.equal(kept[0]?.role,'user');
 assert.deepEqual(kept.map(m=>m.text),['relato','resposta']);
});

test('não altera a lista original',()=>{
 const original=[user('a'),assistant('b')];
 trimHistory(original);
 assert.equal(original.length,2);
});
