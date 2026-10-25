import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const vite=readFileSync('vite.beta.config.ts','utf8');
const html=readFileSync('public/sigma-orb.html','utf8');
const js=readFileSync('public/sigma-orb.js','utf8');
const hosting=JSON.parse(readFileSync('firebase.beta.json','utf8'));
const csp=hosting.hosting.headers.flatMap((entry:{headers:{key:string;value:string}[]})=>entry.headers)
 .find((header:{key:string})=>header.key==='Content-Security-Policy')?.value||'';

test('Beta build explicitly ships the two same-origin animated orb assets',()=>{
 assert.match(vite,/publicDir:false/);
 assert.match(vite,/copyFileSync\(src,dst\)/);
 assert.match(vite,/\['sigma-orb\.html','sigma-orb\.js'\]/);
 assert.match(html,/id="sigmaCanvas"/);
 assert.match(html,/<script src="\/sigma-orb\.js" defer><\/script>/);
 assert.doesNotMatch(html,/<script>\s*\(function/);
 assert.match(js,/window\.SigmaOrb\s*=/);
 assert.match(js,/sigma:tap/);
});

test('Firebase CSP permits same-origin frame and JS without allowing unsafe inline scripts',()=>{
 assert.match(csp,/frame-src 'self'/);
 assert.match(csp,/script-src 'self'/);
 assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
});

// Regression guard: never ship an empty iframe in the production Beta.
