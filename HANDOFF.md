# PROJETO: CRM ÁGIL + IA (CLIENTE PILOTO: MALAS SLZ)
> **Arquivo Central de Handoff & Estado do Projeto**
> Última atualização: 2026-11-18 | Plataformas: Antigravity + DeepSeek Harness
---

## 1. Visão Geral do Produto
CRM moderno, ultrassimplificado e inteligente para pequenos lojistas que vendem via WhatsApp e Instagram (1 a 5 atendentes).
- **Cliente Piloto**: *Malas SLZ* (malas de viagem, mochilas e acessórios). A proprietária é arquiteta, exigindo um visual impecável, refinado, clean e responsivo (mobile e desktop).
- **Banco de Dados**: PostgreSQL na nuvem (Supabase) gerenciado com Prisma ORM, 100% multi-tenant e pronto para busca vetorial / RAG na IA.
- **Catálogo de Produtos & Controle de Estoque**: Gestão simples com upload de fotos, valores normais e Pix, medidas ANAC (55x35x25cm), controle rápido de quantidade (+/-) e envio direto de propostas formatadas no chat do WhatsApp.
- **Escalabilidade**: Multi-tenant / White-label desde o nascimento. A identidade visual (logo, paleta de cores primária/secundária, nome) é 100% customizável em tela, inclusive com algoritmo que extrai a paleta das imagens de identidade da marca.
- **IA de Atendimento**: Foco em simplicidade para leigos. O lojista **não digita prompts**; ele apenas seleciona seletores visuais amigáveis (tom consultivo vs vendedor, intensidade de emojis, gírias locais, estratégia de chamada para ação - CTA) com simulador ao vivo.
- **Intervenção Humana Inteligente**: Quando um atendente humano responde no WhatsApp, a IA pausa automaticamente por 24h. No chat, há um botão de "Adicionar resposta humana ao conhecimento da IA", permitindo que o lojista ensine a IA continuamente.
- **Redirecionamento para Fechamento**: Botão e regra para transbordar leads quentes para grupos VIP ou vendedores humanos.
- **Área de Desenvolvedor / Admin Técnico**: Painel oculto de diagnósticos, logs de erros da Evolution API / LLM e consumo de tokens por loja.

---

## 2. Stack Tecnológica
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons (Deploy contínuo via Vercel).
- **Backend & Database**: PostgreSQL (Supabase) + Prisma ORM 6 + TypeScript (com pooler pgbouncer ativo).
- **Fase Futura**: Integração LLM (Gemini / GPT) + Webhooks da Evolution API (WhatsApp).

---

## 3. Status Atual de Desenvolvimento
- [x] Repositório Git configurado e sincronizado com o GitHub (`https://github.com/tiagozanardi/crm-facil-ia.git`).
- [x] Configuração do protocolo de transição entre plataformas (`AGENTS.md` e `HANDOFF.md`).
- [x] **Frontend Base**: Dashboard, Funil de Vendas, Kanban, WhatsApp Chats, Configuração de IA com Playground, Follow-up, Pós-Venda, Configurações de Marca com Extrator de Cores, e Área Dev de Logs.
- [x] **Catálogo de Produtos & Controle de Estoque**: Tela dedicada com upload de fotos, preços, desconto Pix, medidas ANAC e propostas no chat.
- [x] **Fase 2 - Modelagem de Banco de Dados**:
  - PostgreSQL criado no Supabase.
  - Schema Prisma completo com 10 modelos relacionais (Store, User, Product, Lead, Conversation, Message, AIConfig, AIKnowledge, QuickReply, FollowUpCampaign, DevLog).
  - Migração executada com sucesso (`db push`).
  - Seed executado (`npx prisma db seed`) populando todos os dados da loja Malas SLZ.
- [x] Build de produção testado e aprovado com TypeScript (`npm run build`).
- [x] **Fase 4 - Camada de API / Serviços (Backend Express Híbrido)**:
  - Express + Prisma em `server/` com 3 módulos de rota: `/api/health`, `/api/products` (CRUD completo + patch de estoque), `/api/store` (GET + PUT).
  - Frontend conectado à API com fallback resiliente (graceful degradation): se backend offline → mocks assumem; se online → dados reais do banco.
  - Atualização otimista nos produtos (UI atualiza primeiro, banco persiste em background).
  - Adaptador serverless em `api/index.ts` para deploy gratuito na Vercel (mesmo código Express).
  - Proxy Vite configurado (`/api → localhost:3001`) para desenvolvimento local sem CORS.
  - `tsconfig.server.json` dedicado ao backend; ambos passam `tsc --noEmit` sem erros.
  - `npm run server` sobe o Express local (porta 3001).
- [x] **Fase 5 - Integração OpenAI (GPT-4o-mini)**:
  - `server/services/openai.ts`: system prompt dinâmico construído a partir de AIConfig + produtos + quickReplies + RAG.
  - Rota `POST /api/ai/generate` com multi-turno, registra DevLog automático (tokens, latência, modelo).
  - Playground da IA (`AILanguageView`) renovado: respostas reais do GPT-4o-mini, bolhas multi-turno, metadados (tokens/latência), fallback resiliente com aviso se backend offline.
  - Modelo configurável via `OPENAI_MODEL` no `.env` (padrão: `gpt-4o-mini`).
- [x] **Fase 6 - IA no Chat + Rotas de Leads e Conversas**:
  - `server/services/ai.ts`: geração de resposta centralizada (usada pelo Playground e pelo chat), com prompt dinâmico, histórico multi-turno e DevLog.
  - `server/routes/leads.ts` e `server/routes/conversations.ts`: pipeline e chats persistidos no PostgreSQL (estágio, urgência, pausa da IA, mensagens e última mensagem).
  - Regra de intervenção humana no backend: atendente responde → IA pausa por `interventionPauseHours`; pausas vencidas voltam sozinhas.
  - ChatView ganhou o botão **"Responder com IA"**: responde com o histórico real do banco; se a IA estiver pausada, gera apenas uma sugestão no campo de texto.
  - `prisma/seed-leads.ts` (`npm run seed:leads`): seed idempotente com os leads de demonstração (Camila, Rodrigo, Beatriz, Marcelo e Juliana) — banco agora tem 5 leads e 15 mensagens.
  - Frontend hidrata leads e conversas do banco com fallback resiliente para os mocks.
  - **Validado com a chave real da OpenAI**: `POST /api/ai/generate` → 200 (gpt-4o-mini, 3746ms, 1403 tokens) e `POST /api/conversations/:leadId/ai-reply` → 201 (2328ms, 1392 tokens, mensagem gravada como `AI`), ambos com `DevLog` no PostgreSQL. Respostas citaram produto/preço Pix/estoque corretos.
- [x] **Fase 7 - Persistência da Configuração da IA e do Conhecimento**:
  - `server/routes/aiConfig.ts` (`GET/PUT /api/ai-config`) e `server/routes/knowledge.ts` (`GET/POST/DELETE /api/knowledge`).
  - Tom, emojis, gírias, CTA, limite de palavras e horários agora são salvos no PostgreSQL; o prompt lê do banco em toda geração (validado: mudar para "vendedor/expressivo" alterou a resposta real).
  - "Ensinar IA com esta resposta" grava em `AIKnowledge` com `source = HUMANO_CHAT`; a lista na tela "Linguagem da IA" vem do banco e permite excluir ensinamentos.
  - Atualização otimista com aviso quando o banco não aceita (backend offline).
- [x] **Fase 8 - Respostas Rápidas Persistidas**:
  - `server/routes/quickReplies.ts` (`GET/POST/DELETE /api/quick-replies`) com atalho único por loja (409 explicando o conflito), normalização do atalho e categoria validada.
  - Lista do chat e da tela "Linguagem da IA" agora vêm do banco; formulário ganhou seletor de categoria e a lista permite excluir (otimista com rollback em caso de erro).
  - `prisma/seed-quick-replies.ts` (`npm run seed:quick-replies`): seed idempotente que adicionou o atalho `/grupovip` — loja com 5 respostas rápidas.
- [x] **Fase 9 - Área Dev com Logs Reais e Diagnóstico por IA**:
  - `server/routes/devLogs.ts`: `GET /api/dev-logs` (filtros por nível/serviço/busca + resumo de 30 dias com tokens, custo estimado, latência média, erros e eventos por serviço) e `POST /api/dev-logs/:id/diagnose`.
  - Diagnóstico real via GPT-4o-mini com prompt de engenheiro sênior (causa raiz, impacto, severidade, ações), registrando a própria chamada como `DevLog`.
  - `DevAdminView` reescrita: cards com métricas do banco, filtros, busca com debounce, botão de atualizar e painel de diagnóstico com tokens/latência.
  - Intervenção humana no chat agora gera `DevLog` `INFO / CRM_WEBHOOK` (aparece na Área Dev).

---

## 4. Como Executar e Validar Localmente
1. **Iniciar servidor Backend (Express + Prisma)**: `npm run server` → http://localhost:3001
2. **Iniciar servidor Frontend (Vite com proxy para a API)**: `npm run dev` → http://localhost:3000
3. **Abrir o Painel Visual do Banco de Dados (Prisma Studio)**:
   ```powershell
   npx prisma studio
   ```
   Acesse: `http://localhost:5555` para ver todas as tabelas e dados da Malas SLZ.
4. **Popular os leads de demonstração (idempotente, não apaga nada)**: `npm run seed:leads`
5. **Popular as respostas rápidas (idempotente)**: `npm run seed:quick-replies`
6. **Chave da OpenAI**: coloque `OPENAI_API_KEY="sk-..."` no `.env` (arquivo gitignored). Sem ela, o Playground e o botão "Responder com IA" exibem aviso amigável em vez de quebrar.

---

## 5. Parceria entre Plataformas (GitHub como fonte da verdade)

- **Remoto**: `https://github.com/tiagozanardi/crm-facil-ia.git` (branch `main`).
- **Estado sincronizado**: em 2026-11-17 o `main` local foi alinhado e enviado ao GitHub. O remoto estava em `472442b`; foram publicados os commits da Fase 5 (`cf1f0a4`, `dc534c6`, `1a9dbd4`), o registro desta parceria (`e72b66b`) e a Fase 6. **Confira sempre com `git status -sb` antes de começar.**
- **Regra de ouro**: `git pull` antes de começar qualquer tarefa e `git push` ao concluir. Nunca deixar trabalho apenas em staging local — o outro agente não enxerga.
- **Configuração local necessária no Windows** (por causa do schannel + sandbox de terminal):
  ```powershell
  git config --local http.sslBackend openssl
  git config --local credential.https://github.com.helper "!gh auth git-credential"
  ```
  Sem isso, `git fetch/push` falha com `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`.
- **Observação DSH**: `npm run build` (esbuild) e `git push` (credential helper via `sh`) precisam rodar com permissão ampliada fora do sandbox padrão de escrita do workspace.

---

## 6. Histórico de Handoffs de Features
- [`docs/features/01-setup-multiagente-e-frontend-base.md`](./docs/features/01-setup-multiagente-e-frontend-base.md) (Setup multiagente e Frontend base).
- [`docs/features/02-catalogo-de-produtos-e-estoque.md`](./docs/features/02-catalogo-de-produtos-e-estoque.md) (Catálogo de produtos, estoque com fotos e integração com chat).
- [`docs/features/03-modelagem-banco-de-dados-postgresql-prisma.md`](./docs/features/03-modelagem-banco-de-dados-postgresql-prisma.md) (Modelagem completa do PostgreSQL no Supabase com Prisma ORM e Seed).
- [`docs/features/04-camada-api-backend-express-hibrido.md`](./docs/features/04-camada-api-backend-express-hibrido.md) (Backend Express híbrido com CRUD de Produtos e Store, fallback resiliente e adaptador Vercel Serverless).
- [`docs/features/05-integracao-openai-playground.md`](./docs/features/05-integracao-openai-playground.md) (Integração OpenAI GPT-4o-mini com system prompt dinâmico, multi-turno e DevLog automático no Playground da IA).
- [`docs/features/06-ia-no-chat-e-rotas-leads-conversas.md`](./docs/features/06-ia-no-chat-e-rotas-leads-conversas.md) (IA no Chat com histórico real, persistência de leads/conversas, pausa de intervenção humana e seed idempotente de leads).
- [`docs/features/07-persistencia-aiconfig-e-conhecimento.md`](./docs/features/07-persistencia-aiconfig-e-conhecimento.md) (Configuração da linguagem da IA e base de conhecimento/RAG persistidas no PostgreSQL, com validação e exclusão de ensinamentos).
- [`docs/features/08-respostas-rapidas-persistidas.md`](./docs/features/08-respostas-rapidas-persistidas.md) (Respostas rápidas no PostgreSQL com atalho único, categoria validada, exclusão na tela e seed idempotente).
- [`docs/features/09-area-dev-logs-reais.md`](./docs/features/09-area-dev-logs-reais.md) (Área Dev com logs e métricas reais do PostgreSQL, filtros e diagnóstico de logs por IA).

---

## 7. Documentação Técnica

- [`docs/database/dicionario-do-banco-de-dados.md`](./docs/database/dicionario-do-banco-de-dados.md) — **Dicionário do Banco de Dados**: visão geral do modelo multi-tenant, diagrama ER, fluxo de uma mensagem, as 11 tabelas com **todas as colunas explicadas**, os 12 enums, receitas SQL/Prisma validadas, acesso/manutenção (Studio, seeds, migrations), pegadinhas comuns e o que existe no schema mas ainda não é usado.

---

## 8. Diário de Execução — Sessões DeepSeek Harness

Registro curto do que foi feito, para o próximo agente auditar sem precisar de histórico de chat:

1. **GitHub destravado**: `schannel/SEC_E_NO_CREDENTIALS` resolvido com `http.sslBackend=openssl` + credential helper do `gh` (escopo local do repo). `git fetch`, `push` e `gh` funcionando.
2. **Trabalho órfão publicado**: a Fase 5 estava em *staging* havia tempo; foi revisada, validada (`tsc` + build) e publicada (`1a9dbd4`).
3. **Parceria documentada**: seção 5 deste arquivo (regras de pull/push + configuração do Git no Windows + particularidades do sandbox do DSH).
4. **Fase 6 implementada** (commit `87566e0`): serviço de IA centralizado, rotas de leads e conversas, pausa/retomada de IA no backend, botão "Responder com IA" no chat com modo sugestão, hidratação real do frontend e seed idempotente (`npm run seed:leads`).
5. **Banco populado**: 5 leads, 5 conversas, 15 mensagens (Supabase), mantendo os DevLogs reais.
6. **Validação com a chave real da OpenAI** (`.env` local, não versionado): Playground 200 / 1403 tokens / 3746ms e Chat 201 / 1392 tokens / 2328ms, com `DevLog` gravado. Mensagens de teste removidas do banco após a validação.
7. **Fase 7 publicada**: configuração da IA e base de conhecimento persistidas (`/api/ai-config`, `/api/knowledge`), com validação de payload, exclusão de ensinamentos e efeito real no prompt confirmado (tom "vendedor/expressivo" mudou a resposta da OpenAI).
8. **Fase 8 publicada**: respostas rápidas no PostgreSQL (`/api/quick-replies`), atalho único (409), categoria validada, seletor de categoria + lista com exclusão na tela, seed idempotente (`/grupovip`) — 5 atalhos ativos.
9. **Fase 9 publicada (2026-11-18)**: Área Dev conectada ao `DevLog` real, resumo de 30 dias (tokens, custo, latência, erros), filtros e diagnóstico de logs por GPT-4o-mini (validado: 485 tokens / 4.120 ms, com log do próprio diagnóstico) + `DevLog` automático de intervenção humana.
10. **Dicionário do banco (2026-11-18)**: documentação completa em `docs/database/`, extraída do banco real (11 tabelas, 122 colunas, 12 enums, 12 FKs, 15 índices) e com as receitas SQL/Prisma executadas e validadas.
11. **Pendências para a próxima rodada**: paginação/retenção de `DevLog`, billing real por tenant, editar respostas rápidas/conhecimento existentes, RAG vetorial (pgvector), webhooks da Evolution API e testes automatizados de rota.
