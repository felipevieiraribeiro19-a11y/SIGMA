import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const hud=readFileSync('src/SigmaHud.tsx','utf8');
const app=readFileSync('src/jarvis-lab.tsx','utf8');
const css=readFileSync('src/sigma-hud.css','utf8');
const orb=readFileSync('src/SigmaOrb.tsx','utf8');
const orbCss=readFileSync('src/sigma-orb.css','utf8');
const gpu=readFileSync('src/sigma-orb-webgl.ts','utf8');

test('Beta uses Jarvis HUD without changing the LAB entrypoint',()=>{
 assert.match(app,/if\(beta\)return <SigmaHud/);
 assert.match(app,/return <div className="jarvis-lab">/);
 assert.match(hud,/src\/jarvis-chat-protocol|validLabApiBase/);
});

test('orb uses native animated WebGL and no pasted image or Saturn belt',()=>{
 assert.match(hud,/import \{SigmaOrb\} from '.\/SigmaOrb'/);
 assert.match(hud,/<SigmaOrb\/>/);
 assert.match(orb,/mountSigmaOrb/);
 assert.match(orb,/<canvas/);
 assert.match(gpu,/getContext\('webgl'/);
 assert.match(gpu,/gl\.drawArrays/);
 assert.match(gpu,/u_time/);
 assert.match(gpu,/Deliberately hollow/);
 assert.match(gpu,/float shell=smoothstep/);
 assert.doesNotMatch(gpu,/float threads|float nodes|float diamond=star\(/);
 assert.match(gpu,/Clean luminous perimeter only/);
 assert.doesNotMatch(gpu,/float hud|float spokes|float compass|float sparkles|star\(|ellipse\(/);
 assert.match(gpu,/requestAnimationFrame/);
 assert.match(gpu,/prefers-reduced-motion/);
 assert.match(orbCss,/sigma-webgl-hover/);
 assert.doesNotMatch(orb,/\.webp|\.png|\.jpe?g|<img/);
 assert.doesNotMatch(gpu,/\.webp|\.png|\.jpe?g|sampler2D|texture2D/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('standalone orb preview compiles without replacing SIGMA Beta',()=>{
 const output=execFileSync('npm',['run','build:orb-preview'],{
  encoding:'utf8',timeout:120000,env:{...process.env,VITE_SIGMA_BETA:'false'}
 });
 assert.match(output,/built in/);
 const html=readFileSync('dist-orb-preview/index.html','utf8');
 assert.match(html,/SIGMA/);
 assert.doesNotMatch(html,/firebaseapp\.com|sigma-jarvis-cerebro-lab/);
});

test('dashboard requests real authenticated metrics and never hardcodes sample numbers',()=>{
 assert.match(hud,/user\.getIdToken\(\)/);
 assert.match(hud,/\/api\/lab\/workspace\/briefing/);
 assert.match(hud,/\/api\/lab\/workspace\/projects/);
 assert.match(hud,/Sem dados carregados/);
 assert.doesNotMatch(hud,/R\$ 4\.800|R\$ 299|2h 30min|12 resolvidas|3\/6 concluídas/);
});

test('Beta Vite bundle compiles with the real HUD entrypoint',()=>{
 const output=execFileSync('npm',['run','build:beta'],{
  encoding:'utf8',timeout:120000,
  env:{...process.env,VITE_SIGMA_BETA:'true',VITE_JARVIS_LAB_API:'https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev'}
 });
 assert.match(output,/built in/);
 const html=readFileSync('dist-sigma-beta/index.html','utf8');
 assert.match(html,/SIGMA/);
});
