# Etapa 13 — laboratório Jarvis para iPhone (pacote isolado)

O laboratório é uma página **inteiramente separada** da aplicação SIGMA publicada. O objetivo é testar aparência, memória fictícia, revisão de tarefas e, opcionalmente, login Google sem armazenar ou executar nada.

## Componentes

- `jarvis-lab.html` e `src/jarvis-lab.tsx`: entrada independente e interface mobile-first, acessível no Safari quando houver um endereço temporário.
- `src/jarvis-lab.css`: layout próprio, sem importar a interface principal.
- `src/jarvis-lab-auth.ts`: utiliza exclusivamente Firebase Authentication, com persistência limitada à sessão do navegador. A configuração web (API key pública) não é uma chave de serviço. Não usa Firestore, Gmail, Drive, Calendar, Tavily, Gemini ou Worker do SIGMA.
- `src/MemoryCenter.tsx`: aprovar/corrigir/excluir somente uma memória **inventada em memória volátil**.
- `src/ActionReviewCenter.tsx`: agenda e documento fictícios, validação **local** usando o contrato puro de prévia, sem requisição de API ou autenticação do backend. Botão de execução segue bloqueado.
- `vite.lab.config.ts`: `publicDir: false`, só compila `jarvis-lab.html`; renomeia o HTML gerado para `index.html` da build do laboratório.
- `firebase.lab.json`: publicação somente de `dist-jarvis-lab`, sem `firestore.rules` e sem funções, com cabeçalhos que proíbem indexação e reduzem conexões externas.

## Resultado de verificação

O workflow `SIGMA - validar laboratorio Jarvis isolado` executou `npm run build:lab`, `npm test`, `npm run check:worker` e `node tests/verify-jarvis-lab-build.mjs`. A build separada foi confirmada com somente `index.html` e pasta `assets`, sem `config.json`, `sw.js`, aplicativo de produção ou URL do Worker principal. O workflow mantém o pacote `sigma-jarvis-lab-estatico` como artefato privado do GitHub por 5 dias.

## Publicação temporária, somente após autorização

O workflow `.github/workflows/sigma-jarvis-lab-preview-manual.yml` foi preparado **sem gatilhos automáticos**. Ele só poderá publicar um canal separado `jarvis-lab` se houver execução manual na branch `sigma-jarvis-arquitetura` e confirmação exata `PUBLICAR-APENAS-LAB`. Reutiliza a autenticação Google Cloud por Workload Identity Federation já existente, **sem chave privada**. O canal expira em 2 dias e não substitui o Hosting principal ou o canal `integracao`.

**Limitações para futura publicação:**

1. O GitHub pode exigir que o workflow manual seja registrado na branch padrão antes de aparecer no menu Actions; não o copie nem faça merge sem revisar essa condição.
2. A federação de identidade Google Cloud pode estar restrita à branch de integração. Ela precisa ser verificada antes de publicar a partir da branch Jarvis. Não recriar credenciais existentes.
3. O link temporário do Firebase Hosting será acessível por qualquer pessoa que o conheça. O laboratório não contém dados privados; sua privacidade depende de não usar dados reais.
4. O domínio temporário de Hosting poderá precisar ser adicionado em Firebase Authentication → Settings → Authorized domains para que o login Google funcione. Não afirmar que o login real funciona até testá-lo no Safari.
5. `authDomain` pertence ao mesmo projeto Firebase atual. O laboratório não lê nem escreve Firestore, mas um login bem-sucedido usa o provedor de autenticação Google/Firebase normalmente.
6. Essa fase não conecta login ao Worker e **não comprova autenticação ponta a ponta**. Testar essa conexão exige futura rota segura e domínio de origem explicitamente autorizado, em ambiente separado.

## Restrições de uso

- Nenhum botão executa operações reais ou grava memórias pessoais.
- A interface não inclui upload de documentos, microfone ou conversa com IA.
- Não existe fluxo automático de publicação ou migração. Nenhum site foi publicado nesta etapa.
- Não usar dados pessoais no laboratório até que a segurança e os controles de exclusão estejam validados.

**Próximo marco:** quando o proprietário autorizar, publicar o preview temporário, conferir o acesso pelo iPhone, testar login no domínio autorizado e só depois desenhar uma rota autenticada exclusivamente de diagnóstico, sem acessar memórias nem outras contas.