# SIGMA LAB — Etapa 3: OAuth Google persistente (NÃO publicado)

**Status:** PR #9 em rascunho. Implementação local com testes simulados; não há cliente/segredo Google configurado nesta etapa, nem acesso real, ativação de flags ou alteração do SIGMA principal.

## O que foi implementado

- Conexão *separada* do login Firebase Auth: o login existente continua funcionando sem autorizar Google Drive/Calendar.
- Fluxo OAuth 2.0 de servidor: `response_type=code`, `access_type=offline`, PKCE S256, estado imprevisível vinculado ao UID, expiração em 10 minutos e uso único.
- Permissões de leitura sob escolha explícita: `calendar.events.readonly`, `drive.metadata.readonly` ou `drive.readonly`. O SIGMA não solicita escrita nesta fase. Cada conjunto mantém sua própria credencial.
- `LabGoogleOAuthVault` (Durable Object isolado por UID) guarda **refresh tokens criptografados** com AES-256-GCM. Chave aleatória de 32 bytes via segredo Cloudflare; IV aleatório a cada gravação; UID faz parte do AAD.
- O token de atualização não é enviado ao navegador, prompts, logs do app ou repositório. Uma rota interna do DO emite access token de curta duração **somente ao Worker**, quando autorizado.
- Renovação sob demanda, cache apenas em memória, guarda de token rotacionado, tratamento de `invalid_grant` com reconexão necessária.
- Interface móvel experimental na seção Biblioteca: Conectar, Consultar status, Desconectar localmente.
- `GOOGLE_OAUTH_ENABLED=false` no arquivo versionado. As permissões temporárias via popup atuais não foram substituídas nesta etapa.

## Antes de qualquer autorização real (configuração que exige sua decisão)

1. Acessar o projeto Google Cloud associado ao Firebase SIGMA e **inspecionar clientes OAuth Web existentes**. Reutilizar um cliente compatível quando possível; NÃO recriar credenciais nem usar Service Account para dados da conta Google pessoal.
2. Verificar o estado da tela de consentimento OAuth: **External / Testing** normalmente emite refresh tokens com validade de 7 dias para Drive/Calendar. Avaliar mover para *In production*, considerando escopos sensíveis, requisitos de verificação, avisos e política do Google. Alterar status não publica o site SIGMA.
3. Validar APIs Google Calendar e Google Drive habilitadas no projeto.
4. Escolher a URL HTTPS REAL do Worker **LAB** como callback e cadastrá-la exatamente no cliente OAuth Web: `https://<origem-worker-lab>/api/lab/oauth/callback`. O Worker deve receber `GOOGLE_OAUTH_REDIRECT_URI` com a mesma URL, sem parâmetros.
5. Configurar **somente no Worker de laboratório**, como segredos (não compartilhar aqui): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` e `GOOGLE_OAUTH_ENCRYPTION_KEY`. Para a última, gerar 32 bytes criptograficamente aleatórios e guardar em base64. O client ID é público, mas manter toda a configuração no Worker simplifica a preparação.
6. Somente após aprovação separada do proprietário, habilitar `GOOGLE_OAUTH_ENABLED=true` no ambiente de laboratório e testar uma conexão no Safari/iPhone.
7. Após isso, numa fase posterior, conectar o token de curta duração disponibilizado apenas internamente aos módulos de consulta e aos agendadores. **Nenhum monitoramento 24/7 foi ativado por este PR**.

### Restrições operacionais

- O callback do Google não carrega Firebase JWT nem `Origin`; por isso é a única exceção à validação de origem do Worker, limitada a um endereço exato, estado secreto vinculado ao UID, PKCE, expiração e consumo único.
- O campo `state` da URL de callback contém um identificador não secreto e um nonce aleatório. Nenhum refresh token aparece em parâmetros de URL.
- A desconexão remove a credencial **local** do SIGMA. A revogação do consentimento no próprio Google é separada e pode ser feita nas configurações de Conta Google → Aplicativos de terceiros.
- Acesso de segundo plano é condicionado à validade dos tokens, autorização vigente, limites do Google e escopos concedidos. O modo *In production* não garante validade eterna de tokens.
- Se a chave de criptografia for perdida, o refresh token persistido se torna ilegível e será preciso reconectar. Rotação de chave exige migração planejada; não alterar a chave sem procedimento.
- Requisições ao servidor Google só acontecem se o usuário iniciar a conexão ou se futuramente um módulo servidor solicitar token interno. Nenhum teste deste PR usa dados reais.

## Referências oficiais

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://developers.google.com/identity/protocols/oauth2/policies
- https://developers.google.com/identity/protocols/oauth2/

## Critérios de aprovação para implantação futura

- Testes GitHub Actions verdes (TypeScript Worker e frontend, testes de auth e roteamento).
- Verificação humana do cliente OAuth, domínio de callback e dados da tela de consentimento.
- Confirmação explícita de que o Worker LAB **e não a produção** receberá credenciais e novas flags.
- Teste autorizado de conexão, acesso, expiração, revogação e reconexão em conta de teste do proprietário.
