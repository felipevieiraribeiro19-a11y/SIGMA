export const categories=['Perfil e preferências','Memórias importantes','Diário','Trabalho','Academia','Projetos','Documentos'];
export const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dateOf(x){if(x.date)return x.date;const d=x.createdAt?.toDate?.()??(x.createdAt?.seconds?new Date(x.createdAt.seconds*1000):null);return d?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';}
export function money(s){s=String(s).trim();if(!/^(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/.test(s))return null;const n=Number(s.includes(',')||/^\d{1,3}(\.\d{3})+$/.test(s)?s.replaceAll('.','').replace(',','.'):s);return Number.isFinite(n)&&n>0&&n<=1e8?Math.round(n*100)/100:null;}
export function propose(text,date=today()){
 const output=[]; const isQuestion=/\?|^\s*(quanto|qual|como|compare|analise|mostre|resuma)/i.test(text);
 if(!isQuestion){
 const matches=[...text.matchAll(/\b(ganhei|recebi|faturei|gastei|paguei|abasteci)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi)];
 for(const m of matches){if(/^[\d.,]/.test(text.slice(m.index+m[0].length)))continue;const amount=money(m[2]);if(amount)output.push({kind:'transactions',type:/ganhei|recebi|faturei/i.test(m[1])?'income':'expense',amount,category:/combust|abasteci|gasolina|etanol/i.test(text.slice(m.index,matches[matches.indexOf(m)+1]?.index??text.length))?'Combustível':/uber/i.test(text.slice(m.index,matches[matches.indexOf(m)+1]?.index??text.length))?'Uber':'Outros',description:text,date});}
 const duration=text.match(/estudei\s+(\d+(?:[.,]\d+)?|uma|duas|três|quatro)\s*(horas?|h\b|minutos?|min\b)/i);
 if(duration){const numbers={uma:1,duas:2,'três':3,quatro:4};const n=numbers[duration[1].toLowerCase()]??Number(duration[1].replace(',','.'));const minutes=Math.round(n*(/^h/i.test(duration[2])?60:1));const score=text.match(/acertei\s+(\d+)\s*(?:de|\/)\s*(\d+)/i);const correct=score?Number(score[1]):0,total=score?Number(score[2]):0;
 if(minutes>0&&minutes<=1440&&correct<=total)output.push({kind:'studies',subject:text.match(/(?:horas?|h\b|minutos?|min\b)\s+de\s+(.+?)(?:,|\s+e\s+|$)/i)?.[1]||'Revisar matéria',topic:'',minutes,correct,total,difficulty:'média',reviewDate:'',original:text,date});}
 }
 return output;
}
export function finance(rows,from='',to='',category=''){
 const filtered=rows.filter(x=>!x.deletedAt&&dateOf(x)&&(!from||dateOf(x)>=from)&&(!to||dateOf(x)<=to)&&(!category||x.category===category));
 const cents=type=>filtered.filter(x=>x.type===type&&Number.isFinite(Number(x.amount))).reduce((s,x)=>s+Math.round(Number(x.amount)*100),0);
 const income=cents('income')/100,expenses=cents('expense')/100;
 const groups=Object.create(null);for(const x of filtered)if(x.type==='expense'&&Number.isFinite(Number(x.amount)))groups[x.category||'Outros']=(groups[x.category||'Outros']||0)+Number(x.amount);
 return {rows:filtered,income,expenses,net:Math.round((income-expenses)*100)/100,groups};
}
export function retrieve(text,records,max=6){const words=text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').match(/[a-z0-9]{3,}/g)||[];return records.filter(x=>!x.deletedAt).map(x=>{const body=[x.text,x.original,x.description,x.subject,x.category,x.title].filter(Boolean).join(' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();return {x,score:words.reduce((n,w)=>n+Number(body.includes(w)),0)+(x.category==='Perfil e preferências'?1:0)};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,max).map(({x})=>({date:dateOf(x),category:x.category||x.kind,text:String(x.text||x.original||x.description||x.subject||x.title||'').slice(0,700)}));}
export async function fingerprint(value){const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;const s=JSON.stringify(canonical(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function csv(rows){const columns=['date','type','amount','category','description'];const cell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[columns.join(';'),...rows.map(r=>columns.map(k=>cell(k==='date'?dateOf(r):r[k])).join(';'))].join('\r\n');}
export function validateRecord(kind,x){if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Registro inválido');if(typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||new Date(x.date+'T12:00:00Z').toISOString().slice(0,10)!==x.date)throw Error('Data inválida');if(JSON.stringify(x).length>16000)throw Error('Registro muito grande');if(kind==='transactions'&&(!['income','expense'].includes(x.type)||!Number.isFinite(x.amount)||x.amount<=0||x.amount>1e8))throw Error('Valor inválido');if(kind==='studies'&&(!Number.isInteger(x.minutes)||x.minutes<=0||x.minutes>1440||!Number.isInteger(x.total)||!Number.isInteger(x.correct)||x.correct<0||x.total<x.correct))throw Error('Estudo inválido');if(!['transactions','studies','diary','memories','tasks','messages'].includes(kind))throw Error('Seção inválida');
 const lengths={title:200,category:200,description:6000,subject:200,topic:200,original:6000,text:kind==='messages'?12000:6000};
 for(const [key,max] of Object.entries(lengths))if(key in x&&(typeof x[key]!=='string'||x[key].length>max))throw Error('Campo inválido: '+key);
 if(kind==='studies'&&(!x.subject?.trim()||x.total>10000||!['fácil','média','difícil'].includes(x.difficulty)))throw Error('Informe matéria e desempenho válidos');
 if(kind==='studies'&&x.reviewDate&&!validDate(x.reviewDate))throw Error('Data de revisão inválida');
 if(['memories','diary'].includes(kind)&&!x.text?.trim())throw Error('Informe o texto');
 if(kind==='tasks'&&(!x.title?.trim()||!['pending','done'].includes(x.status)))throw Error('Tarefa inválida');
 if(kind==='messages'&&(!['user','assistant'].includes(x.role)||!x.text?.trim()))throw Error('Mensagem inválida');
 return true;}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export function studySummary(rows){const groups=Object.create(null);for(const x of rows.filter(x=>!x.deletedAt)){const k=x.subject||'Sem matéria';const g=groups[k]??={minutes:0,correct:0,total:0};g.minutes+=Number(x.minutes)||0;g.correct+=Number(x.correct)||0;g.total+=Number(x.total)||0;}return Object.entries(groups).map(([subject,g])=>({subject,...g,accuracy:g.total?100*g.correct/g.total:null}));}
export function ics(task){const esc=s=>String(s).replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;').replaceAll('\r','');return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//S.I.G.M.A.//Agenda//PT-BR','BEGIN:VEVENT','UID:'+esc(task.id)+'@jarbas','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+task.date.replaceAll('-',''),'SUMMARY:'+esc(task.title),'DESCRIPTION:'+esc(task.text||''),'END:VEVENT','END:VCALENDAR'].join('\r\n');}
export function answerFinance(text,rows,complete,now=today()){
 if(!/quanto.*(lucr|ganh|gast|receb)|compare.*gast|saldo|faturamento/i.test(text))return null;
 if(!complete)return 'Os lançamentos ainda estão parcialmente carregados. Em Finanças, use Carregar mais até concluir antes de calcular totais.';
 if(/compare.*gast/i.test(text)){const start=now.slice(0,7)+'-01',d=new Date(start+'T12:00:00Z');d.setUTCDate(0);const end=d.toISOString().slice(0,10),previous=finance(rows,end.slice(0,7)+'-01',end),current=finance(rows,start,now);return `Despesas do mês atual até ${now}: ${brl(current.expenses)}. Mês anterior completo: ${brl(previous.expenses)}. Diferença: ${brl(current.expenses-previous.expenses)}. Períodos com durações diferentes; não é uma projeção.`;}
 let from=now.slice(0,7)+'-01';if(/semana/i.test(text)){const d=new Date(now+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));from=d.toISOString().slice(0,10);}if(/hoje/i.test(text))from=now;
 const r=finance(rows,from,now);return `Período ${from} a ${now}: receitas ${brl(r.income)}, despesas ${brl(r.expenses)}, resultado líquido registrado ${brl(r.net)}. Esse resultado é lucro estimado apenas se todos os custos estiverem registrados. Não representa seu saldo bancário.`;
}

export async function legacyFingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
