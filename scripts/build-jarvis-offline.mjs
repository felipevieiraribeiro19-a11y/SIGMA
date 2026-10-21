/**
 * Builds a standalone, offline Jarvis demonstration from verified Vite output.
 * Contains no production backend config or external task executors.
 */
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';

const root=resolve('dist-jarvis-lab');
let html=readFileSync(join(root,'index.html'),'utf8');
const files=readdirSync(join(root,'assets'));
const jsFiles=files.filter(name=>name.endsWith('.js'));
const cssFiles=files.filter(name=>name.endsWith('.css'));
if(jsFiles.length!==1||cssFiles.length!==1)
 throw new Error('A build offline deve conter exatamente um JS e um CSS.');
const js=readFileSync(join(root,'assets',jsFiles[0]),'utf8');
const css=readFileSync(join(root,'assets',cssFiles[0]),'utf8');
if(!js.includes('Arquivo offline: login indisponível')||
 !js.includes('Detalhes validados localmente')||
 !js.includes('Confirmar execução (indisponível)'))
 throw new Error('A build não possui todas as travas offline.');
if(html.includes('config.json')||js.includes('sigma-cerebro.felipevieiraribeiro19.workers.dev'))
 throw new Error('Configuração de produção detectada no laboratório.');
const jsReference=/\s*<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/;
const cssReference=/\s*<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/;
if(!jsReference.test(html)||!cssReference.test(html))
 throw new Error('Referências de bundle inesperadas.');
html=html.replace(jsReference,'').replace(cssReference,'');
html=html.replace('</head>','<style>'+css.replace(/<\/style/gi,'<\\/style')+'</style>\n</head>');
html=html.replace('</body>','<script type="module">'+js.replace(/<\/script/gi,'<\\/script')+'</script>\n</body>');
if(html.includes('src="/assets')||html.includes('href="/assets'))
 throw new Error('A demonstração offline ainda depende de hospedagem.');
const target=resolve('SIGMA_Jarvis_Demonstracao_Offline.html');
writeFileSync(target,html,'utf8');
if(statSync(target).size>1_500_000)
 throw new Error('O arquivo ficou grande demais para compartilhar.');
console.log('SIGMA_OFFLINE_HTML_READY bytes='+statSync(target).size);
