/** Read-only npm audit JSON -> Markdown, without installing or changing packages. */
import {readFileSync,writeFileSync} from 'node:fs';

export function makeAuditReport(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Relatório npm inválido.');
 const vulnerabilities=raw.vulnerabilities;
 if(!vulnerabilities||typeof vulnerabilities!=='object'||Array.isArray(vulnerabilities))
  throw Error('Resposta de npm audit não contém vulnerabilidades; verificar se auditoria rodou.');
 const records=Object.entries(vulnerabilities).map(([name,value])=>{
  const v=value||{};
  const advisory=Array.isArray(v.via)?v.via.filter(x=>x&&typeof x==='object'):[];
  const names=advisory.map(x=>typeof x.title==='string'?x.title:'Advisory').slice(0,3);
  const ranges=advisory.map(x=>typeof x.range==='string'?x.range:'').filter(Boolean).slice(0,2);
  return {name,severity:v.severity||'unknown',isDirect:v.isDirect===true,
   via:names,range:ranges,fix:typeof v.fixAvailable==='object'?'may require upgrade':
    v.fixAvailable===true?'possible':'not indicated'};
 }).sort((a,b)=>a.name.localeCompare(b.name));
 const count=raw.metadata?.vulnerabilities||{};
 const summary=['critical','high','moderate','low','info']
  .map(x=>x+': '+(Number.isInteger(count[x])?count[x]:0)).join(', ');
 const lines=[
  '# SIGMA — auditoria de dependências (informativa, sem reparo automático)',
  '',
  'Gerado pelo npm audit no GitHub Actions. **Nenhuma dependência foi alterada.**',
  '',
  '**Resumo informado pelo npm:** '+summary,
  '',
  '| Pacote | Gravidade | Direto? | Alertas resumidos | Correção sugerida pelo npm |',
  '|---|---|---|---|---|',
  ...records.map(x=>'| '+[x.name,x.severity,x.isDirect?'sim':'não',
   x.via.join('; ')||x.range.join('; ')||'dependência afetada',x.fix]
   .map(v=>String(v).replace(/\|/g,'/').replace(/[\r\n]/g,' ').slice(0,240)).join(' | ')+' |'),
  '',
  '## Próximos passos',
  '',
  '- Revisar impacto de cada advisory nas rotas do SIGMA e distinguir dependências de build de dependências runtime.',
  '- Preferir atualização compatível, uma por vez, com testes do Worker e da interface.',
  '- Não usar npm audit fix --force automaticamente; não publicar até reavaliar alertas aplicáveis.',
  ''
 ];
 return lines.join('\n');
}

if(process.argv[1]?.endsWith('/sigma-npm-audit-report.mjs')){
 const path=process.argv[2],target=process.argv[3];
 if(!path||!target)throw Error('Uso: node scripts/sigma-npm-audit-report.mjs audit.json report.md');
 const report=makeAuditReport(JSON.parse(readFileSync(path,'utf8')));
 writeFileSync(target,report,'utf8');
 console.log('SIGMA_AUDIT_REPORT_READY '+target);
}
