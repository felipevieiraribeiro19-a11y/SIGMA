import type {Message} from '../validation';
import type {WebSource} from '../web-search';

export type AfoMeaning='finance'|'orthosis'|'ambiguous'|null;
const finance=/(?:orcament|financ|concurso|edital|lrf\b|\bppa\b|\bldo\b|\bloa\b|fiscal|contabil|contas publicas|gestao publica|setor publico|administracao publica)/;
const orthosis=/(?:ortese|orthosis|orthotic|ankle|tornozelo|fisioterap|reabilit|marcha|pe e tornozelo|foot brace|mobilidade)/;
const multiple=/(?:significados|significa.*(?:tambem|varios)|diferentes sentidos|duas (?:interpretacoes|acepcoes)|ambos os sentidos|compare os sentidos)/;

export function normalized(text:string):string{
 return text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
/**
 * AFO has several meanings; use only explicit local dialogue context.
 * No preloaded private profile and no source text are treated as user intent.
 */
export function resolveAfoMeaning(messages:Message[]):AfoMeaning{
 const last=messages.at(-1);
 if(!last||!/\bafo\b/i.test(last.text))return null;
 const fresh=normalized(last.text);
 const f=finance.test(fresh),o=orthosis.test(fresh);
 if(f&&o)return 'ambiguous';
 if(f)return 'finance';
 if(o)return 'orthosis';
 // Only immediately preceding user message, never an earlier assistant answer:
 // assistant text might list all meanings and contaminate the inference.
 const preceding=[...messages.slice(0,-1)].reverse().find(m=>m.role==='user');
 if(preceding){
  const prev=normalized(preceding.text);
  if(finance.test(prev)&&!orthosis.test(prev))return 'finance';
  if(orthosis.test(prev)&&!finance.test(prev))return 'orthosis';
 }
 return 'ambiguous';
}

export function clarifyAfo(messages:Message[]):string|null{
 if(resolveAfoMeaning(messages)!=='ambiguous')return null;
 const latest=normalized(messages.at(-1)?.text||'');
 if(multiple.test(latest))return null;
 return 'A sigla AFO pode indicar Administração Financeira e Orçamentária (gestão pública/concursos) ou órtese de tornozelo e pé (saúde). Qual dos dois assuntos você quer explorar?';
}

export function focusedAfoQuery(query:string,meaning:AfoMeaning):string{
 if(meaning==='finance')return (query+' Administração Financeira e Orçamentária concursos públicos').slice(0,350);
 if(meaning==='orthosis')return (query+' órtese tornozelo pé fisioterapia').slice(0,350);
 return query;
}

/** Filter obviously wrong-domain AFO search snippets before presenting them to the model. */
export function relevantAfoSources(sources:WebSource[],meaning:AfoMeaning):WebSource[]{
 if(meaning!=='finance'&&meaning!=='orthosis')return sources;
 return sources.filter(src=>{
  const text=normalized(src.title+' '+src.excerpt);
  const f=finance.test(text),o=orthosis.test(text);
  return meaning==='finance'?f&&!o:o&&!f;
 });
}
