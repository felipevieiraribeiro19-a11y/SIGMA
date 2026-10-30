#!/usr/bin/env node
/**
 * Teste de fumaça da PRODUÇÃO (Worker sigma-cerebro).
 *
 * Cuidados deliberados:
 * - POST /api/chat GRAVA o par pergunta/resposta no Firestore do usuário.
 *   Por isso o chat é OPT-IN (--chat) e avisa antes.
 * - Nenhuma outra chamada escreve: só GET e um OPTIONS.
 * - Nunca imprime o token do Firebase nem o token do Google.
 *
 * Uso:
 *   node scripts/smoke-prod.mjs
 *   node scripts/smoke-prod.mjs --token-file /tmp/token.txt
 *   node scripts/smoke-prod.mjs --token-file /tmp/token.txt --chat
 */
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
 const out = { url: '', origin: '', tokenFile: '', googleTokenFile: '', chat: false, json: false, timeout: 30000, message: 'Responda apenas: teste ok.' };
 const flags = { '--chat': 'chat', '--json': 'json' };
 for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (flags[arg]) { out[flags[arg]] = true; continue; }
  if (arg === '--url') out.url = argv[++i] || '';
  else if (arg === '--origin') out.origin = argv[++i] || '';
  else if (arg === '--token-file') out.tokenFile = argv[++i] || '';
  else if (arg === '--google-token-file') out.googleTokenFile = argv[++i] || '';
  else if (arg === '--message') out.message = argv[++i] || out.message;
  else if (arg === '--timeout') out.timeout = Number(argv[++i]) || 30000;
  else if (arg === '--help' || arg === '-h') out.help = true;
 }
 return out;
}

function readWrangler() {
 const path = join(ROOT, 'worker', 'wrangler.toml');
 if (!existsSync(path)) return { name: '', origins: [] };
 const toml = readFileSync(path, 'utf8');
 const name = /^name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] || '';
 const list = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(toml)?.[1] || '';
 return { name, origins: list.split(',').map(v => v.trim()).filter(Boolean) };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exit(0); }

const wrangler = readWrangler();
if (!args.url) {
 if (!wrangler.name) { console.error('ERRO: informe --url (não encontrei worker/wrangler.toml).'); process.exit(2); }
 args.url = `https://${wrangler.name}.felipevieiraribeiro19.workers.dev`;
}
if (!args.origin) {
 // Prefere a origem principal (sem "--"); canal de preview expira e não serve de referência.
 args.origin = wrangler.origins.find(o => !o.includes('--')) || wrangler.origins[0] || 'https://sigma-61328.web.app';
}

let base;
try { base = new URL(args.url); } catch { console.error('ERRO: --url inválida.'); process.exit(2); }
if (base.protocol !== 'https:' && !LOCAL.test(base.origin)) {
 console.error('ERRO: use https (ou http apenas em 127.0.0.1/localhost).'); process.exit(2);
}

const token = (process.env.SIGMA_ID_TOKEN || '').trim() || (args.tokenFile ? readFileSync(args.tokenFile, 'utf8').trim() : '');
const googleToken = (process.env.SIGMA_GOOGLE_TOKEN || '').trim() || (args.googleTokenFile ? readFileSync(args.googleTokenFile, 'utf8').trim() : '');

const mask = (v) => (!v ? '(ausente)' : v.length <= 8 ? v.slice(0, 2) + '…' : v.slice(0, 4) + '…' + v.slice(-4));

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });
const skip = (name, detail) => results.push({ name, ok: true, skipped: true, detail });

class NetworkFailure extends Error {}

async function call(path, init = {}) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), args.timeout);
 const started = Date.now();
 try {
  const response = await fetch(base.origin + path, { ...init, signal: controller.signal });
  const ms = Date.now() - started;
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, ms, body, headers: response.headers, raw: text };
 } catch {
  if (controller.signal.aborted) throw new NetworkFailure(`sem resposta em ${args.timeout} ms`);
  throw new NetworkFailure('não foi possível conectar');
 } finally { clearTimeout(timer); }
}

const jsonHeaders = { 'Content-Type': 'application/json' };

// ---------- Barreiras: nenhuma credencial necessária ----------
async function boundaries() {
 const foreign = await call('/api/chat', {
  method: 'POST',
  headers: { Origin: 'https://origem-nao-autorizada.invalid', ...jsonHeaders },
  body: JSON.stringify({ messages: [{ role: 'user', text: 'teste' }] })
 });
 record('origem não autorizada é recusada', foreign.status === 403, 'HTTP ' + foreign.status);

 const preflight = await call('/api/chat', { method: 'OPTIONS', headers: { Origin: args.origin } });
 record('preflight CORS responde 204', preflight.status === 204, 'HTTP ' + preflight.status);
 record('preflight devolve a origem autorizada', preflight.headers.get('access-control-allow-origin') === args.origin,
  preflight.headers.get('access-control-allow-origin') || '(sem cabeçalho)');

 const anonymous = await call('/api/capabilities', { headers: { Origin: args.origin } });
 record('chamada sem token é recusada', anonymous.status === 401 || anonymous.status === 403,
  'HTTP ' + anonymous.status);

 const unknown = await call('/api/rota-inexistente', { headers: { Origin: args.origin } });
 record('rota desconhecida responde 404', unknown.status === 404, 'HTTP ' + unknown.status);

 const wrongMethod = await call('/api/chat', { headers: { Origin: args.origin } });
 record('método errado responde 405', wrongMethod.status === 405, 'HTTP ' + wrongMethod.status);

 const wrongType = await call('/api/chat', {
  method: 'POST', headers: { Origin: args.origin, 'Content-Type': 'text/plain' }, body: 'oi'
 });
 // Sem token, o Worker autentica antes de checar o corpo: 401 é aceitável, 415 é o ideal.
 record('sem JSON o Worker não processa', wrongType.status === 415 || wrongType.status === 401,
  'HTTP ' + wrongType.status);
}

// ---------- Autenticado ----------
async function authenticated() {
 const auth = { Authorization: 'Bearer ' + token, Origin: args.origin };

 const capabilities = await call('/api/capabilities', { headers: auth });
 if (capabilities.status === 401) {
  record('capabilities', false, 'HTTP 401 — token inválido ou expirado');
  return;
 }
 if (capabilities.status !== 200) {
  record('capabilities', false, 'HTTP ' + capabilities.status + ' ' + (capabilities.body?.error || ''));
  return;
 }
 const list = Array.isArray(capabilities.body?.capabilities) ? capabilities.body.capabilities : [];
 const available = list.filter(c => c?.status === 'available').length;
 const planned = list.filter(c => c?.status === 'planned').length;
 record('capabilities responde', list.length > 0, `${list.length} itens · ${available} disponíveis · ${planned} planejados`);
 record('escrita externa continua desligada em produção', capabilities.body?.writesEnabled === false,
  'writesEnabled=' + String(capabilities.body?.writesEnabled));

 const history = await call('/api/history', { headers: auth });
 if (history.status === 200) {
  const turns = Array.isArray(history.body?.turns) ? history.body.turns.length : -1;
  record('histórico responde', turns >= 0, turns + ' turno(s) recentes');
 } else {
  record('histórico responde', false, 'HTTP ' + history.status + ' ' + (history.body?.error || ''));
 }

 const agendaHeaders = googleToken ? { ...auth, 'X-Google-Token': googleToken } : null;
 if (agendaHeaders) {
  const agenda = await call('/api/agenda', { headers: agendaHeaders });
  if (agenda.status === 200) {
   const events = Array.isArray(agenda.body?.agenda) ? agenda.body.agenda.length : 0;
   const files = Array.isArray(agenda.body?.materiais) ? agenda.body.materiais.length : 0;
   record('agenda e Drive respondem', true, `${events} compromisso(s) · ${files} arquivo(s) · ${agenda.ms} ms`);
  } else if (agenda.status === 401) {
   record('agenda e Drive respondem', false, 'HTTP 401 — token do Google expirado');
  } else {
   record('agenda e Drive respondem', false, 'HTTP ' + agenda.status + ' ' + (agenda.body?.error || ''));
  }
 } else {
  skip('agenda e Drive', 'não verificado: passe --google-token-file para testar');
 }

 if (!args.chat) {
  skip('chat', 'não executado: use --chat (a mensagem é GRAVADA no seu Firestore)');
  return;
 }
 const chat = await call('/api/chat', {
  method: 'POST', headers: { ...auth, ...jsonHeaders },
  body: JSON.stringify({ messages: [{ role: 'user', text: args.message }] })
 });
 if (chat.status === 200) {
  const size = typeof chat.body?.text === 'string' ? chat.body.text.length : 0;
  const sources = Array.isArray(chat.body?.sources) ? chat.body.sources.length : 0;
  record('chat responde', size > 0, `${chat.ms} ms · ${size} caracteres` + (sources ? ' · ' + sources + ' fonte(s)' : ''));
 } else if (chat.status === 429) {
  record('chat responde', false, 'HTTP 429 — cota diária de mensagens atingida');
 } else {
  record('chat responde', false, 'HTTP ' + chat.status + ' ' + (chat.body?.error || ''));
 }
}

try {
 await boundaries();
 if (token) await authenticated();
} catch (error) {
 if (error instanceof NetworkFailure) {
  console.error('ERRO: ' + base.origin + ' — ' + error.message + '.');
  console.error('Confira se o Worker está publicado e se o endereço está correto.');
  process.exit(2);
 }
 throw error;
}

const failures = results.filter(r => !r.ok);
const skipped = results.filter(r => r.skipped);
if (args.json) {
 console.log(JSON.stringify({ url: base.origin, origin: args.origin, ok: failures.length === 0, checks: results }, null, 2));
} else {
 console.log('Teste de fumaça — PRODUÇÃO — ' + base.origin);
 console.log('Origem usada: ' + args.origin);
 console.log('Token: ' + mask(token) + (token ? '' : ' (nenhum: apenas barreiras)'));
 console.log('');
 const width = Math.max(...results.map(r => r.name.length));
 for (const r of results) {
  const tag = r.skipped ? ' pulo  ' : r.ok ? '  ok   ' : ' FALHA ';
  console.log(tag + r.name.padEnd(width) + '  ' + r.detail);
 }
 if (args.chat && !token) console.log('\n--chat ignorado: sem token.');
 console.log('\n' + (failures.length
  ? failures.length + ' verificação(ões) falharam'
  : 'todas as verificações passaram' + (skipped.length ? ' (' + skipped.length + ' pulada(s))' : '')));
}
process.exit(failures.length ? 1 : 0);
