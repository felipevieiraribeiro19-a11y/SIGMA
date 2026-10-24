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

test('orb is a detailed vector hologram, without text in its center',()=>{
 assert.match(hud,/import \{SigmaOrb\} from '.\/SigmaOrb'/);
 assert.match(hud,/<SigmaOrb\/>/);
 assert.match(orb,/<svg className="sigma-orb-v2-svg"/);
 assert.match(orb,/meshEdges\.map/);
 assert.match(orb,/radialLines\.map/);
 assert.match(orb,/sigma-v2-sphere-clip/);
 assert.match(orb,/sigma-v2-glow/);
 assert.doesNotMatch(orb,/<text[ >]/);
 assert.match(orbCss,/prefers-reduced-motion:reduce/);
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
