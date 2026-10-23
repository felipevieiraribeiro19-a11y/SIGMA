# SIGMA — Ecossistema integrado, versão para revisão
**Estado:** código experimental da branch `sigma-ecossistema-integracoes`, NÃO lançado no SIGMA principal. O laboratório anterior continua intacto até uma publicação manual.

## O que é o SIGMA
SIGMA (Sistema Inteligente de Gestão, Monitoramento e Aprimoramento) é um assistente pessoal geral, inspirado no Jarvis. O objetivo é concentrar conversas, memória persistente, estudos, rotina, tarefas, finanças e serviços conectados. Nenhum domínio (concursos, trabalho ou família) é prioridade obrigatória.

## Módulos implementados em código
| Módulo | O que faz | Situação antes de publicar |
|---|---|---|
| Conversa | Gemini, histórico temporário do laboratório, pesquisa Tavily sob demanda com fontes | Existente e testado no laboratório anterior |
| Identidade | Google Firebase Auth, sessão persistente no Safari normal | Já validado pelo usuário |
| Memória | Criar, consultar, editar, apagar; limite experimental 30 notas de 500 caracteres | Já validado pelo usuário |
| Lembrança automática | Recupera até três notas relevantes após autorização permanente da conta; busca lexical | Já validado pelo usuário |
| Aprendizado contínuo | Identifica certas frases como possíveis memórias; apresenta texto editável e botão de aprovação | Código novo; NÃO salva sem confirmação |
| Estudos | Registro manual de matéria/assunto, minutos e observações; total de horas | Código novo |
| Diário e rotina | Registros datados de atividades e observações | Código novo |
| Tarefas | Cadastro de tarefas, marcar feitas/pendentes, exclusão | Código novo |
| Finanças | Lançamentos manuais com entradas positivas/despesas negativas; saldo simples | Código novo; NÃO faz integração bancária |
| Painel integrado | Resume horas estudadas, tarefas abertas, saldo; lista até 250 registros experimentais | Código novo |
| Google Calendar | OAuth com escopo de leitura, consulta de eventos dos próximos 14 dias | Adaptador novo; precisa autorizar Google e ativar Worker |
| Google Drive | OAuth com escopo de metadados, localizar até 15 arquivos recentes | Adaptador novo; precisa autorizar Google e ativar Worker |
| Notion | Token privado no Worker; pesquisar páginas compartilhadas, consultar blocos | Adaptador novo; precisa criar integração e compartilhar páginas |
| Chat com serviços | Usuário escolhe os serviços para uma pergunta; resultados resumidos servem de contexto ao Gemini | Código novo, depende das conexões |
| Ações reais confirmadas | Criar evento Calendar, pasta Drive, página filha no Notion em DUAS etapas: preparar e confirmar | Código novo, desativado por padrão; precisa credenciais e teste real |
| Auditoria das ações | Propostas com validade de 10 min, consumo único e resultado sucesso/falha/incerto; consulta de status | Código novo; nunca reexecutar ação incerta automaticamente |

## Como será o uso diário
- Entrar no SIGMA pelo Safari com sessão Google persistente.
- Conversar com Gemini, com pesquisa web somente quando necessária.
- Com autorização permanente, o chat consulta memórias relevantes sem novo clique.
- Quando uma frase indica algo importante ("lembre que...", "meu objetivo é..."), o SIGMA pode **sugerir**, e você decide se salva.
- Usar as seções de estudos, diário, tarefas e finanças para **registros estruturados**, não inferidos de conversas.
- Conectar serviços Google sob demanda e liberar páginas do Notion; depois consultar suas fontes no painel ou selecionar fontes no chat.
- Preparar uma criação no serviço, revisar dados na tela e clicar de novo para **confirmar**; nenhuma ação é executada pela conversa sozinha.

## Limites intencionais e itens ainda não completos
- **Memória não é transcrição total**: as conversas do laboratório não são persistidas; a lembrança automática usa notas aprovadas, não todas as mensagens.
- **Aprendizado é heurístico**: reconhece alguns padrões de texto, não entende todos os fatos importantes. Não há curadoria autônoma do Gemini.
- **Busca de memória ainda não é semântica/vectorial**: pode errar sinônimos.
- **Google OAuth para APIs é temporário**: o login principal persiste, mas o token de acesso a Calendar/Drive é mantido apenas nesta aba/sessão; pode ser necessário consentir ou reconectar após nova visita.
- **Drive não faz download e indexação em massa de PDFs**, sincronização, rename, delete ou organização automática; leitura inicial é de metadados.
- **Notion só acessa conteúdo explicitamente compartilhado com a integração**. Não é login via OAuth público do Notion; usa integração interna para conta pessoal.
- **Finanças e estudos são manuais**, sem importação bancária, sincronização do Gran ou geração avançada de ciclos.
- **Ações só criam três tipos de objetos**, sob confirmação individual; não alteram/apagam objetos existentes.
- **Não há agente 24/7 nem alertas proativos em segundo plano**; agendador e monitoramento por condições ficam para implementação específica.
- **Não há reconhecimento contínuo de voz**, backup/exportação geral, múltiplos usuários, faturamento nem API de outros modelos ativada.
- A interface segue experimental e pode precisar de ajustes após testes reais de OAuth e Notion.

## Segurança e custos
Toda rota exige Firebase Auth, UID permitido e origem específica do laboratório. Tokens e segredos não entram nos textos do Gemini nem ficam armazenados no navegador (exceto sessão Firebase gerenciada pelo SDK). Escrita externa usa uma confirmação de uso único. Eventos e pastas criados no Google são reais **se a função for deliberadamente habilitada e você confirmar**. No modo teste, use dados fictícios. APIs e recursos da Cloudflare/Google/Notion podem ter quotas; não há garantia de custo zero.

## Onde está o código
- Frontend React: `src/JarvisChatPanel.tsx`, `src/LabEcosystemPanel.tsx`, `src/LabIntegrationsPanel.tsx`, `src/LabActionCenter.tsx`.
- Worker autenticado: `worker/src/chat-lab.ts`.
- Memória: `worker/src/lab-memory.ts`, `worker/src/core/continuous-learning.ts`.
- Dados operacionais: `worker/src/lab-workspace.ts`.
- Serviços externos: `worker/src/core/sigma-connectors.ts`, `worker/src/core/sigma-action-executors.ts`.
- Aprovação persistida: `worker/src/lab-external-actions.ts`.
- Cloudflare: `worker/wrangler.chat-lab.toml` — flags de integração e execução desligadas por padrão.

## Perguntas para revisão do produto
1. Quais integrações devem ter prioridade: Calendar, Drive, Notion ou Gran?
2. Aprovação individual de ações está no nível certo ou você quer autorizações permanentes por tipo de ação?
3. No diário e nos estudos, quais campos devem ser obrigatórios?
4. Quais relatórios e gráficos devem aparecer na tela inicial?
5. Você quer que o SIGMA proponha memórias automaticamente em mais situações ou só após comandos explícitos?
6. Monitoramento contínuo: concursos, eventos pessoais, finanças ou outras condições — e em qual frequência?

**Este arquivo serve para sua revisão.** Nenhum segredo pessoal foi adicionado ao repositório, e a produção não foi alterada.
