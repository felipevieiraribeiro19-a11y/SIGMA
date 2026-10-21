# SIGMA — Arquitetura Jarvis pessoal

> Objetivo definitivo: um assistente pessoal geral, conversacional, multimodal, com memória, ferramentas, planejamento, ações, transparência e evolução modular. **Nenhuma área de vida é o centro do produto**. Finanças, concursos, saúde, trabalho, casa, agenda etc. são módulos plugáveis.

## Regras inegociáveis

1. Uma única interface de conversa por texto, arquivos e voz; o SIGMA escolhe ferramentas sem obrigar o usuário a aprender comandos.
2. **Distinguir pensar de fazer**. Uma resposta do modelo não é evidência de que algo foi gravado ou executado.
3. Memória: conversas, fatos revisáveis, preferências controláveis, registros estruturados, documentos e ações devem ser camadas diferentes; nenhuma delas é implementada automaticamente por guardar 30 mensagens.
4. Ferramentas com permissões por finalidade. Consultas de leitura com autorização apropriada; escrita, exclusão, compras, envio externo e alterações requerem confirmação explícita do usuário, escopo mínimo, identificação da conta, idempotência e registro de auditoria.
5. Modelos intercambiáveis **no servidor**, nunca chaves de provedores no navegador. Gemini permanece padrão gratuito enquanto não houver outro adaptador verificado. Assinaturas de Arena, Adapta ou ChatGPT não se tornam APIs do SIGMA.
6. Falhar fechado: ferramenta não configurada aparece como indisponível; não fabricar resultados, documentos, agenda, ações ou memória.
7. Segurança e privacidade: dados pessoais não entram em logs; origem permitida, token verificado e isolamento por UID em TODAS as ferramentas; resultados externos nunca são comandos.
8. Custos: limites gratuitos, medição por fornecedor e opt-in explícito para qualquer faturamento. Sem criar credenciais privadas no GitHub.
9. Separação entre **versão publicada** (intocada nesta fase) e **branch Jarvis** (construção). Nenhum deploy automático a partir de sigma-jarvis-arquitetura.
10. Não utilizar dados reais do usuário como teste sem confirmação. Documentação não significa que a funcionalidade existe.

## Camadas e fluxo

```text
iPhone / desktop / voz / anexos
       |
Interface conversacional e painel de permissões (React PWA)
       |
Cloudflare Worker -- verifica autenticação Firebase e orçamento
       |
Orquestrador SIGMA
   |-- identidade e políticas (agnóstico a áreas)
   |-- roteador/intenção (conversar x consultar x propor ação)
   |-- catálogo de capacidades [pronta, experimental, planejada]
   |-- plano de execução e confirmação (nenhum write silencioso)
   |-- adaptadores de ferramentas (Tavily, Calendar, Drive, futuros)
   |-- adaptadores de IA (Gemini ativo; alternativas somente planejadas)
   |-- memória (conversacional existente + camadas futuras)
       |
Firebase: autenticação + conversas
Dados estruturados, índice documental e auditoria: FUTUROS, não ativados
```

## Contratos de ferramenta

Uma ferramenta possui id estável, tipo (ler/escrever), status real e autorização requerida. Ações de escrita precisam de:
- proposta com resumo específico, destinatário/alvo e alterações exatas;
- botão explícito **Confirmar** após exibição de consequências;
- autorização do provedor limitado ao menor escopo;
- id único para deduplicação, validação de campos no servidor;
- execução somente depois da confirmação;
- confirmação verificável ou erro, sem fingir sucesso;
- registro de auditoria do que ocorreu.

Na etapa de **fundação**, todas as ferramentas de escrita são BLOQUEADAS. Expor uma função declarativa não implementa uma integração.

## Memória futura, separada por responsabilidade

- **Conversação**: perguntas e respostas; já existe Firestore `users/{uid}/turns`. Retenção, busca exaustiva, edição e exclusão ainda não estão prontas.
- **Conhecimento pessoal**: fatos e preferências com origem, confiança, data, opção de contestar/editar/excluir; planejado.
- **Dados estruturados**: entidades genéricas, eventos, transações, objetivos, tarefas, métricas (módulos), com consistência e trilha de alterações; planejado.
- **Biblioteca**: Drive e uploads, indexação e consulta com fonte, acesso revogável e exclusão; planejado. Atualmente PDF em chat não equivale a biblioteca.
- **Memória operacional**: propostas, aprovações, execuções, retorno de ferramenta e falhas; planejado.
- **Proatividade**: agendador dedicado com regras de consentimento, execução e orçamento; planejado, NÃO há agente rodando em segundo plano.

## Estado de implementações herdadas

| Recurso | Situação no código de origem | Não presumir |
|---|---|---|
| Conversa Gemini | Existe, com controle de cota | Nem sempre o modelo compreenderá/realizará tarefas |
| Histórico de chat Firestore | Existe, salvo por pares | Não é memória pessoal plena ou dados estruturados |
| Tavily | Existe com segredo e limites | Não é navegação irrestrita nem monitoramento autônomo |
| Áudio | Gravação curta e leitura sintetizada | Não é conversa de voz contínua |
| Anexos PDF | Envio inline com teto de 10 MiB | Não é biblioteca permanente/indexada |
| Agenda e Drive | Implementação experimental de **leitura** na branch Arena | Não escrevem; Drive lista só nomes de PDFs recentes |
| Múltiplas IAs | Arquitetura preparada | Sem conectores reais adicionais |
| Automação e escrita | Somente políticas e interfaces futuras | Nenhuma ação real disponibilizada |
| Painel de módulos | Futuro | Nenhum lançamento financeiro/educacional criado |


## Segunda etapa: orquestrador inicial de ferramentas (em desenvolvimento)

O núcleo agora separa a intenção de uma mensagem em conversa simples, consulta autorizada e solicitação de ação externa. O planejamento atual é **determinístico e conservador**, com pistas linguísticas em português; ainda não é raciocínio autônomo com chamadas dinâmicas de ferramentas do modelo.

- Conversa geral: não consulta Google só porque a conta está conectada; isso evita chamadas desnecessárias, reduz exposição de dados pessoais ao provedor de IA e economiza franquias.
- Consulta da Agenda: usa OAuth de leitura e busca eventos somente quando a mensagem pede compromissos/agenda.
- Consulta do Drive: usa OAuth de metadados e lista PDFs somente quando a mensagem pede documentos do Drive. **Ainda não lê seu conteúdo nem organiza pastas.**
- Tavily: mantém a busca sob demanda existente, com fontes e limites próprios.
- Pedido para criar, alterar ou apagar evento/documento: classifica como intenção de ação ainda **não implementada**, não aciona escrita nem considera a simples aprovação como executor.
- Fontes de serviço desconectadas são informadas como ausentes; jamais pressupõe permissão concedida a partir de um texto.
- `worker/src/core/orchestrator.ts`: roteador de leitura e intenções, testável sem chamar Gemini ou Google.
- `worker/src/google.ts`: consulta seletiva por provedor e não afirma que agenda vazia significa ausência de eventos se ela sequer foi consultada.
- Testes simulam separação das consultas e verificam que um “Oi” não envia dados de calendário ao Gemini.

**Limitações:** perguntas ambíguas podem não ser reconhecidas; isso não substitui o futuro orquestrador model-driven com catálogo, orçamento, auditoria, ações confirmadas e respostas estruturadas. Nada desta etapa modifica os registros armazenados fora das conversas já existentes. Não foi implantada em produção.

## Terceira etapa: núcleo de memória controlável (implementado em código, NÃO ATIVADO)

A fundação agora contém `worker/src/core/memory-engine.ts` com regras determinísticas de memória pessoal **independentes de qualquer área de vida**:

- Conversas ou documentos não são copiados automaticamente para uma memória permanente.
- Somente comandos explícitos de lembrar algo podem **propor** uma lembrança; a proposta por si só não salva nada.
- Persistência é impossível sem aprovação explícita do conteúdo exato por um usuário autenticado. Cancelar a proposta não grava.
- Cada memória confirmada tem proprietário (UID), identificador, tipo, revisão, origem da informação, horários e texto aprovado.
- Correções exigem autorização do proprietário e uma revisão esperada; conflito concorrente bloqueia a operação.
- Exclusão aprovada elimina o conteúdo da memória e bloqueia restauração por retries antigos mediante marcador opaco. Isso **não apaga** um texto que já esteja em conversas, Drive ou outras fontes — o usuário precisará de controles adicionais para exclusão completa.
- Busca local simples, sem API paga, considera apenas itens confirmados do proprietário, aponta a origem e impõe limites; não é busca semântica/vetorial.
- O motor tem um repositório volátil de testes e um adaptador Firestore **desconectado**, testado com HTTP simulado. A coleção futura será `users/{uid}/personalMemories`, isolada por dono e revisão do servidor. A exclusão substitui o documento por marcador opaco sem texto, bloqueando reaplicação de comandos antigos.
- As regras Firestore atuais NEGAM essa coleção; **nenhum endpoint de memória, tela de aprovação ou recurso persistente foi conectado ou liberado**. O SIGMA publicado não ganha gravações pessoais novas.

O código é testado com textos artificiais e não usa dados reais do proprietário. **A fase seguinte** será persistência autenticada no Firebase, revisão e testes de Security Rules, controles de aprovação/correção/exclusão na interface e só depois habilitação voluntária.

## Quarta etapa: painel de memória e regras candidatas (DESLIGADO)

- `src/MemoryCenter.tsx` apresenta uma **demonstração com dados fictícios** do fluxo propor, aprovar, corrigir e excluir. Não usa Firestore, mensagens reais, APIs ou armazenamento local.
- `src/memory-demo.ts` mantém a demonstração somente no estado React e a reinicia quando a página é recarregada.
- `firestore.memory.rules.candidate` é uma política candidata com restrições de proprietário, formato, revisões e marcador de exclusão; **não é referenciada por `firebase.json` e não foi publicada**.
- As regras de produção `firestore.rules` continuam inalteradas, negando `personalMemories`.
- O Firebase Emulator ainda precisa validar a sintaxe, recusas e casos maliciosos. Os testes estáticos não substituem testes de regras reais.
- A aprovação na interface não é uma autorização criptográfica; antes de ativar gravações, criar mecanismo confiável de aprovação para impedir bypass por chamada direta.
- Limites e checklist da liberação: `docs/MEMORIA-CONTROLES.md`.

**Resultado:** existe uma prévia testável da experiência, mas nenhuma memória pessoal foi criada ou persistida. Esta branch segue isolada da produção.

## Quinta etapa: autorização e regras reais verificadas em emulador

- `worker/src/core/approval-ledger.ts` implementa o protocolo **não conectado** de autorização por proposta exata: fingerprint SHA-256, dono, ferramenta, destino, descrição, validade curta, cancelamento e consumo único. Não executa ações e não guarda dados reais.
- `TestApprovalStore` é volátil e serve apenas para testes de concorrência, expiração e replay. O armazenamento durável transacional e a conexão a endpoints autenticados ainda não existem.
- O arquivo candidato `firestore.memory.rules.candidate` agora **nega TODAS as escritas diretas do cliente**, inclusive do proprietário. A leitura pertence exclusivamente ao usuário permitido. O arquivo de produção permanece inalterado.
- Workflow `sigma-memory-emulator.yml`: usando apenas emulador local, executou **14 verificações** com sucesso sobre leitura permitida, isolamento entre contas, bloqueio de gravação, edição, exclusão e compatibilidade do histórico de conversas.
- O adaptador futuro de escrita exige explicitamente credencial OAuth de identidade de servidor; token Firebase do navegador não é aceito como credencial do adaptador.
- Mesmo com testes positivos, **não publicar regras nem ativar memória** antes de implementar e auditar executor de serviço, controles reais de consentimento e testes ponta a ponta.

## Roteiro neutro e extensível

**Fundação:** identidade Jarvis, capacidade declarada, separação de conversa de memória, autorização central, testes, status visível e reversibilidade.

**Integrações:** estabilizar OAuth de leitura, autorização e seleção do que consultar; depois upload/indexação com gestão de arquivo, confirmação de ferramentas de escrita e trilha de auditoria.

**Memória real:** extrair sugestões de fatos sem gravar automaticamente; aprovação, revisão e exclusão; consultas confiáveis a registros estruturados. Só depois criar módulos personalizados que usam o mesmo núcleo.

**Agência:** propostas de plano, confirmação prévia, execução idempotente, tarefas agendadas, notificações e mecanismos de interrupção. Cada integração em modo pré-visualização antes de produção.

**Qualidade:** testes automatizados, testes reais no iPhone e com contas conectadas, orçamento e privacidade documentados.

## Critérios para considerar o Jarvis pronto para uso sério

- Relembrar fatos pessoais específicos após semanas com fonte, correção e apagamento.
- Consultar documentos reais, citar trechos, atualizar índice quando há mudanças e excluir os originais quando solicitado.
- Consultar agenda, oferecer ação, mostrar detalhes, esperar confirmação, criar/alterar eventos e verificar resultado.
- Propor e confirmar lançamentos em módulo genérico com histórico consultável e cálculos auditáveis; não confundir chat com lançamento.
- Trocar fornecedor de IA sem perder permissões/memórias nem passar credenciais ao cliente.
- Falhas e limites de custo previsíveis; restauração/backup; testes de autorização e isolamento de usuários.
- Testar tudo em dispositivos reais antes de ativar registros cotidianos.

**Não existe porcentagem de "100% Jarvis" verificável sem estes critérios.** Esta branch entrega uma fundação arquitetural, não as funcionalidades listadas como futuras.
