import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LabFormattedText,labMarkdownLine} from '../src/jarvis-lab-markdown';

test('o chat renderiza títulos, negrito e listas sem exibir símbolos Markdown',()=>{
 const input='### Concursos em Curitiba\n\n* **Banca:** a confirmar [1]\n* **Inscrição:** consulte o edital [1]\n\n1. Verificar site oficial\n2. Conferir datas';
 const html=renderToStaticMarkup(createElement(LabFormattedText,{text:input}));
 assert.match(html,/lab-markdown-heading/);
 assert.match(html,/<strong>Banca:<\/strong>/);
 assert.match(html,/<ul>/);
 assert.match(html,/<ol>/);
 assert.doesNotMatch(html,/\*\*Banca:\*\*/);
 assert.match(html,/consulte o edital/);
});
test('conteúdo externo é texto inofensivo: não injeta HTML nem links executáveis',()=>{
 const content='**Aviso**\n\n<script>alert("x")</script>\n\n* [site](javascript:alert(1))';
 const html=renderToStaticMarkup(createElement(LabFormattedText,{text:content}));
 assert.doesNotMatch(html,/<script>/i);
 assert.doesNotMatch(html,/href\s*=/i);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/<strong>Aviso<\/strong>/);
});
test('listas aceitam marcador simples sem remover marcadores no meio da frase',()=>{
 assert.deepEqual(labMarkdownLine('  * **Concurso**'),{kind:'bullet',body:'**Concurso**'});
 assert.deepEqual(labMarkdownLine(' - **Resultado**'),{kind:'bullet',body:'**Resultado**'});
 assert.deepEqual(labMarkdownLine(' 2. Confirmar as fontes'),{kind:'number',body:'Confirmar as fontes'});
 assert.deepEqual(labMarkdownLine('**Enunciado**'),{kind:'text',body:'**Enunciado**'});
});
