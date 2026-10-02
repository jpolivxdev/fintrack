# 💰 FinTrack

<div align="center">

[![CI](https://github.com/jpolivxdev/fintrack/actions/workflows/ci.yml/badge.svg)](https://github.com/jpolivxdev/fintrack/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jpolivxdev/fintrack/actions/workflows/codeql.yml/badge.svg)](https://github.com/jpolivxdev/fintrack/actions/workflows/codeql.yml)

**Controle financeiro pessoal (ou a dois), levado a sério.**

[🌐 Demo ao vivo](https://fintrack-flax-two.vercel.app) · [📘 Documentação da API (Swagger)](https://fintrack-api-qgr2.onrender.com/api/docs) · [🔒 Segurança](SECURITY.md) · [⚡ Testes de carga](backend/LOAD_TESTING.md)

</div>

---

Controle financeiro pessoal (ou a dois): receitas e despesas em contas e cartões, compras parceladas, orçamentos mensais, metas de economia, investimentos comparados com o CDI e a inflação, contas recorrentes, insights automáticos e uma agenda compartilhada. Construído mobile-first (instalável como PWA), em pt-BR e com valores em R$.

> 🧪 **Quer testar agora?** Acesse a [demo](https://fintrack-flax-two.vercel.app) com a conta `demo@fintrack.dev` / `Demo@1234`.
> <sub>Hospedado no plano gratuito do Render — a primeira requisição após um tempo ocioso pode levar ~50s pra "acordar" a API.</sub>

## ✨ Funcionalidades

- **Contas e cartões**: conta corrente, cartão de crédito, dinheiro e poupança, cada uma com seu próprio saldo, além de transferências entre elas (ex: pagar a fatura do cartão).
- **Parcelamento**: compras em até 24x. Cada parcela cai no seu próprio mês, e ao excluir é possível escolher "só esta / esta e as futuras / todas".
- **Transações recorrentes**: salário, aluguel e assinaturas como regras (semanais, mensais, anuais) que geram lançamentos automaticamente na data certa.
- **Orçamentos e metas**: limites mensais por categoria com alertas em 80%, e metas de economia com aportes, ritmo e previsão de conclusão.
- **Investimentos**: CDBs, Tesouro, ações, cripto... A renda fixa rende sozinha com o CDI e o IPCA oficiais do Banco Central (% do CDI, prefixado, IPCA+); ativos de mercado seguem os valores informados pela corretora. Acompanhe valor, lucro, "% do CDI", alocação e um gráfico mês a mês comparando com "100% do CDI" e "aportes + inflação".
- **Insights**: o mês resumido em frases simples ("Lazer acima do normal", "no ritmo atual o orçamento vai estourar", "2 contas nos próximos 7 dias").
- **Compartilhar com alguém**: um fluxo, dois níveis. "Só agenda" mostra os eventos compartilhados mantendo as finanças separadas; "agenda + finanças" une um lar (cada lançamento mostra quem registrou). Um código recebido mostra o que será compartilhado e por quem antes de aceitar, e sair do grupo leva de volta contas, histórico, metas e eventos.
- **Importação e exportação**: extratos bancários em OFX ou CSV, processados no navegador com pré-visualização; reimportar nunca duplica. Exportação em CSV compatível com Excel.
- **Início que responde "quanto ainda posso gastar?"**: o dinheiro livre do mês considerando o que ainda vai entrar e sair (salário, contas, parcelas, aportes agendados), por dia, com um humor visual que muda quando o mês aperta.
- **Recuperação de conta**: "esqueci minha senha" com link único enviado por e-mail.
- **Backup completo**: baixe todo o lar (household) em um único arquivo e restaure em qualquer lugar (ex: de uma instalação local para o app hospedado): contas, lançamentos com parcelas, regras recorrentes, orçamentos, metas, investimentos e eventos.
- **Mobile-first**: barra de navegação inferior, formulários em bottom-sheet, respeito às safe areas do iPhone e um PWA instalável que nunca armazena dados financeiros em cache.

## 🧱 Stack

### Backend — API REST

![NestJS](https://img.shields.io/badge/NestJS_12-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma_7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Swagger](https://img.shields.io/badge/Swagger_%2F_OpenAPI-85EA2D?style=for-the-badge&logo=swagger&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

### Frontend — Web app

![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-22B5BF?style=for-the-badge)
![Three.js](https://img.shields.io/badge/React_Three_Fiber-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

| Parte | Pasta |
| --- | --- |
| API REST | [`backend/`](backend) |
| Web app | [`frontend/`](frontend) |

## 🚀 Como rodar localmente

**API:**

```bash
cd backend
cp .env.example .env
npm install
npm run db:dev          # terminal 1: PostgreSQL local (sem precisar de Docker)
npm run prisma:deploy   # terminal 2: aplica as migrations
npm run prisma:seed     # dados de demonstração — demo@fintrack.dev / Demo@1234
npm run start:dev       # http://localhost:3000/api/docs
```

Com Docker em vez disso: `docker compose up -d db` substitui o `npm run db:dev`.

**Web app** (com a API rodando):

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173 — "Explorar com a conta demo"
```

Mais detalhes em [`backend/README.md`](backend/README.md).

## 🔒 Segurança

A segurança foi além do CRUD básico: cada item abaixo tem testes automatizados ([`security.e2e-spec.ts`](backend/test/security.e2e-spec.ts), mais de 40 casos) rodando no CI. Detalhamento completo com o raciocínio por trás de cada decisão: **[SECURITY.md](SECURITY.md)**.

- **Prevenção de BOLA/IDOR**: toda leitura *e escrita* é restrita ao lar (household) do usuário. A associação é checada de novo a cada requisição, então um parceiro removido perde o acesso na hora. Ids de outros lares retornam o mesmo 404 de um id inexistente, impedindo enumeração (testado em todos os recursos × verbos). Eventos privados da agenda continuam privados mesmo dentro do lar.
- **Autenticação**: bcrypt (custo 12), tokens de acesso de 15 min, refresh token com **rotação e detecção de reuso** (só o hash é armazenado), logout de verdade, HS256 fixo, tokens de usuários excluídos rejeitados imediatamente.
- **Rate limiting**: 5 tentativas de login/registro por IP a cada 15 min, mais um limite global por IP, identificado pelo IP real do cliente atrás do proxy (testado para confirmar que falsificar o `X-Forwarded-For` não contorna isso em produção).
- **Validação de entrada**: validação por whitelist rejeita campos desconhecidos (mass assignment), com formatos estritos para ids, datas e enums. Um bug de entrada com byte NUL causando erros 500 foi encontrado e corrigido.
- **Injeção e XSS**: apenas queries parametrizadas (payloads de SQL injection são armazenados como texto inerte). Texto livre é guardado literalmente e escapado na renderização; a API serve só JSON com `nosniff` e `CSP: default-src 'none'`.
- **Redefinição de senha feita direito**: link de uso único com 30 minutos de validade (só o hash é armazenado, o mais recente vence), mesma resposta exista ou não o e-mail, token no fragmento da URL pra nunca chegar aos logs do servidor, todas as sessões são encerradas ao redefinir.
- **Compartilhamento seguro**: códigos de convite (lar e agenda) são aleatórios, de uso único (reivindicados atomicamente), expiram em 48h, armazenados só como hash e com rate limit igual ao do login. Código errado, usado ou expirado retorna sempre o mesmo erro. Parceiros da agenda veem só os eventos marcados como compartilhados, nunca as finanças.
- **Dados externos, contidos**: CDI/IPCA vêm de uma URL fixa do Banco Central (sem input do usuário), com timeout, limites de sanidade em cada valor e cache em banco — uma instabilidade externa só deixa as taxas um pouco desatualizadas.
- **Importação/exportação**: a exportação CSV neutraliza injeção de fórmula de planilha (`=HYPERLINK(...)`). Importações têm limite de linhas/tamanho e deduplicação pelo id da transação bancária.
- **Hardening**: Helmet/CSP/HSTS explícitos, allowlist de CORS, variáveis de ambiente validadas na inicialização (segredos fracos ou de exemplo são recusados), erros 500 genéricos com `requestId` (stack trace só nos logs do servidor).
- **Observabilidade**: logs de segurança estruturados em JSON (logins falhos com e-mail mascarado, 401/403/429, reuso de refresh token) com **agregação por IP**, que reduziu um ataque de 260 mil requisições de ~216 mil linhas de log pra 56.
- **Supply chain**: `npm audit` de 9 para 0 vulnerabilidades, Dependabot, CodeQL e CI falhando em vulnerabilidades altas/críticas.

## ⚡ Performance

Testado sob carga com k6 (carga normal, picos de até 1.000 usuários virtuais, estresse de relatórios sobre 100 mil linhas, abuso de rate limit). Destaques: 0 erros em todos os níveis de carga, saturação em torno de 440 req/s por processo Node com o banco longe do limite, e um índice composto que elevou o throughput dos relatórios em 17%. Números completos e uma otimização que foi medida e revertida: **[LOAD_TESTING.md](backend/LOAD_TESTING.md)**.
