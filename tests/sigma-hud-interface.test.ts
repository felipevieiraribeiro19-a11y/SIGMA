import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const hud=readFileSync('src/SigmaHud.tsx','utf8');
const app=readFileSync('src/jarvis-lab.tsx','utf8');
const css=readFileSync('src/sigma-hud.css','utf8');
const orb=readFileSync('src/SigmaOrb.tsx','utf8');
const orbCss=readFileSync('src/sigma-orb.css','utf8');

test('Beta uses Jarvis HUD without changing the LAB entrypoint',()=>{
 assert.match(app,/if\(beta\)return <SigmaHud/);
 assert.match(app,/return <div className="jarvis-lab">/);
 assert.match(hud,/src\/jarvis-chat-protocol|validLabApiBase/);
});

test('orb uses exact local reference crop, with moving connections and no Saturn ring',()=>{
 assert.match(hud,/import \{SigmaOrb\} from '.\/SigmaOrb'/);
 assert.match(hud,/<SigmaOrb\/>/);
 assert.match(orb,/import orbReference from '.\/assets\/sigma-orb-reference.webp'/);
 const image=readFileSync('src/assets/sigma-orb-reference.webp');
 assert.equal(image.toString('ascii',0,4),'RIFF');
 assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.ok(image.byteLength>2000);
 assert.match(orb,/sigma-orb-reference-image/);
 assert.match(orb,/sigma-orb-reference-neural/);
 assert.match(orb,/animateMotion/);
 assert.match(orb,/signalLinks\.map/);
 assert.match(orbCss,/sigma-orb-reference-float/);
 assert.match(orbCss,/sigma-orb-reference-network/);
 assert.match(orbCss,/sigma-orb-reference-flow/);
 assert.match(orbCss,/sigma-orb-reference-orbit/);
 assert.doesNotMatch(orb,/rx="174" ry="37"|Hairline equatorial orbital path/);
 assert.doesNotMatch(orb,/<text[ >]/);
 assert.match(orbCss,/prefers-reduced-motion:reduce/);
 assert.match(orbCss,/\.sigma-orb-reference-signals\{display:none\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
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
