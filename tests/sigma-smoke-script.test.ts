import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const run = promisify(execFile);
const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'smoke-lab.mjs');
const ORIGIN = 'https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';

/** Worker falso: imita as respostas reais que o smoke test precisa interpretar. */
function fakeWorker(scenario: 'full' | 'no-vault' | 'chat-disabled' = 'full') {
 return createServer((req, res) => {
  const send = (status: number, body: unknown) => {
   res.writeHead(status, { 'Content-Type': 'application/json' });
   res.end(JSON.stringify(body));
  };
  const origin = req.headers.origin;
  const auth = String(req.headers.authorization || '');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (origin !== ORIGIN) return send(403, { error: 'Origem não autorizada.' });
  if (!req.url?.startsWith('/api/lab/')) return send(404, { error: 'Endpoint não encontrado.' });
  // O Worker real valida a rota antes de autenticar: rota desconhecida é 404 sem token.
  const known = ['/api/lab/chat', '/api/lab/oauth/status', '/api/lab/integrations/calendar'];
  if (!known.includes(req.url)) return send(404, { error: 'Endpoint não encontrado.' });
  if (!auth.startsWith('Bearer ') || auth === 'Bearer invalido') {
   return send(401, { error: 'Faça login com Google no laboratório.' });
  }
  if (req.url === '/api/lab/oauth/status') {
   if (scenario === 'no-vault') return send(503, { error: 'OAuth desativado.' });
   return send(200, { connections: {
    calendar: { connected: true, connectedAt: '2026-10-30T00:00:00.000Z', scopes: 'calendar.events.readonly' },
    drive_metadata: { connected: false },
    drive_content: { connected: false }
   } });
  }
  if (req.url === '/api/lab/integrations/calendar') {
   return send(200, { provider: 'calendar', items: [{ id: 'a', title: 'Compromisso fictício' }], readonly: true });
  }
  if (req.url === '/api/lab/chat') {
   if (scenario === 'chat-disabled') return send(503, { error: 'Conversa real ainda desativada no laboratório.' });
   return send(200, { text: 'Resposta fictícia do laboratório.', persisted: false, executed: false,
    provider: 'deepseek', toolProposalsDisabled: true, memory: { consulted: true, count: 2 } });
  }
  return send(404, { error: 'Rota inexistente.' });
 });
}

async function withServer<T>(scenario: 'full' | 'no-vault' | 'chat-disabled', fn: (url: string) => Promise<T>) {
 const server = fakeWorker(scenario);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
 const address = server.address();
 const url = `http://127.0.0.1:${(address as { port: number }).port}`;
 try { return await fn(url); } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function smoke(url: string, extra: string[] = []) {
 try {
  const { stdout } = await run(process.execPath, [script, '--url', url, ...extra], { timeout: 30000 });
  return { code: 0, stdout };
 } catch (error: any) {
  return { code: error.code ?? 1, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') };
 }
}

test('sem token, verifica apenas as barreiras e passa', async () => {
 await withServer('full', async url => {
  const result = await smoke(url, ['--json']);
  assert.equal(result.code, 0, result.stdout + (result.stderr || ''));
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  const names = body.checks.map((c: any) => c.name);
  assert.ok(names.includes('origem não autorizada é recusada'));
  assert.ok(names.includes('preflight CORS responde 204'));
  assert.ok(names.includes('chamada sem token é recusada'));
  assert.ok(names.includes('rota desconhecida responde 404'));
  assert.equal(body.summary, null, 'sem token não há resumo de chat');
 });
});

test('com token válido, cofre e chat aparecem no resumo', async () => {
 await withServer('full', async url => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
  const file = join(dir, 'token.txt');
  writeFileSync(file, 'token-ficticio-de-teste\n');
  const result = await smoke(url, ['--json', '--token-file', file]);
  assert.equal(result.code, 0, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(body.summary.provider, 'deepseek');
  assert.equal(body.summary.toolsDisabled, true);
  assert.equal(body.summary.usedMemory, 2);
  const names = body.checks.map((c: any) => c.name);
  assert.ok(names.includes('cofre OAuth responde'));
  assert.ok(names.includes('integração calendar (via cofre, sem token de sessão)'));
 });
});

test('token que o Worker recusa derruba o teste com saída 1', async () => {
 await withServer('full', async url => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
  const file = join(dir, 'token.txt');
  writeFileSync(file, 'invalido');
  const result = await smoke(url, ['--json', '--token-file', file]);
  assert.equal(result.code, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.checks.some((c: any) => c.name === 'chat' && c.ok === false));
 });
});

test('cofre desligado é reportado como falha, sem quebrar o resto', async () => {
 await withServer('no-vault', async url => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
  const file = join(dir, 'token.txt');
  writeFileSync(file, 'token-ficticio');
  const result = await smoke(url, ['--json', '--token-file', file]);
  const body = JSON.parse(result.stdout);
  const vault = body.checks.find((c: any) => c.name === 'cofre OAuth');
  assert.equal(vault.ok, false);
  assert.match(vault.detail, /503/);
  assert.ok(body.checks.some((c: any) => c.name === 'chat responde' && c.ok === true),
   'chat deve continuar sendo verificado');
 });
});

test('o token nunca aparece na saída', async () => {
 await withServer('full', async url => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
  const file = join(dir, 'token.txt');
  const secret = 'TOKEN-SUPER-SECRETO-1234567890';
  writeFileSync(file, secret);
  for (const extra of [[], ['--json']]) {
   const result = await smoke(url, [...extra, '--token-file', file]);
   assert.ok(!result.stdout.includes(secret), 'token não pode vazar na saída');
  }
 });
});

test('recusa URL sem https fora do localhost', async () => {
 const result = await smoke('http://exemplo-remoto.invalid');
 assert.equal(result.code, 2);
 assert.match(String(result.stderr), /https/);
});

test('sem --url, deduz o endereço do wrangler.chat-lab.toml', async () => {
 // Sem rede alcançável: o que importa é que a URL foi deduzida e o erro é limpo.
 const result = await smoke('', ['--json']);
 assert.equal(result.code, 2);
 assert.match(String(result.stderr ?? ''), /workers\.dev|não foi possível conectar/);
});

test('falha de rede não gera stack trace', async () => {
 const result = await smoke('http://127.0.0.1:1');
 assert.equal(result.code, 2);
 assert.match(String(result.stderr), /não foi possível conectar/);
 assert.ok(!/at .*\.mjs:\d+/.test(String(result.stderr)), 'sem stack trace cru');
});
