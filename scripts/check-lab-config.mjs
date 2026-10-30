#!/usr/bin/env node
/**
 * Verificação offline da configuração do laboratório.
 * Não fala com a rede: lê os arquivos e confere se Worker, hosting e frontend
 * concordam entre si. Rode antes de cada `wrangler deploy` do laboratório.
 *
 *   node scripts/check-lab-config.mjs
 *   node scripts/check-lab-config.mjs --json
 */
import {readFileSync, existsSync} from 'node:fs';

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

const problems = []; // bloqueiam
const warnings = []; // merecem atenção
const passed = [];

const ok = (msg) => passed.push(msg);
const bad = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

const read = (path) => {
 if (!existsSync(path)) { bad('arquivo não encontrado: ' + path); return ''; }
 return readFileSync(path, 'utf8');
};

// ---------- Worker ----------
const toml = read('worker/wrangler.chat-lab.toml');
const nameMatch = /^name\s*=\s*"([^"]+)"/m.exec(toml);
const workerName = nameMatch ? nameMatch[1] : '';
const originMatch = /^ALLOWED_ORIGIN\s*=\s*"([^"]+)"/m.exec(toml);
const allowedOrigin = originMatch ? originMatch[1] : '';

if (!workerName) bad('wrangler.chat-lab.toml sem campo `name`');
else if (workerName !== 'sigma-jarvis-cerebro-lab')
 warn('nome do Worker do laboratório é "' + workerName + '" (o esperado nos documentos é sigma-jarvis-cerebro-lab)');

const workerUrl = workerName ? 'https://' + workerName + '.felipevieiraribeiro19.workers.dev' : '';

if (!allowedOrigin) bad('wrangler.chat-lab.toml sem ALLOWED_ORIGIN');
else {
 try {
  const parsed = new URL(allowedOrigin);
  if (parsed.protocol !== 'https:') bad('ALLOWED_ORIGIN precisa ser https: ' + allowedOrigin);
  else if (parsed.pathname !== '/' || parsed.search || parsed.hash)
   bad('ALLOWED_ORIGIN deve ser apenas a origem, sem caminho: ' + allowedOrigin);
  else if (parsed.hostname === new URL(workerUrl).hostname)
   bad('ALLOWED_ORIGIN aponta para o próprio Worker; deve ser a origem da interface');
  else {
   ok('ALLOWED_ORIGIN é uma origem https válida: ' + allowedOrigin);
   if (parsed.hostname.includes('--'))
    warn('ALLOWED_ORIGIN é um canal de preview do Firebase (' + parsed.hostname + '). ' +
     'Canais expiram: se ele expirar, a interface do laboratório sai do ar e o OAuth não pode ser testado. ' +
     'Renove com `firebase hosting:channel:deploy` antes de testar.');
  }
 } catch { bad('ALLOWED_ORIGIN não é uma URL válida: ' + allowedOrigin); }
}

// ---------- Frontend: URL do Worker embutida no build ----------
const envLab = read('.env.lab');
const envApi = /^VITE_JARVIS_LAB_API\s*=\s*(\S+)/m.exec(envLab)?.[1] || '';
if (!envApi) bad('.env.lab não define VITE_JARVIS_LAB_API — a interface sairá sem backend');
else if (envApi !== workerUrl)
 bad('VITE_JARVIS_LAB_API (' + envApi + ') difere do Worker configurado (' + workerUrl + ')');
else ok('VITE_JARVIS_LAB_API aponta para o Worker de laboratório');

// ---------- Hosting: CSP precisa liberar o Worker ----------
for (const config of ['firebase.lab.json', 'firebase.beta.json']) {
 const raw = read(config);
 if (!raw) continue;
 let csp = '';
 try {
  const parsed = JSON.parse(raw);
  for (const header of parsed?.hosting?.headers?.[0]?.headers || []) {
   if (header.key === 'Content-Security-Policy') csp = header.value;
  }
 } catch { bad(config + ' não é JSON válido'); continue; }
 if (!csp) { warn(config + ' não define Content-Security-Policy'); continue; }
 const connect = (csp.split(';').find(part => part.trim().startsWith('connect-src')) || '').trim();
 if (!connect) { warn(config + ' tem CSP sem connect-src'); continue; }
 if (workerUrl && connect.includes(workerUrl)) ok(config + ': connect-src libera o Worker de laboratório');
 else bad(config + ': connect-src NÃO libera ' + workerUrl + ' — o navegador bloqueia o chat');
}

// ---------- Flags que dependem de segredo ----------
const flag = (key) => new RegExp('^' + key + '\\s*=\\s*"([^"]*)"', 'm').exec(toml)?.[1];
if (flag('GOOGLE_OAUTH_ENABLED') === 'true')
 ok('GOOGLE_OAUTH_ENABLED está ligado (confirme os 4 segredos com `wrangler secret list`)');
else
 warn('GOOGLE_OAUTH_ENABLED=false: o cofre responde 503. Ligue após gravar os 4 segredos.');

const provider = flag('LAB_PROVIDER');
if (!provider) ok('LAB_PROVIDER ausente: rota padrão Gemini, sem mudança de comportamento');
else if (!['gemini', 'deepseek', 'openai', 'anthropic'].includes(provider))
 bad('LAB_PROVIDER="' + provider + '" não é um provedor conhecido');
else if (provider === 'gemini') ok('LAB_PROVIDER=gemini: caminho original');
else ok('LAB_PROVIDER=' + provider + ': exige a chave correspondente como secret, senão cai no Gemini');

// ---------- Coerência entre código e teste de fumaça ----------
const smoke = read('scripts/smoke-lab.mjs');
const smokeOrigin = /origin:'(https:\/\/[^']+)'/.exec(smoke)?.[1] || '';
if (!smokeOrigin) warn('não foi possível ler a origem padrão de scripts/smoke-lab.mjs');
else if (allowedOrigin && smokeOrigin !== allowedOrigin)
 bad('origem padrão do teste de fumaça (' + smokeOrigin + ') difere de ALLOWED_ORIGIN (' + allowedOrigin + ')');
else ok('teste de fumaça usa a mesma origem autorizada');

// ---------- Saída ----------
const report = { ok: problems.length === 0, problems, warnings, passed };
if (asJson) {
 console.log(JSON.stringify(report, null, 2));
} else {
 console.log('Configuração do laboratório\n');
 for (const item of passed) console.log('  ok    ' + item);
 for (const item of warnings) console.log('  ATENÇÃO ' + item);
 for (const item of problems) console.log('  ERRO  ' + item);
 console.log('\n' + (problems.length
  ? problems.length + ' problema(s) impedem um deploy correto'
  : 'nenhum problema' + (warnings.length ? ' — ' + warnings.length + ' aviso(s)' : '')));
}
process.exit(problems.length ? 1 : 0);
