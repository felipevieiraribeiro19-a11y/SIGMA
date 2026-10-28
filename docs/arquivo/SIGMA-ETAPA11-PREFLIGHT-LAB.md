# SIGMA — Etapa 11: pré-publicação e pacote seguro do laboratório

**Situação:** somente código em branch de desenvolvimento. Não foi feito merge, deploy, alteração de chaves, OAuth ou ativação de serviço.

## O que foi preparado

1. Pré-verificação automática via `node scripts/sigma-lab-preflight.mjs`, que analisa os arquivos de configuração e o pacote compilado:
   - Worker LAB exclusivamente `sigma-jarvis-cerebro-lab` (sem Worker `sigma-cerebro` de produção);
   - `LAB_CHAT_ENABLED`, `LAB_BRAIN_ENABLED`, `LAB_WORKSPACE_ENABLED`, OAuth, ações, documentos e demais flags versionadas **false**;
   - `firebase.lab.json` aponta somente para `dist-jarvis-lab`, usa CSP restritiva e não inclui configurações de produção;
   - a build contém a URL pública do Worker LAB `https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev`, e não de produção;
   - o workflow CI não utiliza secrets, credenciais cloud, permissão `id-token: write` nem comandos de publicação.
2. Workflow de consolidação agora gera **artefato privado** `sigma-lab-build-revisao` por 5 dias. É uma pasta estática **não publicada**, pronta para revisão antes do deploy.
3. Auditoria passiva via `npm audit --json` gerando o artefato `sigma-lab-auditoria-npm`, sem alterar pacotes nem usar `npm audit fix --force`. Alertas não recebem resolução automática.
4. Testes unitários dos bloqueios de origem, flags e audit, mais os 258 testes já existentes.
5. Continua separado o pipeline local de workerd e de Durable Objects, sem Cloudflare remoto.

## O que esta fase não faz

- Não executa Firebase Hosting, Cloudflare deploy ou Google Cloud.
- Não ativa o Gemini real, memória persistente, pesquisas, Google OAuth ou automações.
- Não conecta o servidor ao Worker LAB: apenas compila uma UI com endereço público **pré-definido**. A existência, os segredos e o acesso ao Worker remoto continuam sem verificação.
- Não testa login no iPhone, Google APIs ou interface no navegador.
- Não usa ChatGPT Work, porque GitHub Actions pode executar estes passos sozinho.

## Bloqueios para ativação real

1. **Aprovação do proprietário** para deploy exclusivamente em laboratório; publicação em produção continua proibida.
2. Conferir a conta Cloudflare do laboratório, o Worker, migrações de Durable Objects, as flags e configuração de origin por conta real **sem tocar em produção**.
3. Confirmar disponibilidade e cota do modelo Gemini configurado sem expor a chave.
4. Conferir escopo do Workload Identity Federation já existente. O workflow manual anterior `.github/workflows/sigma-jarvis-lab-preview-manual.yml` está **preso à branch antiga `sigma-jarvis-arquitetura`**, por isso NÃO publica a branch consolidada. A correção de mecanismo de publicação deve ser revisada separadamente; não desabilitar políticas de WIF.
5. Validar se o domínio HTTPS temporário está incluído em Firebase Authentication → Authorized domains.
6. Analisar os avisos de dependência do artefato npm; não tratar `npm ci` bem-sucedido como garantia de segurança.
7. Testar a compatibilidade da chamada `functionCalling` no Gemini atual **em LAB**, com dados fictícios, antes de permitir gravar qualquer coisa.

## Se o Work vier a ser necessário

Apenas para atividades que não forem possíveis nos conectores, como navegação gráfica de um console ou fluxo interativo de login. A instrução do Work deve apontar especificamente a ação pendente, nunca pedir “implementar o SIGMA todo”, “mesclar tudo” ou alterar credenciais.

## Critério final

Toda compilação e teste automatizado deve ficar verde; relatório de segurança revisado; proprietário autoriza cada publicação. Apenas depois disso preparar workflow manual com branch consolidada e restrições reais de autenticação. **Não é necessária ação do usuário nesta fase de programação.**
