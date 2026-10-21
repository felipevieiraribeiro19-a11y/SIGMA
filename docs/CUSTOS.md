# SIGMA — custo zero: o que é gratuito e o que é medido

Regra do projeto: nada pode gerar cobrança. Este documento registra, por serviço, o que sustenta o SIGMA hoje e onde está o único item com franquia mensal.

## Gratuito de verdade (sem cartão)

| Serviço | Uso no SIGMA | Limite do plano gratuito | Risco de cobrança |
|---|---|---|---|
| Firebase Auth (Google) | 1 usuário | login Google gratuito | nenhum |
| Firebase Hosting | site definitivo + canal `integracao` | franquia de armazenamento e tráfego mensal do Spark | nenhum, mas o canal de preview consome a mesma franquia |
| Cloudflare Workers | `/api/chat`, `/api/history` | 100 mil requisições/dia; Durable Object SQLite incluído no plano gratuito | nenhum; não há upgrade automático |
| Gemini API (nível gratuito) | respostas | limites de requisições por minuto e por dia do modelo | nenhum dentro do limite; erro 429 quando estoura |
| Google Calendar API + Drive API | agenda (7 dias) e nomes de PDFs recentes | cota gratuita do projeto; leitura somente | nenhum |
| Tavily (Researcher Free) | pesquisa web | 1.000 créditos/mês; `basic` = 1 crédito | nenhum; o SIGMA se limita a 400/mês, 15/dia e 2/min |

O SIGMA já aplica tetos próprios **abaixo** dos limites gratuitos: 5 chamadas/minuto e 60/dia por usuário para a IA, e os limites de pesquisa acima. Ou seja, quem estoura primeiro é a cota do app, não a do provedor — e a do app devolve erro claro, nunca cobrança.

## O único item com franquia: GitHub Actions

Este repositório é **privado**. Em repositório privado, minutos de Actions são medidos mesmo em plano gratuito — não são cobrados enquanto couberem na franquia mensal (2.000 minutos no plano Free, 3.000 no Pro). Ultrapassar gera cobrança por minuto.

Consumo medido em 21/10/2026 (últimos 100 execuções):

| Workflow | Execuções | Minutos |
|---|---|---|
| Verify (cada push) | 59 | 31,9 |
| Publicar canal de testes | 21 | 25,7 |
| Publicar site definitivo | 10 | 15,2 |
| Publicar cérebro no Cloudflare | 8 | 4,6 |
| Validar SIGMA (`main`) | 2 | 0,4 |
| **Total** | **100** | **77,9** |

Distribuição por dia: 0,4 min em 19/10, 14,8 min em 20/10 e **62,6 min em 21/10**. Um dia de correções intensas como o de hoje, repetido todos os dias, chegaria perto de 1.900 minutos no mês — no limite da franquia. Em ritmo normal (poucos pushes por dia), fica na casa das centenas e não há risco.

### Se um dia chegar perto do limite

Sem gastar nada, nesta ordem:

1. Tornar `sigma-preview` manual: hoje ele publica o canal `integracao` a cada push em `src/**` ou `public/**`, e é o segundo maior consumidor.
2. Reduzir o `check.yml` a `pull_request` e deixar push só para as branches de deploy.
3. Fazer o merge com squash para diminuir pushes repetidos.

## O que as mudanças recentes custam

- `src/history.ts` (corte de contexto): roda no navegador. **Zero.**
- `validation.ts` (limite 12.000 → 16.000): uma constante. **Zero.**
- `sigma-firestore-rules`: só executa por acionamento manual, com confirmação digitada, e dura ~1 minuto. Na prática, quase nunca. **Zero recorrente.**
- `docs/`: texto. **Zero.**

Nenhuma delas adiciona serviço, plano, dependência paga ou chamada extra a provedor.

## Onde o "gratuito" cobra de outro jeito

Nível gratuito do Gemini pode usar o conteúdo enviado para melhorar o serviço, conforme os termos vigentes. Por isso o app avisa para não enviar dado pessoal sensível. Se um dia a privacidade do histórico for prioridade acima do custo, essa é a primeira decisão a rever — e ela custa dinheiro, não código.

Conferir valores atuais nos canais oficiais antes de qualquer mudança de plano: Firebase/Google Cloud (Spark), Cloudflare Workers (Free), Google AI Studio (limites do nível gratuito), Tavily (plano Researcher) e GitHub (billing de Actions).
