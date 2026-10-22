# Segurança da IA no FinTrack

Princípio que guia tudo: **a IA é um componente não confiável.** Tudo que entra nela (pergunta, descrição de transação) e tudo que sai dela (texto, nome de ferramenta, parâmetros) é tratado como entrada externa e validado como qualquer input de usuário. A defesa real é a arquitetura, ou seja, o que a IA *consegue* fazer, e não o texto do prompt.

Arquitetura e decisões de produto: [AI.md](AI.md). Segurança geral da API: [SECURITY.md](../SECURITY.md).

## 1. Escopo

| Funcionalidade | Rota | Status |
| --- | --- | --- |
| Sugestão de categoria | `POST /api/ai/categorize` | Implementada |
| Pergunte ao FinTrack | `POST /api/ai/ask` | Implementada |
| Status e opt-in | `GET /api/ai/status`, `PATCH /api/ai/settings` | Implementadas |
| Resumo mensal | `GET /api/ai/summary` | Planejada (tabela `ai_monthly_summaries` já existe) |

No FinTrack os dados pertencem ao **lar** (`householdId`), que pode ter mais de um membro. O isolamento de dados é por lar: o `householdId` vem da associação do usuário no banco, recarregada a cada requisição pelo `JwtStrategy`. Cota, opt-in e logs são por usuário (`userId`).

## 2. Provedor, plano e privacidade

- **Provedor:** Google Gemini API (Google AI Studio), SDK oficial `@google/genai` com versão fixada.
- **Plano:** gratuito. Custo zero e **nenhuma cobrança ativada** no projeto Google.
- **Modelo:** `gemini-3.5-flash-lite` (configurável em `GEMINI_MODEL`).

Termos do plano gratuito (conferidos em **22/10/2026** em ai.google.dev):

- O conteúdo enviado pode ser usado pelo Google para melhorar produtos, e revisores humanos podem lê-lo.
- O Google orienta a não enviar informação sensível, confidencial ou pessoal ao plano gratuito.
- O uso exige 18 anos ou mais. No Espaço Econômico Europeu, na Suíça e no Reino Unido só o plano pago é permitido.

**Decisão: opt-in + demo.**

- A IA vem **desligada para todo usuário** (`users.aiEnabled = false`).
- Ela só é ligada pelo próprio usuário em Configurações, depois de um aviso explícito: o que é enviado, para quem, e que o plano gratuito permite uso e revisão pelo Google.
- A conta demo (dados fictícios) vem ligada e não pode mudar a configuração.
- Quem não ativou nunca gera chamada ao provedor (teste e2e `a user who did not opt in never reaches the provider`).
- Sem IA, a categoria continua sendo sugerida por palavras-chave, sem sair do servidor.

### O que é enviado ao Gemini

| Funcionalidade | Enviado | Nunca enviado |
| --- | --- | --- |
| Sugestão de categoria | Descrição digitada (até 120 caracteres), valor, tipo (receita/despesa), nomes das categorias do lar daquele tipo | Nome, e-mail, ids, saldos, outras transações |
| Pergunte ao FinTrack | Pergunta (até 300 caracteres) e os **resultados das ferramentas**: totais, nomes de categorias e, em "maiores despesas", até 5 descrições com valor e data | Nome, e-mail, ids internos, contas, dados de outros lares |

A chave e os ids não aparecem em nenhum prompt. O `householdId` nunca é visto pelo modelo: o backend o aplica em cada consulta.

## 3. Ativos

| Ativo | Por que importa |
| --- | --- |
| Dados financeiros do lar | Privacidade (LGPD) e isolamento entre usuários |
| Chave da API Gemini | Vazamento permitiria usar a cota do projeto em nome do FinTrack |
| Cota gratuita do projeto Google | É **por projeto**, compartilhada por todos os usuários; um abusador pode esgotá-la para todos |
| Disponibilidade da API do FinTrack | A IA não pode derrubar o resto do app |
| Integridade dos dados | A IA não cria, altera nem apaga nada |

## 4. Pontos de entrada e atores

**Entradas:**

- a descrição em `/ai/categorize`;
- a pergunta em `/ai/ask`;
- dados que voltam ao modelo dentro dos resultados de ferramenta (descrições e nomes de categoria criados pelo usuário, por um parceiro do lar ou importados de extrato OFX/CSV);
- as respostas do provedor (texto, nome de ferramenta, parâmetros).

**Atores:**

- o usuário comum;
- o usuário autenticado malicioso, que tenta injeção, vazamento entre lares ou esgotar a cota;
- conteúdo hostil nos dados (injeção indireta);
- o atacante sem token;
- o próprio provedor, que pode falhar, demorar, bloquear ou devolver lixo.

## 5. Ameaças, controles e testes

Mapeamento para o [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/). Os testes citados estão em `backend/test/ai.e2e-spec.ts` (e2e), `backend/src/ai/**/*.spec.ts` (unitários) e `frontend/src/**/*.test.tsx`.

| # | Ameaça | OWASP | Controle | Teste |
| --- | --- | --- | --- | --- |
| T1 | Ver dados de outro lar | LLM01, LLM06 | Ferramentas **não têm** parâmetro de lar/usuário; `householdId` vem do token e é aplicado em todo `where` do Prisma; schema estrito rejeita campos extras | "a model that obeys an injection cannot reach another household" (fake que obedece e pede o lar do Bob) |
| T2 | Prompt injection direta | LLM01 | Pergunta enviada como dado em `<dados>…</dados>` com `<` escapado (não fecha a tag); system prompt declara o bloco como não confiável; tamanho limitado; caracteres de controle rejeitados; o estrago máximo é limitado por T3–T5 | "the question reaches the model wrapped as data"; validação 400 |
| T3 | IA executando ação ou SQL | LLM06 | Nenhum SQL gerado por IA; 4 ferramentas **somente leitura** escritas por nós; nenhuma de escrita; `automaticFunctionCalling` desligado no SDK; categorização só sugere, quem grava é o usuário | "never runs a tool that does not exist" |
| T4 | Ferramenta inventada, laço, chamadas demais | LLM06, LLM10 | Nome fora da lista = erro devolvido ao modelo + evento de segurança; no máximo **3 chamadas** e **4 passos**; esgotado o orçamento, o modelo recebe zero ferramentas | "caps tool calls at 3 and steps at 4" |
| T5 | Parâmetros absurdos vindos do modelo | LLM05 | zod `.strict()`: data real `AAAA-MM-DD` (rejeita 30/02 e timestamps), início ≤ fim, até 366 dias, `limite` 1–5, categoria procurada só no lar | 5 casos em "refuses tool arguments with…" |
| T6 | Saída fora do permitido (categoria inventada ou de outro lar, campos extras, confiança fora de 0–1) | LLM05 | Schema JSON com `enum` das categorias do lar **e** validação zod estrita no app (o Gemini não garante todas as restrições do schema); mapeamento nome → id pelo banco do lar; abaixo de 0,5 não sugere nem guarda em cache | 5 casos em "rejects an answer with…" |
| T7 | XSS com HTML na resposta | LLM05 | Texto renderizado como texto no React; sem `dangerouslySetInnerHTML` nem Markdown; o nome da categoria exibido vem da lista do lar, não do texto da IA | `ask.test.tsx` (script/img como texto); `transaction-form.test.tsx` (id fora do lar é ignorado) |
| T8 | Alucinação de números | LLM09 | Resposta acompanhada de `dadosUtilizados`, os números exatos das ferramentas, formatados pelo app; aviso "a IA pode errar" | `ask.test.tsx` |
| T9 | Injeção indireta (descrição hostil num extrato) | LLM01 | System prompt trata resultados de ferramenta como dado; mesmos limites de T3–T5 | Coberta pelos mesmos testes de T1/T4 |
| T10 | Esgotar a cota gratuita (do projeto inteiro) | LLM10 | Rate limit **por usuário** nas rotas de IA (`AI_USER_RPM`, 429); cota diária por usuário (`AI_USER_DAILY_QUOTA`); orçamento **global** por minuto e por dia (`AI_GLOBAL_RPM`/`RPD`, a 70–80% do limite real); toda tentativa é contada **antes** da chamada, inclusive a retentativa; cache por lar; regras antes da IA | "per-user requests per minute…", "per-user daily quota", "app-wide daily budget", "counts every call, including retries" |
| T11 | Provedor fora do ar, lento, bloqueando | LLM10 | Timeout (`AI_TIMEOUT_MS`), no máximo 1 retentativa com backoff só para falhas transitórias, disjuntor (3 falhas seguidas = pausa de 5 min); categorização cai para "sem sugestão" (200), "Pergunte" devolve 503 com motivo | "provider failure … falls back", "three provider failures in a row open the breaker" |
| T12 | Usuário provocar a pausa global com respostas ruins | LLM10 | Saída inválida ou bloqueada **não conta** para o disjuntor (só falhas de infraestrutura contam) | "…bad answers do not" |
| T13 | 429 do Gemini | LLM10 | Por minuto: 1 retentativa. Por dia: pausa até a meia-noite do Pacífico (reset da cota). `limit: 0`, chave recusada ou região sem suporte: IA desligada até alguém corrigir a configuração, sem insistir | `classify()` (15 casos) e e2e "pauses the AI until the reset", "turns the AI off without retrying" |
| T14 | Vazamento da chave | LLM02 | Só no backend, em variável de ambiente; vai ao construtor do SDK (que a envia em header, nunca em URL nossa); nunca em log, erro ou resposta; `.env` ignorado; gitleaks no CI | "passes the key to the SDK constructor only"; "logs metadata only" |
| T15 | Dados pessoais ao provedor | LLM02 | Opt-in com aviso; minimização (seção 2); demo com dados fictícios | "a user who did not opt in never reaches the provider" |
| T16 | Revelação do system prompt | LLM07 | O prompt não tem segredo nem dado de terceiros; vazá-lo não dá acesso a nada | — |
| T17 | Acesso sem autenticação | — | Guard JWT global | "requires a token" (4 rotas) |
| T18 | Logs com conteúdo sensível | LLM02 | Log JSON só com metadados: evento, funcionalidade, resultado, tentativa, latência, tokens, `userId`, provedor/modelo; nunca pergunta, descrição, resposta ou chave | "logs metadata only: never the question, the answer or a key" |
| T19 | Dependência vulnerável | LLM03 | `@google/genai` e `zod` com versão exata; `npm audit` no CI (backend e frontend); Dependabot nos dois; CodeQL | CI |

Nenhum teste nem job de CI chama o Gemini de verdade: o CI usa `AI_PROVIDER=fake`, sem chave. O único contato real é o `npm run ai:smoke`, manual e só local, com dados fictícios, que recusa rodar quando `CI` está definido.

## 6. Kill switch e degradação

`AI_ENABLED=false` desliga toda chamada ao provedor, sem deploy de código. O app segue funcionando:

| Situação | Categorização | Pergunte ao FinTrack |
| --- | --- | --- |
| IA desligada, sem opt-in ou cota do usuário esgotada | Só regras por palavras-chave e cache | 503 `disabled`, 403 `not_opted_in` ou 429 `user_quota` |
| Orçamento global (minuto ou dia) esgotado | Regras e cache | 429 `global_rate` / `global_quota` |
| Gemini 429 por dia | Regras e cache até a meia-noite do Pacífico | 503 `paused` |
| Gemini `limit: 0`, chave inválida, região | Regras e cache | 503 até corrigir a configuração e reiniciar |
| Gemini lento ou fora do ar | Sem sugestão (o usuário escolhe) | 503 com motivo, mensagem clara na tela |

## 7. O que muda num plano pago

- O conteúdo deixa de ser usado para melhorar produtos do Google. Isso permitiria considerar ligar a IA por padrão (ainda com aviso).
- Limites maiores: os orçamentos globais podem subir e o disjuntor de cota diária perde importância.
- Passa a existir **custo**. Seria preciso um teto de gasto (alerta e limite no Google Cloud) e o kill switch acionado por orçamento.
- Usuários no EEE, na Suíça e no Reino Unido poderiam usar a funcionalidade.

## 8. O que este projeto **não** garante

- Prompt injection não tem solução completa. O desenho limita o **estrago** (o modelo só lê o próprio lar, por 4 consultas fixas, e não escreve nada), não a tentativa.
- O modelo pode errar a categoria ou entender mal a pergunta. Por isso a categoria é só sugestão e a resposta vem com os dados reais ao lado.
- Os contadores por minuto e o disjuntor ficam em memória: com mais de uma instância do backend, cada uma teria os seus. A cota diária fica no banco e vale para todas.
- O provedor é um terceiro: disponibilidade, mudanças de modelo e política de dados dependem dele.

## 9. Perguntas de entrevista

**Como você impede que a IA veja dados de outro usuário?**
O modelo não escolhe de quem são os dados. As ferramentas não têm parâmetro de lar; o backend aplica o `householdId` do token em toda consulta. Mesmo um modelo que "obedeça" a injeção só consegue consultar o próprio lar, e há teste com um provedor falso fazendo exatamente isso.

**Por que não deixar a IA gerar SQL?**
Porque aí a segurança dependeria do modelo acertar sempre. Com uma lista fechada de 4 consultas somente leitura, parametrizadas e validadas, o pior caso é uma resposta errada, nunca um `DROP TABLE` ou um vazamento.

**O schema do Gemini já não garante a saída?**
Não por completo: a documentação recomenda validar os valores no app, e algumas restrições do schema não são aplicadas. Por isso o zod valida de novo no backend, de forma estrita.

**Como lidar com uma cota gratuita compartilhada por todos?**
Três camadas: por usuário (por minuto e por dia), global (por minuto e por dia, abaixo do limite real) e reação aos 429 do Google conforme o tipo. Regras e cache vêm antes da IA para gastar menos.

**E se a chave vazar?**
Ela só existe no ambiente do backend. Nunca vai para log, resposta nem URL, e há teste e gitleaks no CI. Se vazar, basta revogar no AI Studio e trocar a variável no Render, sem deploy. Como não há cobrança ativada, o dano máximo é esgotar a cota gratuita.
