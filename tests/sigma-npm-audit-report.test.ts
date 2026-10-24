import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAuditReport} from '../scripts/sigma-npm-audit-report.mjs';

test('auditoria lista dependência vulnerável sem modificar pacote ou sugerir --force',()=>{
 const fixture={metadata:{vulnerabilities:{high:1,critical:0,moderate:0,low:0,info:0}},
  vulnerabilities:{'example-lib':{severity:'high',isDirect:false,
   via:[{title:'Fictitious parsing issue',range:'<1.2.3'}],fixAvailable:{name:'example-lib',version:'2.0.0'}}}};
 const report=makeAuditReport(fixture);
 assert.match(report,/high: 1/);
 assert.match(report,/example-lib/);
 assert.match(report,/Fictitious parsing issue/);
 assert.match(report,/não usar npm audit fix --force automaticamente/i);
 assert.doesNotMatch(report,/api-key-secret-value/);
});

test('relatório vazio é permitido, mas ausência de auditoria válida não passa como ausência de falhas',()=>{
 const clean=makeAuditReport({vulnerabilities:{},metadata:{vulnerabilities:{high:0}}});
 assert.match(clean,/high: 0/);
 assert.throws(()=>makeAuditReport({error:'network error'}),/não contém vulnerabilidades/);
});
