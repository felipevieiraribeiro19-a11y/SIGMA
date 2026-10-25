// Pesquisa sob demanda: nenhum conteúdo da web é tratado como instrução confiável.
export type WebSource={title:string;url:string;excerpt:string;publishedDate?:string};
export type SearchIntent={needed:boolean;explicit:boolean};

export function searchIntent(message:string):SearchIntent{
 const text=message.toLocaleLowerCase('pt-BR').trim();
 const explicit=/(?:\bpesquis(?:e|a|ar|ando|ou)\b|\bprocure\b|\bbusque\b|\bbuscar\b|\bconsulte\b|\bpesquisa na (?:web|internet)\b|\bna internet\b|\bno google\b(?!\s+(?:tarefas|tasks|drive|agenda|calendar)\b)|\bsite oficial\b|\bfontes? (?:oficiais|atuais)\b|\bmostr(?:e|ar|ando)\s+(?:as\s+)?fontes?\b|\bcite\s+(?:as\s+)?fontes?\b|\bcom\s+(?:as\s+)?fontes?\b|\be\s+as\s+fontes?\b)/u.test(text);
 // "Estudei hoje" e outros registros pessoais não devem acionar consultas na web.
 const current=/(?:\bnot[ií]cias?\b|\bnovidades?\b|\b[uú]ltimas? (?:novidades|not[ií]cias|mudan[cç]as|atualiza[cç][oõ]es)\b|\bmais recentes?\b|\b(?:n?esta semana)\b|\bagora\b|\batualmente\b|\batualizado\b|\bem vigor\b|\bquando (?:sai|abre|ser[aá])\b)/u.test(text);
 const subject=/(?:\bconcursos?\b|\bedita(?:l|is)\b|\bleis?\b|\blegisla[cç][aã]o\b|\bprovas?\b|\bpre[cç]os?\b|\bgoverno\b|\bprefeitura\b|\bdesemprego\b|\bmercado\b|\bnot[ií]cias?\b|\binternet\b)/u.test(text);
 const personal=/(?:\bestudei\b|\btrabalhei\b|\bgastei\b|\banote\b|\bregistre\b|\bmeu dia\b)/u.test(text);
 return {explicit,needed:explicit||(current&&subject&&!personal)};
}

export function webSearchQuery(userText:string):string{
 return userText.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email omitido]')
  .replace(/\b\d{11,}\b/g,'[numero omitido]')
  .replace(/\s+/g,' ').slice(0,350).trim();
}

export async function searchTavily(query:string,apiKey:string,transport:typeof fetch=fetch):Promise<WebSource[]>{
 const response=await transport('https://api.tavily.com/search',{
  method:'POST',
  headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
  body:JSON.stringify({query,search_depth:'basic',max_results:5,topic:'general',include_answer:false,include_raw_content:false,include_images:false,auto_parameters:false}),
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error(`Pesquisa Tavily indisponível (HTTP ${response.status}).`);
 const data=await response.json() as {results?:Array<{title?:unknown;url?:unknown;content?:unknown;published_date?:unknown}>};
 if(!Array.isArray(data.results))throw new Error('A Tavily retornou dados inválidos.');
 const unique=new Set<string>();
 const results:WebSource[]=[];
 for(const item of data.results){
  if(typeof item.url!=='string'||typeof item.title!=='string'||typeof item.content!=='string')continue;
  let url:URL;try{url=new URL(item.url)}catch{continue}
  if(url.protocol!=='https:'||url.username||url.password||url.toString().length>1500||unique.has(url.toString()))continue;
  unique.add(url.toString());
  results.push({title:item.title.replace(/[\r\n<>]/g,' ').slice(0,130),url:url.toString(),excerpt:item.content.replace(/[\x00-\x1f]/g,' ').slice(0,850),...(typeof item.published_date==='string'?{publishedDate:item.published_date.slice(0,40)}:{})});
  if(results.length>=4)break;
 }
 return results;
}
