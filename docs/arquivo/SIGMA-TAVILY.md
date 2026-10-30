# SIGMA — pesquisa gratuita na internet via Tavily

## Situação
Implementação preparada na branch `sigma-work-integracao`. A busca só ficará ativa depois que o usuário configurar a chave Tavily e publicar o Worker; sem chave, o chat e a memória continuam funcionando normalmente.

## Criar a chave sem pagar
1. Acesse https://app.tavily.com e cadastre-se no plano **Researcher (Free)**, sem cartão.
2. No painel da Tavily, copie a **API Key**. NÃO envie a chave ao chat e NÃO a grave no GitHub.
3. Abra https://dash.cloudflare.com → Workers & Pages → Worker **sigma-cerebro** → Settings → Variables and Secrets → Add.
4. Nome: `TAVILY_API_KEY`; tipo **Secret**; valor: chave da Tavily (somente ela, sem "Bearer" ou aspas). Salve/implante a configuração.
5. Rode o workflow GitHub `.github/workflows/sigma-cloudflare.yml` selecionando `sigma-work-integracao`. O workflow usa `--keep-vars` para preservar os segredos existentes.
6. Rode `.github/workflows/sigma-production.yml` com a mesma branch para ativar links clicáveis de fontes no site definitivo. Não altere Firestore nem credenciais de Google já existentes.
7. Teste no SIGMA: "Pesquise no site da Prefeitura de Curitiba as novidades do concurso de Analista de Finanças e mostre as fontes".

## Como funciona
- Sem necessidade de atualizar o Firebase, regras ou o modelo Gemini.
- Pesquisa apenas quando solicitada ou quando a pergunta exige dados frescos (edital, notícias etc.).
- Apenas Tavily Search `basic`, custo de 1 crédito por consulta (não inclui serviços de extração / pesquisa avançada).
- Proteções internas: 2 consultas por minuto, 15 por dia e 400 por mês, independentes do limite de mensagens.
- Pesquisa recebe só a pergunta resumida e com e-mails e números longos removidos; **não** recebe o histórico completo nem os arquivos anexados.
- Fontes web são tratadas como dados não confiáveis, nunca como comandos; URLs HTTPS são validadas.
- Fontes são anexadas ao texto da resposta e armazenadas como parte da resposta no Firestore. O SIGMA não grava o conteúdo integral das páginas.
- O plano gratuito Tavily oferece 1.000 créditos por mês e não exige cartão. Os limites internos não alteram seu plano nem garantem ausência de cobrança se você mudar a conta Tavily para um plano pago.
- Erros na busca explícita são exibidos; sem chave o chat comum continua operacional.
- Não há monitoramento automático em segundo plano nesta etapa: a pesquisa ocorre quando o usuário conversa.

Documentação oficial: https://docs.tavily.com/documentation/api-reference/endpoint/search e https://docs.tavily.com/documentation/api-credits .
