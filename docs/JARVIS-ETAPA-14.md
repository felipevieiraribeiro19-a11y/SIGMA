# SIGMA — Etapa 14: conversa real com Gemini, sem afetar produção

## Estado
Código do laboratório de conversa implementado na branch `sigma-jarvis-arquitetura`.
**Não significa que o Gemini está conectado ou que o Worker de laboratório foi publicado.**
O laboratório de interface anterior segue separado e pode continuar a funcionar sem backend.

## Isolamento
- Novo entrypoint: `worker/src/chat-lab.ts`. O Worker se chama `sigma-jarvis-cerebro-lab`, não `sigma-cerebro`.
- Config separada: `worker/wrangler.chat-lab.toml`, com um Durable Object de cota `LAB_QUOTA` exclusivo.
- O Worker verifica origem, Firebase ID Token, UID proprietário e provedor Google, antes do Gemini.
- `LAB_CHAT_ENABLED=false` por padrão; chave Gemini e UID proprietário precisam ser fornecidos por segredos do Worker de laboratório.
- A rota é só `POST /api/lab/chat`; CORS libera apenas o domínio exato do Hosting de teste.
- Limites básicos: 15 solicitações/dia, pico de até 4/minuto, máximo de 15 mensagens e 26 kB por requisição.
- Nenhuma leitura ou gravação Firestore, nenhuma chamada à memória de produção, nenhuma pesquisa web, nenhum Calendar/Drive, nenhuma rota de execução.
- Somente memória efêmera da aba; ao recarregar, conversa desaparece. Resposta contém `persisted:false`, `executed:false`.
- UI `src/JarvisChatPanel.tsx` aceita exclusivamente URL de Worker de laboratório em `VITE_JARVIS_LAB_API`. Sem URL, o envio fica desabilitado.
- Não enviar dados pessoais ou sensíveis aos testes; chamadas reais passam pelo Gemini quando habilitado.

## Antes de ativar
1. Confirmar que há um domínio de laboratório válido e autorizado para login no Firebase Authentication (não assumir que login está funcionando).
2. Revisar permissões do Cloudflare e validar custos/cotas sem contratar plano.
3. Garantir segredos `GEMINI_API_KEY` e `ALLOWED_UID` **somente** no Worker de laboratório. A chave de produção não pode ser lida do Worker existente; reutilizá-la exige fornecimento protegido, nunca copiá-la para o GitHub.
4. Implantar exclusivamente a configuração `worker/wrangler.chat-lab.toml`, nunca `worker/wrangler.toml`.
5. Testar rota desativada, CORS, Firebase Auth, quota e mensagens fictícias, depois aprovar `LAB_CHAT_ENABLED=true`.
6. Configurar `VITE_JARVIS_LAB_API=https://sigma-jarvis-cerebro-lab.<subdominio>.workers.dev` apenas na build do laboratório.
7. Atualizar Hosting temporário com workflow específico para o laboratório, validando CSP e domínio do Worker. **Nunca executar `firebase deploy` normal nem tocar no canal integracao.**

## Testes
```sh
npm ci
npm test
npm run check:worker
npm run build:lab
node tests/verify-jarvis-lab-build.mjs
node scripts/build-jarvis-offline.mjs
```

Os testes de HTTP com modelo simulado não provam autenticação ponta a ponta nem chamada real ao Gemini. Esse marco depende de configurar/autorizar o Worker isolado e fazer um teste no iPhone.

## Continuidade (22/10/2026)
- Subdomínio Cloudflare consultado na conta: `felipevieiraribeiro19`.
- Confirmação de leitura: `sigma-jarvis-cerebro-lab` ainda não existe no Cloudflare; `sigma-cerebro` permanece intacto.
- A chave Gemini atual é `secret_text` vinculado apenas ao Worker principal. Sua cópia para o novo Worker **não é possível pela API de leitura**. Requer entrada manual e segura pelo proprietário no painel Cloudflare ou outro fluxo de segredos autorizado.
- A publicação inicial do Worker, se aprovada, deve ter `LAB_CHAT_ENABLED=false`, sem chaves inseridas em GitHub.
- A origem permitida e a CSP do frontend devem especificar somente o domínio exato de laboratório.
