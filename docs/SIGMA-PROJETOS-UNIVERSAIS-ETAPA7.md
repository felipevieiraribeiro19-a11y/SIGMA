# SIGMA — Projetos universais (Etapa 7, LAB, sem deploy)

## Princípio do produto

O SIGMA não é um aplicativo de concursos, vendas, finanças ou uma empresa específica. É um assistente pessoal que poderá organizar qualquer objetivo dentro do **mesmo espaço de trabalho**, com ferramentas reutilizáveis.

Exemplos de títulos que o usuário pode criar: **Concurso público**, **Vendas de carros**, **Império da Batata**, **Inglês**, **Novo negócio**. Nenhum tipo de projeto é codificado como profissão ou categoria obrigatória.

## O que existe nesta etapa

- Projetos com `id`, título, objetivo, observações, status (ativo, pausado, arquivado), datas.
- Até 50 projetos; persistência no mesmo Durable Object já utilizado para estudos, tarefas, diário e finanças, isolado por UID Firebase, **sem novo banco ou migração**.
- Novos registros podem ter `projectId` opcional. Entradas antigas continuam válidas, sem `projectId`.
- Os resumos por projeto calculam tarefas abertas/concluídas, minutos de estudos, saldo manual e quantidade de registros. Sem inventar dados ou integrar sistemas não autorizados.
- Arquivamento não apaga documentos nem registros; reativação é possível. Novas entradas em projetos arquivados são bloqueadas até reativação; entradas já vinculadas podem ser editadas.
- UI web responsiva no painel existente: criar, editar, pausar, arquivar/reativar, escolher um projeto e visualizar seus registros.
- Rotas LAB: `GET /api/lab/workspace/projects`, `POST /api/lab/workspace/projects`, `GET /api/lab/workspace/projects/:id`, `PATCH /api/lab/workspace/projects/:id`.
- As rotas usam a validação Firebase + UID e `LAB_WORKSPACE_ENABLED` existentes. Não são públicas, não criam pastas no Drive e não solicitam credenciais externas.

## O que ainda NÃO existe

**A IA ainda não cria projetos automaticamente a partir de frases do chat.** Esta etapa constrói a infraestrutura segura para isso. A futura ponte com o Gemini deverá fornecer à IA ferramentas estruturadas para **propor** projeto/registro/atividade, solicitar confirmação humana e só então chamar as APIs privadas, nunca tratar um `approved:true` gerado pela própria IA como autorização.

Esboço de contrato para etapa posterior, apenas documento (não ativado):

1. Usuário: “SIGMA, voltei a vender carros e quero um projeto para acompanhar clientes, tarefas e negociações”.
2. IA identifica intenção e solicita informações necessárias. Pode consultar projetos atuais **sem mudar dados**.
3. IA oferece uma **prévia**: título, objetivo, primeiras tarefas, estrutura desejada.
4. O backend armazena proposta com ID e estado `pending`, separada do modelo.
5. A pessoa confirma explicitamente a proposta por interação autenticada; backend executa as alterações relacionadas ao seu UID e gera auditoria.
6. IA apresenta apenas ações realmente concluídas. Nunca inventar que criou um arquivo, cliente, compromisso ou integração.

## Restrições

- Nenhum segredo no repositório, nenhum OAuth/Google/Notion acessado, nenhum deploy, merge ou contratação.
- A interface cria projetos por comandos explícitos do usuário; a interpretação conversacional será feita somente após validação da segurança da camada de ferramentas.
- O limite existente de 250 registros manuais **continua valendo**. Não prometer CRM comercial escalável antes da revisão dessa quota, consulta paginada e planejamento do modelo de dados.
- Dados financeiros inseridos manualmente não equivalem a lançamentos bancários conciliados.
- Propostas para clientes e negociações são apenas **registros genéricos** nesta etapa; não há um CRM com funil automático.

## Critérios para continuar

- TypeScript do frontend e do Worker compilando, testes passando, isolamento por UID e arquivamento preservando dados.
- Aprovação separada para publicar em LAB e validar visualmente pelo iPhone.
- Somente após isso implementar a ponte Gemini → propostas → confirmação → ações, com limites de custos e auditoria.
