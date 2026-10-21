import test from 'node:test';
import assert from 'node:assert/strict';
import {searchIntent,searchTavily,webSearchQuery} from '../worker/src/web-search';

test('pesquisas explícitas acionam a internet',()=>{
 assert.deepEqual(searchIntent('Pesquise os concursos fiscais abertos hoje'),{needed:true,explicit:true});
 assert.deepEqual(searchIntent('Consulte fontes oficiais da Prefeitura'),{needed:true,explicit:true});
});
test('notícias atuais acionam pesquisa sem comando explícito',()=>{
 assert.equal(searchIntent('Quais as últimas notícias sobre concursos?').needed,true);
 assert.equal(searchIntent('Qual o edital atualizado para a Prefeitura?').needed,true);
});
test('diário, finanças pessoais e estudo normal não consomem pesquisas',()=>{
 assert.equal(searchIntent('Hoje estudei Contabilidade e fiz 30 questões').needed,false);
 assert.equal(searchIntent('Quero controlar meus gastos e ganhos no Uber').needed,false);
 assert.equal(searchIntent('Explique a LRF').needed,false);
});
test('remove email e identificadores longos das consultas externas',()=>{
 const q=webSearchQuery('Pesquise abc@example.com e 1234567890123');
 assert.equal(q.includes('abc@example.com'),false);
 assert.equal(q.includes('1234567890123'),false);
});
test('Tavily retorna só fontes HTTPS e não expõe a chave no resultado',async()=>{
 let body:unknown;
 const fakeFetch=(async (_url:string,opts:RequestInit)=>{
  assert.equal(_url,'https://api.tavily.com/search');
  assert.equal((opts.headers as Record<string,string>).Authorization,'Bearer tvly-test');
  body=JSON.parse(String(opts.body));
  return new Response(JSON.stringify({results:[
   {title:'Edital oficial',url:'https://www.curitiba.pr.gov.br/edital',content:'Datas do edital em uma página oficial.'},
   {title:'Site inseguro',url:'http://unsafe.example/path',content:'ignorar'},
   {title:'Duplicado',url:'https://www.curitiba.pr.gov.br/edital',content:'duplicado'}
  ]}),{status:200});
 }) as typeof fetch;
 const sources=await searchTavily('edital curitiba','tvly-test',fakeFetch);
 assert.equal((body as {search_depth:string}).search_depth,'basic');
 assert.equal(sources.length,1);
 assert.equal(sources[0].title,'Edital oficial');
 assert.equal(JSON.stringify(sources).includes('tvly-test'),false);
});
test('Tavily falha fechada para dados malformados',async()=>{
 const fake=(async()=>new Response(JSON.stringify({results:123}),{status:200})) as typeof fetch;
 await assert.rejects(()=>searchTavily('qualquer busca','tvly-test',fake),/inválidos/);
});
