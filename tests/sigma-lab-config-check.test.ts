import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const run = promisify(execFile);
const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-lab-config.mjs');
const WORKER = 'https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev';
const ORIGIN = 'https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';

const TOML = `name = "sigma-jarvis-cerebro-lab"
main = "src/chat-lab.ts"
ALLOWED_ORIGIN = "${ORIGIN}"
GOOGLE_OAUTH_ENABLED = "false"
`;
const CSP = (connect: string) => JSON.stringify({
 hosting: { headers: [{ source: '**', headers: [
  { key: 'Content-Security-Policy', value: `default-src 'none'; connect-src 'self' ${connect}` }
 ] }] }
});

type Fixture = {
 toml?: string;
 env?: string;
 labJson?: string;
 betaJson?: string;
 smoke?: string;
};

function workspace(files: Fixture = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'labcfg-'));
 mkdirSync(join(dir, 'worker'), { recursive: true });
 mkdirSync(join(dir, 'scripts'), { recursive: true });
 writeFileSync(join(dir, 'worker', 'wrangler.chat-lab.toml'), files.toml ?? TOML);
 writeFileSync(join(dir, '.env.lab'), files.env ?? `VITE_JARVIS_LAB_API=${WORKER}\n`);
 writeFileSync(join(dir, 'firebase.lab.json'), files.labJson ?? CSP(WORKER));
 writeFileSync(join(dir, 'firebase.beta.json'), files.betaJson ?? CSP(WORKER));
 writeFileSync(join(dir, 'scripts', 'smoke-lab.mjs'),
  files.smoke ?? `const out={url:'',origin:'${ORIGIN}'};\n`);
 return dir;
}

async function check(dir: string) {
 const target = join(dir, 'scripts', 'check-lab-config.mjs');
 const { readFileSync } = await import('node:fs');
 writeFileSync(target, readFileSync(script, 'utf8'));
 try {
  const { stdout } = await run(process.execPath, [target, '--json'], { cwd: dir });
  return { code: 0, report: JSON.parse(stdout) };
 } catch (error: any) {
  return { code: error.code ?? 1, report: JSON.parse(String(error.stdout)) };
 }
}

test('configuração coerente não produz erro', async () => {
 const dir = workspace();
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 0);
  assert.deepEqual(report.problems, []);
  assert.equal(report.ok, true);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CSP sem o Worker bloqueia o deploy', async () => {
 const dir = workspace({ labJson: CSP('https://exemplo.com') });
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 1);
  assert.ok(report.problems.some((p: string) => /connect-src/.test(p)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('frontend apontando para outro Worker bloqueia', async () => {
 const dir = workspace({ env: 'VITE_JARVIS_LAB_API=https://outro-worker.workers.dev\n' });
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 1);
  assert.ok(report.problems.some((p: string) => /VITE_JARVIS_LAB_API/.test(p)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('.env.lab ausente é erro, não aviso', async () => {
 const dir = workspace({ env: '# vazio\n' });
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 1);
  assert.ok(report.problems.some((p: string) => /\.env\.lab/.test(p)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ALLOWED_ORIGIN com caminho é recusado', async () => {
 const dir = workspace({ toml: TOML.replace(ORIGIN, ORIGIN + '/app') });
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 1);
  assert.ok(report.problems.some((p: string) => /sem caminho/.test(p)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('provedor desconhecido no toml é recusado', async () => {
 const dir = workspace({ toml: TOML + 'LAB_PROVIDER = "modelo-inventado"\n' });
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 1);
  assert.ok(report.problems.some((p: string) => /provedor conhecido/.test(p)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('canal de preview gera aviso de expiração, não erro', async () => {
 const dir = workspace();
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 0);
  assert.ok(report.warnings.some((w: string) => /expirem|expira/.test(w)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('origem do teste de fumaça divergente é erro', async () => {
 const dir = workspace({ smoke: "const out={url:'',origin:'https://outra-origem.web.app'};\n" });
 try {
  const { code, report } = await check(dir);
  assert.equal(code, 1);
  assert.ok(report.problems.some((p: string) => /teste de fumaça/.test(p)));
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
