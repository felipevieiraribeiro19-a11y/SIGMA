import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';

const run = promisify(execFile);
const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'smoke-prod.mjs');
const ORIGIN = 'https://sigma-61328.web.app';

type Scenario = 'healthy' | 'writes-enabled' | 'no-token';

/** Worker de produção falso, com o mesmo desenho de respostas do real. */
function fakeProd(scenario: Scenario = 'healthy') {
 const written: string[] = [];
 const server = createServer((req, res) => {
  const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
   res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
   res.end(JSON.stringify(body));
  };
  const origin = req.headers.origin;
  const auth = String(req.headers.authorization || '');
  if (!origin || origin !== ORIGIN) return send(403, { error: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') {
   res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
   res.end();
   return;
  }
  const known = ['/api/chat', '/api/history', '/api/agenda', '/api/capabilities'];
  // Ordem do Worker real: 404 (rota) -> 405 (método) -> autenticação.
  if (!known.includes(req.url || '')) return send(404, { error: 'Endpoint não encontrado.' });
  const expectsGet = ['/api/history', '/api/agenda', '/api/capabilities'].includes(req.url || '');
  if (req.method !== (expectsGet ? 'GET' : 'POST')) return send(405, { error: 'Método não permitido.' });
  if (!auth.startsWith('Bearer ') || scenario === 'no-token') return send(401, { error: 'Sessão inválida.' });
  if (req.url === '/api/capabilities') {
   return send(200, {
    capabilities: [
     { id: 'conversation.chat', status: 'available' },
     { id: 'memory.profile', status: 'planned' },
     { id: 'agency.actions', status: 'planned' }
    ],
    writesEnabled: scenario === 'writes-enabled'
   });
  }
  if (req.url === '/api/history') return send(200, { turns: [{ id: 'a' }, { id: 'b' }], limit: 100 });
  if (req.url === '/api/agenda') {
   if (!req.headers['x-google-token']) return send(400, { error: 'Conecte a Agenda e o Drive.' });
   return send(200, { agenda: [{ summary: 'Compromisso fictício', start: '2026-11-01' }], materiais: [], expired: false, errors: [] });
  }
  if (req.url === '/api/chat') {
   let body = '';
   req.on('data', chunk => { body += chunk; });
   req.on('end', () => {
    written.push(body);
    send(200, { text: 'Resposta fictícia de produção.', persisted: true, provider: 'gemini' });
   });
   return;
  }
  return send(404, { error: 'Endpoint não encontrado.' });
 });
 return { server, written };
}

async function withServer<T>(scenario: Scenario, fn: (url: string, written: string[]) => Promise<T>) {
 const { server, written } = fakeProd(scenario);
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
 const port = (server.address() as { port: number }).port;
 try { return await fn(`http://127.0.0.1:${port}`, written); }
 finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

function tokenFile(content: string) {
 const dir = mkdtempSync(join(tmpdir(), 'smokeprod-'));
 const file = join(dir, 'token.txt');
 writeFileSync(file, content);
 return file;
}

async function smoke(url: string, extra: string[] = []) {
 try {
  const { stdout } = await run(process.execPath, [script, '--url', url, ...extra], { timeout: 30000 });
  return { code: 0, stdout, stderr: '' };
 } catch (error: any) {
  return { code: error.code ?? 1, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') };
 }
}

test('sem token verifica as barreiras da produção', async () => {
 await withServer('healthy', async url => {
  const result = await smoke(url, ['--json']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  const names = body.checks.map((c: any) => c.name);
  for (const expected of ['origem não autorizada é recusada', 'preflight CORS responde 204',
   'chamada sem token é recusada', 'rota desconhecida responde 404', 'método errado responde 405']) {
   assert.ok(names.includes(expected), 'faltou: ' + expected);
  }
 });
});

test('o chat NÃO é chamado por padrão: nada é gravado no Firestore', async () => {
 await withServer('healthy', async (url, written) => {
  const result = await smoke(url, ['--json', '--token-file', tokenFile('token-ficticio')]);
  assert.equal(result.code, 0, result.stdout);
  const body = JSON.parse(result.stdout);
  assert.equal(written.length, 0, 'sem --chat nenhuma mensagem pode ser enviada');
  const chat = body.checks.find((c: any) => c.name === 'chat');
  assert.equal(chat.skipped, true);
  assert.match(chat.detail, /--chat/);
 });
});

test('com --chat, envia exatamente uma mensagem', async () => {
 await withServer('healthy', async (url, written) => {
  const result = await smoke(url, ['--json', '--token-file', tokenFile('token-ficticio'), '--chat']);
  assert.equal(result.code, 0, result.stdout);
  assert.equal(written.length, 1);
  const payload = JSON.parse(written[0]);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].role, 'user');
  const body = JSON.parse(result.stdout);
  assert.equal(body.checks.find((c: any) => c.name === 'chat responde').ok, true);
 });
});

test('detecta escrita externa habilitada em produção', async () => {
 await withServer('writes-enabled', async url => {
  const result = await smoke(url, ['--json', '--token-file', tokenFile('token-ficticio')]);
  assert.equal(result.code, 1, 'writesEnabled=true deve falhar o teste');
  const body = JSON.parse(result.stdout);
  const check = body.checks.find((c: any) => /escrita externa/.test(c.name));
  assert.equal(check.ok, false);
  assert.match(check.detail, /writesEnabled=true/);
 });
});

test('agenda é pulada sem token do Google e testada com ele', async () => {
 await withServer('healthy', async url => {
  const withoutGoogle = await smoke(url, ['--json', '--token-file', tokenFile('token-ficticio')]);
  const skipped = JSON.parse(withoutGoogle.stdout).checks.find((c: any) => /agenda e Drive/.test(c.name));
  assert.equal(skipped.skipped, true);

  const withGoogle = await smoke(url, ['--json', '--token-file', tokenFile('token-ficticio'),
   '--google-token-file', tokenFile('google-ficticio')]);
  const verified = JSON.parse(withGoogle.stdout).checks.find((c: any) => /agenda e Drive/.test(c.name));
  assert.equal(verified.ok, true);
  assert.match(verified.detail, /1 compromisso/);
 });
});

test('token recusado derruba o teste com saída 1', async () => {
 await withServer('no-token', async url => {
  const result = await smoke(url, ['--json', '--token-file', tokenFile('token-ficticio')]);
  assert.equal(result.code, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.checks.some((c: any) => c.name === 'capabilities' && c.ok === false));
 });
});

test('nenhum token aparece na saída', async () => {
 await withServer('healthy', async url => {
  const secret = 'TOKEN-PROD-SUPER-SECRETO-987654';
  const googleSecret = 'GOOGLE-PROD-SECRETO-123456';
  const result = await smoke(url, ['--json', '--token-file', tokenFile(secret),
   '--google-token-file', tokenFile(googleSecret)]);
  assert.ok(!result.stdout.includes(secret));
  assert.ok(!result.stdout.includes(googleSecret));
 });
});

test('recusa http fora do localhost', async () => {
 const result = await smoke('http://produtor-remoto.invalid');
 assert.equal(result.code, 2);
 assert.match(result.stderr, /https/);
});
