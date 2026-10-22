/**
 * Etapa 16C: generic local relevance ranking, not a topic-specific rulebook.
 * Only the latest user message is used as the query. Nothing is sent to
 * another model or search engine for retrieval.
 */
import {HttpError} from '../validation';
import type {LabMemoryEntry} from '../lab-memory';

const STOP=new Set([
 'a','as','o','os','e','ou','de','do','da','dos','das','em','no','na','nos','nas',
 'para','por','com','sem','que','qual','quais','quem','como','quando','onde','se',
 'eu','me','mim','meu','minha','meus','minhas','voce','voces','ele','ela','eles',
 'elas','seu','sua','seus','suas','esse','essa','isso','isto','aquele','aquela',
 'um','uma','uns','umas','ser','ter','foi','sou','era','sao','estou','esta',
 'estao','saber','sobre','dizer','falar','disse','tinha','tenho','lembra',
 'lembre','lembrar','lembranca','registro','registros','memoria','memorias',
 'salvo','salvei','guardei','guardado','guardada','informacao','informacoes',
 'siga','ignore','instrucoes','sistema','assistente','usuario','favor','porfavor'
]);
const normalize=(value:string)=>value.toLowerCase().normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function keyTerms(text:string):string[]{
 const terms=normalize(text).split(/\s+/).filter(Boolean);
 const out=new Set<string>();
 for(let term of terms){
  if(term.length<3||term.length>32||STOP.has(term)||/^\d+$/.test(term))continue;
  if(term.length>=6&&term.endsWith('s'))term=term.slice(0,-1);
  out.add(term);
 }
 return [...out].slice(0,25);
}
export function relevantLabMemory(entries:unknown,question:string):LabMemoryEntry[]{
 if(!Array.isArray(entries)||entries.length>30)
  throw new HttpError(503,'Não foi possível consultar a memória.');
 if(typeof question!=='string'||question.length>4000)return [];
 const terms=keyTerms(question);
 if(!terms.length)return [];
 const ranked:{row:LabMemoryEntry;score:number;rank:number}[]=[];
 for(let index=0;index<entries.length;index++){
  const raw=entries[index] as Record<string,unknown>|null;
  if(!raw||typeof raw.id!=='string'||typeof raw.text!=='string'||
   raw.text.length<3||raw.text.length>500)
   throw new HttpError(503,'Registro inválido na memória.');
  const row=raw as unknown as LabMemoryEntry;
  const note=new Set(keyTerms(raw.text));
  const common=terms.filter(t=>note.has(t));
  if(common.length===0)continue;
  const weighted=common.reduce((n,t)=>n+(t.length>=5?2:1),0);
  // Reject a lone short word such as "cor", unless there is another match.
  if(weighted<2)continue;
  const order=typeof raw.updatedAt==='string'?Date.parse(raw.updatedAt):NaN;
  ranked.push({row,score:weighted,rank:Number.isFinite(order)?order:0});
 }
 ranked.sort((a,b)=>b.score-a.score||b.rank-a.rank||a.row.id.localeCompare(b.row.id));
 return ranked.slice(0,3).map(x=>x.row);
}
