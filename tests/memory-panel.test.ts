import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryCenter} from '../src/MemoryCenter';
import {initialDemoMemory,transitionDemoMemory,DEMO_ORIGINAL,DEMO_CORRECTED} from '../src/memory-demo';

test('painel de memória é declarado como prévia e só contém dados fictícios',()=>{
 const markup=renderToStaticMarkup(createElement(MemoryCenter));
 assert.match(markup,/Prévia isolada/);
 assert.match(markup,/fictício/);
 assert.match(markup,/nada é salvo/);
 assert.match(markup,/Simular aprovação/);
 assert.doesNotMatch(markup,/Cadastrar nova memória pessoal/);
});

test('demonstração começa sem gravação e requer aprovação simulada',()=>{
 const original=initialDemoMemory();
 assert.equal(original.status,'pending');
 assert.equal(original.revision,0);
 assert.equal(original.content,DEMO_ORIGINAL);
 assert.strictEqual(transitionDemoMemory(original,'correct'),original);
 assert.strictEqual(transitionDemoMemory(original,'delete'),original);
 const saved=transitionDemoMemory(original,'approve');
 assert.equal(saved.status,'saved');
 assert.equal(saved.revision,1);
});

test('revisão e exclusão simuladas são reversíveis apenas reiniciando a prévia',()=>{
 let state=transitionDemoMemory(initialDemoMemory(),'approve');
 state=transitionDemoMemory(state,'correct');
 assert.equal(state.content,DEMO_CORRECTED);
 assert.equal(state.revision,2);
 const deleted=transitionDemoMemory(state,'delete');
 assert.equal(deleted.status,'deleted');
 assert.equal(deleted.content,'');
 assert.strictEqual(transitionDemoMemory(deleted,'approve'),deleted);
 assert.deepEqual(transitionDemoMemory(deleted,'reset'),initialDemoMemory());
});

test('nenhum mecanismo do painel persiste ou transmite dados',()=>{
 const panel=readFileSync('src/MemoryCenter.tsx','utf8');
 const demo=readFileSync('src/memory-demo.ts','utf8');
 const sources=panel+'\n'+demo;
 assert.doesNotMatch(sources,/\b(?:fetch|XMLHttpRequest|indexedDB|localStorage|sessionStorage)\s*(?:\(|\.|\[)/);
 assert.doesNotMatch(sources,/firebase\/|getFirestore|sendChat|loadHistory/);
 assert.doesNotMatch(sources,/window\.location/);
});

test('regras candidatas NÃO estão incluídas em firebase.json nem no arquivo de produção',()=>{
 const config=JSON.parse(readFileSync('firebase.json','utf8')) as {firestore?:{rules?:string}};
 assert.equal(config.firestore?.rules,'firestore.rules');
 const active=readFileSync('firestore.rules','utf8');
 assert.doesNotMatch(active,/match\s+\/users\/\{uid\}\/personalMemories/);
 const candidate=readFileSync('firestore.memory.rules.candidate','utf8');
 assert.match(candidate,/DO NOT DEPLOY/);
 assert.match(candidate,/match\s+\/users\/\{uid\}\/personalMemories/);
 assert.match(candidate,/allow delete: if false/);
 assert.match(candidate,/allow create, update, delete: if false/);
 assert.match(candidate,/isOwner\(uid\)/);
});
