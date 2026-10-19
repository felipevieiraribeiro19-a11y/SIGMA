# Σ S.I.G.M.A.
Sistema Inteligente de Gestão, Monitoramento e Aprimoramento.

Versão candidata corrigida a partir de jarbas-pdf-teste(2).zip. **Não publicada.**

## Testar
Node 22 ou superior. Na raiz, executar `npm ci --ignore-scripts` e `npm test`. Repetir na pasta `backend`.

`public/` é o frontend. `backend/` é um Worker candidato, não uma cópia confirmada do Worker online. Consulte `RELATORIO.md` e `docs/REQUISITOS.md`.

## Dados e privacidade
Firestore permanece em `jarbas-pessoal-felipe-2026`, caminhos `users/{uid}`, mesmas coleções existentes. A prévia Hosting usa o mesmo banco; identifique os registros de teste. Exportação JSON e restauração de IDs ausentes continuam disponíveis. A lixeira é reversível.

Memória e histórico para IA iniciam desativados. O frontend verifica `/capabilities` antes de enviar a conversa. Se o Worker atual não suportar os controles, o chat IA fica bloqueado com aviso até atualização compatível; os formulários continuam disponíveis. Resolver no ambiente de testes antes de publicar produção.

A configuração pública Firebase identifica o aplicativo. Não é uma credencial administrativa. GEMINI_API_KEY e futuras chaves devem permanecer nos segredos do Worker. Não comitar tokens, contas de serviço ou .dev.vars.

## Atualizações pelo GitHub
1. Enviar os arquivos extraídos, incluindo `.github/`, `.gitignore` e `.firebaserc`, ao repositório privado SIGMA. Não enviar node_modules.
2. CI testa frontend e backend em push/PR. Os workflows ainda não foram executados no GitHub.
3. Verificar cota gratuita do GitHub Actions; não habilitar cobrança adicional.
4. Configurar o segredo `FIREBASE_SERVICE_ACCOUNT` com conta de serviço limitada ao deploy Hosting, conforme documentação oficial. Nunca salvar a chave no código.
5. Após conferir planos e compatibilidade do Worker, definir variável `ENABLE_FIREBASE_PREVIEW=true`. Push na main gera somente o canal sigma-preview, válido por 7 dias, após testes.
6. Autorizar o domínio exato da prévia no Firebase Auth e CORS, preservando os existentes.
7. Testar login Google, gravação/recarregamento, contexto da IA, exportação e restauração.
8. Produção somente após testes e aprovação de Felipe. Não há gatilho automático para produção.

Auth antigo foi removido de firebase.json para evitar sobrescrever domínios. firestore.rules mantém a versão original; firestore.next.rules é candidata e exige emulador, comparação remota e testes legados antes de deploy. Não executar deploy genérico.

Referências: https://firebase.google.com/docs/hosting/github-integration e https://github.com/FirebaseExtended/action-hosting-deploy

Site existente: https://jarbas-pessoal-felipe-2026.web.app — ainda não contém esta candidata.
