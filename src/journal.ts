// Núcleo determinístico do diário: valores só viram lançamentos após confirmação.
// Conversas continuam independentes dos registros estruturados.
export type JournalKind='expense'|'income'|'study';
export type JournalInput={kind:JournalKind;amountCents:number;minutes:number;category:string;note:string};
export type JournalRecord=JournalInput&{id:string;createdAt:string};

function moneyInCents(raw:string):number|null{
 const normalized=raw.replace(/\s/g,'');
 if(!/^\d[\d.,]*$/.test(normalized))return null;
 const comma=normalized.lastIndexOf(','),dot=normalized.lastIndexOf('.');
 let decimal:string,integer:string;
 if(comma>=0){integer=normalized.slice(0,comma).replace(/[.]/g,'');decimal=normalized.slice(comma+1);}
 else if(dot>=0&&normalized.length-dot-1<=2){integer=normalized.slice(0,dot).replace(/[.]/g,'');decimal=normalized.slice(dot+1);}
 else{integer=normalized.replace(/[.]/g,'');decimal='';}
 if(decimal.length>2||!integer||!/^\d+$/.test(integer)||!/^\d{0,2}$/.test(decimal))return null;
 const cents=Number(integer)*100+Number(decimal.padEnd(2,'0')||'0');
 return Number.isSafeInteger(cents)&&cents>0&&cents<=100_000_000?cents:null;
}
const moneyPattern=/(?:R\$\s*([\d.,]+)|\b([\d.,]+)\s*reais?\b)/gi;

export function suggestJournalEntry(message:string):JournalInput|null{
 const text=message.replace(/\s+/g,' ').trim();
 if(!text||text.length>300)return null;
 const spent=/\b(gastei|paguei|despesa|abasteci)\b/i.test(text);
 const earned=/\b(ganhei|recebi|faturei|rendi)\b/i.test(text);
 const study=/\b(estudei|estudando|sess[aã]o de estudo)\b/i.test(text);
 if(Number(spent)+Number(earned)+Number(study)!==1)return null;
 if(spent||earned){
  const matches=[...text.matchAll(moneyPattern)];
  if(matches.length!==1)return null;
  const amountCents=moneyInCents(matches[0][1]||matches[0][2]||'');
  if(amountCents===null)return null;
  return {kind:spent?'expense':'income',amountCents,minutes:0,category:/\b(uber|corrida|gasolina|combust[ií]vel|etanol|abasteci)\b/i.test(text)?(/uber|corrida/i.test(text)?'Uber':'Veículo'):'Geral',note:text};
 }
 const durations=[...text.matchAll(/\b(\d{1,3})\s*(minutos?|mins?|horas?|h)\b/gi)];
 if(durations.length!==1)return null;
 const number=Number(durations[0][1]),minutes=/^h|hora/i.test(durations[0][2])?number*60:number;
 if(!Number.isInteger(minutes)||minutes<1||minutes>720)return null;
 const subject=/\b(?:de|sobre)\s+(portugu[eê]s|contabilidade|economia|matem[aá]tica(?: financeira)?|direito(?: administrativo| constitucional| tribut[aá]rio)?|inform[aá]tica|afo|finan[cç]as p[uú]blicas)\b/i.exec(text);
 return {kind:'study',amountCents:0,minutes,category:subject?.[1]||'Estudos',note:text};
}
export function formatBRL(cents:number):string{
 return (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
export function journalSummary(records:JournalRecord[]){
 return records.reduce((acc,record)=>{
  if(record.kind==='income')acc.incomeCents+=record.amountCents;
  if(record.kind==='expense')acc.expenseCents+=record.amountCents;
  if(record.kind==='study')acc.studyMinutes+=record.minutes;
  return acc;
 },{incomeCents:0,expenseCents:0,studyMinutes:0});
}
