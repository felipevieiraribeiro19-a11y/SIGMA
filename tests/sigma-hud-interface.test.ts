import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const hud=readFileSync('src/SigmaHud.tsx','utf8');
const app=readFileSync('src/jarvis-lab.tsx','utf8');
const css=readFileSync('src/sigma-hud.css','utf8');

test('Beta uses Jarvis HUD without changing the LAB entrypoint',()=>{
 assert.match(app,/if\(beta\)return <SigmaHud/);
 assert.match(app,/return <div className="jarvis-lab">/);
 assert.match(hud,/src\/jarvis-chat-protocol|validLabApiBase/);
});

test('orb is visual and has no SIGMA lettering in its center',()=>{
 const orb=hud.split('function Orb()')[1].split('function Panel(')[0];
 assert.ok(orb.includes('sigma-orb-core'));
 assert.ok(!orb.includes('>SIGMA<'));
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
