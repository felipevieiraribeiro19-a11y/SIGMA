/**
 * Read-only preflight for the isolated SIGMA lab bundle.
 * Does not call Firebase, Cloudflare, Google or any external service.
 * Requires a compiled dist-jarvis-lab/ bundle with the LAB (never production) API origin.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';

const read=(path)=>readFileSync(resolve(path),'utf8');
export const LAB_WORKER='https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev';
export const LAB_ORIGIN='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const onlyLabBundle=resolve('dist-jarvis-lab');

export function inspectLabConfig({worker,hosting,vite,workflow}){
 assert.match(worker,/^name\s*=\s*"sigma-jarvis-cerebro-lab"\s*$/m,
  'Worker de laboratório deve ter nome exclusivo.');
 assert.match(worker,/^main\s*=\s*"src\/chat-lab.ts"\s*$/m,
  'Worker deve usar chat-lab.ts, não produção.');
 assert.match(worker,/^ALLOWED_ORIGIN\s*=\s*"https:\/\/sigma-61328--jarvis-lab-pw5dmfbc\.web\.app"\s*$/m,
  'Origem do laboratório precisa ser consistente.');
 assert.match(worker,/^\[\[durable_objects\.bindings\]\]/m,'Durable Objects não configurados.');
 for(const flag of [
  'LAB_CHAT_ENABLED','LAB_WEB_ENABLED','LAB_MEMORY_ENABLED',
  'LAB_MEMORY_AUTO_ENABLED','LAB_WORKSPACE_ENABLED','LAB_BRAIN_ENABLED',
  'LAB_CONNECTORS_ENABLED','LAB_ACTIONS_ENABLED','LAB_DOCUMENTS_ENABLED',
  'GOOGLE_OAUTH_ENABLED'
 ]){
  const pattern=new RegExp('^'+flag+'\\s*=\\s*"false"\\s*$','m');
  assert.match(worker,pattern,flag+' deve continuar DESLIGADA na build de preparação.');
 }
 const parsed=JSON.parse(hosting);
 assert.equal(parsed.hosting.public,'dist-jarvis-lab');
 assert.ok(!JSON.stringify(parsed).includes('sigma-cerebro.felipevieiraribeiro19.workers.dev'),
  'Configuração de produção inesperada no Hosting LAB.');
 const csp=parsed.hosting.headers?.flatMap(x=>x.headers||[])
  .find(x=>x.key==='Content-Security-Policy')?.value;
 assert.equal(typeof csp,'string','LAB precisa de Content-Security-Policy.');
 assert.ok(csp.includes(LAB_WORKER),'CSP não permite o Worker privado de LAB.');
 assert.ok(csp.includes("default-src 'none'"));
 assert.ok(csp.includes("form-action 'none'"));
 assert.match(vite,/publicDir:\s*false/,'Não copiar public/config.json da produção.');
 assert.match(vite,/outDir:\s*'dist-jarvis-lab'/,'Build LAB precisa de saída isolada.');
 // A single owner-approved LAB-only Firebase publication is now explicitly
 // allowed. All other deploys, cloud secrets and identity escalation are denied.
 assert.doesNotMatch(workflow,/(?:wrangler\s+deploy|firebase\s+deploy|\bsecrets\.)/i,
  'CI não pode publicar Worker nem usar secrets.');
 const marker='\n  firebase-lab-deploy-autorizado:\n';
 const sections=workflow.split(marker);
 assert.equal(sections.length,2,
  'É necessário exatamente um job de publicação isolada e revisável.');
 const [ci,labDeploy]=sections;
 assert.doesNotMatch(ci,/hosting:channel:deploy|id-token:\s*write/i,
  'Jobs de teste não podem autenticar ou publicar.');
 assert.match(labDeploy,
  /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/sigma-lab-preflight-etapa11'/,
  'Deploy só pode ocorrer mediante push na branch de LAB autorizada.');
 assert.match(labDeploy,/needs:\s*\[codigo-e-interface\]/,
  'Deploy exige CI de interface e testes aprovado.');
 assert.match(labDeploy,/id-token:\s*write/,
  'Deploy deve usar federação de identidade, nunca chave privada.');
 assert.match(labDeploy,
  /workload_identity_provider:\s*projects\/428047765465\/locations\/global\/workloadIdentityPools\/sigma-github\/providers\/github/,
  'WIF existente deve ser reutilizado.');
 const expected='run: npx --yes firebase-tools@latest hosting:channel:deploy jarvis-lab --config firebase.lab.json --project sigma-61328 --expires 30d --non-interactive';
 assert.ok(labDeploy.includes(expected),
  'Somente canal jarvis-lab e firebase.lab.json podem ser publicados.');
 assert.equal((workflow.match(/hosting:channel:deploy/g)||[]).length,1,
  'Somente uma publicação Hosting de LAB é permitida.');
 assert.equal((workflow.match(/id-token:\s*write/g)||[]).length,1,
  'Apenas o job LAB pode solicitar identidade federada.');
 assert.doesNotMatch(labDeploy,/firebase\.json(?:\s|$)|sigma-61328\.web\.app|sigma-cerebro(?=[^-\w]|$)/i,
  'Publicação não pode apontar ao SIGMA principal.');
 return {worker:LAB_WORKER,origin:LAB_ORIGIN,flags:'off'};
}

export function inspectLabBundle(root=onlyLabBundle){
 assert.ok(existsSync(join(root,'index.html')),'Build LAB ainda não existe.');
 assert.ok(!existsSync(join(root,'config.json')),
  'LAB não pode copiar config.json da produção.');
 const names=readdirSync(join(root)).sort();
 assert.deepEqual(names,['assets','index.html'],'LAB só pode conter index e assets.');
 const assets=readdirSync(join(root,'assets'));
 const js=assets.filter(x=>x.endsWith('.js'));
 assert.ok(js.length>0,'LAB deve gerar um bundle JS.');
 const body=js.map(x=>readFileSync(join(root,'assets',x),'utf8')).join('\n');
 assert.ok(body.includes(LAB_WORKER),
  'Bundle de teste não aponta para o Worker LAB. Configure VITE_JARVIS_LAB_API público no build.');
 assert.doesNotMatch(body,/sigma-cerebro\.felipevieiraribeiro19\.workers\.dev/,
  'Bundle contém origem do SIGMA de produção.');
 assert.doesNotMatch(body,/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  'Chave privada detectada no pacote.');
 return {files:names.length,jsFiles:js.length,labApiConfigured:true};
}

export function runLabPreflight(){
 const config=inspectLabConfig({
  worker:read('worker/wrangler.chat-lab.toml'),
  hosting:read('firebase.lab.json'),
  vite:read('vite.lab.config.ts'),
  workflow:read('.github/workflows/sigma-lab-consolidado-ci.yml')
 });
 const output=inspectLabBundle();
 return {status:'prepared-not-deployed',...config,...output};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const details=runLabPreflight();
 console.log('SIGMA_LAB_PREFLIGHT_OK '+JSON.stringify(details));
}
