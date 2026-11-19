# PROJETO: CRM ÁGIL + IA (CLIENTE PILOTO: MALAS SLZ)
> **Arquivo Central de Handoff & Estado do Projeto**
> Última atualização: 2026-11-19 | Plataformas: Antigravity + DeepSeek Harness
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
- [x] **Fase 10 - Índices de Performance e Unicidade no Banco**:
  - 11 estruturas novas no PostgreSQL: índices compostos que casam com as consultas reais (`leads(storeId, stage)`, `messages(conversationId, createdAt)`, `conversations(storeId, lastMessageAt)`, `dev_logs(storeId, createdAt/level)`, entre outros) e **unique `(storeId, shortcut)`** em `quick_replies`.
  - A unicidade do atalho agora é garantida pelo banco; a API mantém a pré-checagem amigável e converte `P2002` em **409**.
  - Banco: 26 índices no total (11 PKs + 15 de busca/unicidade). Dicionário atualizado com a seção 5.12 e planos de execução validados com `EXPLAIN`.
- [ ] **Fase 11 - Integração Evolution API (WhatsApp real)** — 🚧 **S1–S3 entregues, S4–S5 pendentes**: plano em [`docs/features/11-integracao-evolution-api.md`](./docs/features/11-integracao-evolution-api.md) e runbook em [`deploy/evolution/README.md`](./deploy/evolution/README.md). **Infra provisionada em 2026-11-18**: VM `e2-micro` (us-east1), Evolution API **v2.3.7**, Postgres local, Caddy + Let's Encrypt em `https://crm-evo-malas.duckdns.org` (HTTP 200 validado). **Schema aplicado**: `WhatsAppInstance`, `Message.externalId/status/error`, `Lead.phoneE164` (backfill 5/5), flags em `AIConfig`; migrations `0_init` + `20261118153000_whatsapp_onda1`. **S1** (`server/services/evolution.ts`) e **S2** (`/api/whatsapp/instance` + connect/logout/restart + refresh) entregues e validados contra a Evolution real; instância `crm-malas-slz` criada (`CONNECTING`) com webhook configurado para `https://crm-facil-ia.vercel.app/api/webhooks/evolution` (cabeçalho secreto) e 7 `DevLog`. **API na Vercel no ar (2026-11-18)**: `/api/health` → 200 `database: connected`, `/api/whatsapp/instance` → 200 — foram duas causas, 11 env vars ausentes (cadastradas em Production) e imports relativos sem `.js` sob `"type": "module"` (45 corrigidos). **S3 entregue em 2026-11-19**: `POST /api/webhooks/evolution` com segredo timing-safe, dedupe por `externalId`, Lead/Conversation/Message(CLIENT) em transação, `fromMe` → Message(AGENT) + pausa de 24h, status/QR da instância e ticks; validado com 15 casos local e em produção (latência 304 ms–3,1 s) e fixtures limpos. Faltam **S4** (envio real), **S5** (frontend) e as decisões D2 (chip) e D3 (modo da IA) — brief com contrato de payload e plano de teste em [`docs/features/11-onda-1-implementacao.md`](./docs/features/11-onda-1-implementacao.md).

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
  git config --local credential.https://github.com.helper manager
  git remote set-url origin https://tiagozanardi@github.com/tiagozanardi/crm-facil-ia.git
  ```
  Sem o `openssl`, `git fetch/push` falha com `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`.
- **Atenção credencial (2026-11-18)**: a conta ativa do `gh` neste ambiente é **`osfilhosdojobs`**, que **não tem
  write** neste repositório (403). O Gerenciador de Credenciais (GCM) tem a credencial de **`tiagozanardi`**;
  por isso o helper é `manager` e o remote carrega o usuário na URL. Se algum ambiente voltar a usar
  `!gh auth git-credential`, o push passa a falhar com 403 (ou trava esperando prompt).
- **Observação DSH**: `npm run build` (esbuild), `prisma` (schema-engine) e `git push` (credential helper via `sh`)
  precisam rodar com permissão ampliada fora do sandbox padrão de escrita do workspace. O Prisma também falha
  com `SEC_E_NO_CREDENTIALS` no TLS nativo sob o sandbox — usar permissão ampliada nos comandos que conectam
  ao Supabase.

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
- [`docs/features/10-indices-e-unicidade-banco.md`](./docs/features/10-indices-e-unicidade-banco.md) (Índices compostos de performance, unique `(storeId, shortcut)` e tratamento de `P2002` na API).
- [`docs/features/11-integracao-evolution-api.md`](./docs/features/11-integracao-evolution-api.md) (🚧 **Parcial** da integração Evolution API: arquitetura, modelo de dados, ondas de entrega; Onda 1 com S1–S3 entregues).
- [`docs/features/11-onda-1-implementacao.md`](./docs/features/11-onda-1-implementacao.md) (📝 **Brief da Onda 1**: estado atual, slices S1–S7, contratos, pegadinhas do ambiente e prompt para o próximo chat).

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
11. **Fase 10 publicada**: 11 novas estruturas de índice (incluindo unique `(storeId, shortcut)`), `db push` aplicado após checar 0 duplicatas, `P2002` tratado como 409 na API, `EXPLAIN` confirmando `Index Scan` e dicionário atualizado (26 índices no total).
12. **Pendências para a próxima rodada**: adotar `prisma migrate` (hoje só `db push`), retenção de `DevLog`, billing real por tenant, editar respostas rápidas/conhecimento existentes, RAG vetorial (pgvector), webhooks da Evolution API e testes automatizados de rota.
13. **Plano da Fase 11 (2026-11-18)**: levantado o estado real do código e escrito o plano da integração Evolution API em `docs/features/11-integracao-evolution-api.md` (3 ondas, `WhatsAppInstance`/`Message.externalId`/`Lead.phoneE164`, webhook, orquestração da IA, comparativo de hospedagem e 7 decisões). **Nada de código de produção foi alterado** — aguardando decisões D1–D7.
14. **Infra da Fase 11 pronta para executar (2026-11-18)**: D1 decidida (GCP e2-micro Always Free). Criados `deploy/evolution/` (`docker-compose.yml`, `Caddyfile.template`, `.env.example`, `bootstrap.sh` idempotente com swap/Docker/UFW/DuckDNS/HTTPS/backup, `backup.sh`, `README.md` com o runbook GCP completo) e `scripts/check-evolution.ps1`. Versão fixada em **Evolution API v2.3.7** (sem ativação de licença; 2.4+ exige) e porta 8080 não publicada. Próximo passo: pessoa executa Fases A–C; depois eu valido por HTTPS e implemento a Onda 1.
15. **Infra da Fase 11 no ar (2026-11-18)**: VM `e2-micro` em `us-east1-b` (IP 35.185.62.116), DuckDNS `crm-evo-malas.duckdns.org`, Evolution API **v2.3.7** + Postgres 16 + Caddy no Docker. HTTPS validado com **HTTP 200** (`{"status":200,...,"version":"2.3.7"}`), certificado Let's Encrypt emitido, portas 80/443 abertas. Bug encontrado e corrigido no caminho: `handle` do Caddy aceita **um** matcher (o template passava três paths) — correção no commit `a4c39b6`; comandos `docker compose` exigem `sudo` porque o `.env` é `600` do root.
16. **Schema da Onda 1 aplicado (2026-11-18)**: adotado `prisma migrate` com baseline `0_init` + migration aditiva `20261118153000_whatsapp_onda1` (enums `WhatsAppStatus`/`MessageStatus`, tabela `whatsapp_instances`, `messages.externalId/status/error`, `leads.phoneE164` + unique, flags em `ai_configs`). Backfill `npm run backfill:phones` rodou **5/5** e `npm run build` passou. O `prisma generate` reclamou `EPERM` ao trocar a DLL do engine porque há processo Node segurando o arquivo — o client JS foi atualizado (backfill e verificação usaram os campos novos); rodar `npx prisma generate` de novo com o dev server parado conclui limpo. Backup lógico pré-migration em `tmp/backup-pre-onda1.json` (gitignored).
17. **Credencial de push corrigida (2026-11-18)**: a conta ativa do `gh` neste ambiente é `osfilhosdojobs`, sem write no repositório (403); o push travava ou falhava. Ajustado para o Gerenciador de Credenciais (`credential.https://github.com.helper manager`) e remote com `tiagozanardi@` na URL; `git fetch/push` voltaram a funcionar e o `main` está sincronizado.
18. **S1 da Onda 1 entregue (2026-11-18)**: `server/services/evolution.ts` com cliente HTTP tipado da Evolution **v2.3.7** (header `apikey`, `AbortSignal.timeout`, `EvolutionError` com `status` HTTP), métodos de instância/QR/webhook/`sendText`/`fetchInstances`/`findInstance`, helpers de telefone (`toEvolutionNumber`, `maskPhone`) e `DevLog` `EVOLUTION_API` (INFO/ERROR + latência, sem telefone completo nem texto). `.env.example` ganhou as 7 variáveis da Onda 1. **Contratos corrigidos contra a API real**: `sendText` usa `text` **plano** (a OpenAPI 2.3.7 documenta `textMessage: { text }` e o servidor responde `400`); `GET /webhook/find` devolve o webhook **sem envelope**; `sendText` em instância desconectada **espera a conexão** e só termina no timeout (504) — S4 deve checar `connectionState` antes. Smoke test descartável `11/11`, `tsc -p tsconfig.server.json` e `npm run build` verdes, **sem nenhuma escrita no banco do CRM** (o `DevLog` é exercitado no S2).
19. **S2 da Onda 1 entregue (2026-11-18)**: `server/routes/whatsapp.ts` registrado em `server/app.ts` — `GET /api/whatsapp/instance` (cache + diagnóstico), `?refresh=1` (consulta a Evolution e cai no cache com `stale` se ela não responder), `POST /api/whatsapp/instance` (idempotente; 201/200 + webhook), `/instance/connect` (QR por proxy), `/instance/logout` e `/instance/restart`. **Validado contra a Evolution real + Supabase**: instância `crm-malas-slz` criada (`CONNECTING`, QR ~13 KB), webhook `enabled=true` com 4 eventos e `x-evolution-webhook-secret`, 7 `DevLog` `EVOLUTION_API` (INFO, 170–5.827 ms) na Área Dev. `APP_PUBLIC_URL=https://crm-facil-ia.vercel.app` gravada no `.env` local (+ `EVOLUTION_ENABLED=false`, prefixo e segredo do webhook gerado). **Duas descobertas**: (a) o 1º `POST /instance` criou a instância na Evolution e falhou ao gravar no Supabase com `P1001` do pooler — o retry idempotente recuperou, e agora esses códigos viram **503 `DATABASE_UNAVAILABLE`** (não 500); (b) **a API na Vercel está quebrada** (`/api/health` → `500 FUNCTION_INVOCATION_FAILED`), então o webhook configurado ainda não entrega — falta colar as variáveis no projeto Vercel e redeploy.
20. **Diagnóstico da Vercel (2026-11-18)**: o projeto `zanardi/crm-facil-ia` estava com **zero variáveis de ambiente** (tela "No Environment Variables Added"). O build nunca esteve quebrado: todos os deployments aparecem `Ready`. As **11 variáveis** da Onda 1 foram cadastradas em **Production** e o `postinstall: prisma generate` entrou no `package.json` (commit `9655efa`). **Pegadinha**: variável de ambiente **não** entra em deployment já existente — é preciso Redeploy. Registro do bloco pronto: `tmp/vercel-env.txt` (gitignored).
21. **API da Vercel finalmente no ar (2026-11-18, commit `d102c68`)**: depois das envs, as rotas continuavam em `500 FUNCTION_INVOCATION_FAILED`. Diagnóstico (feito com um entry que devolvia o erro em JSON, já removido): o `package.json` da raiz tem `"type": "module"`, então a função `api/index.ts` é emitida como **ESM** — e ESM **não** resolve import relativo sem extensão. O bundle até continha `server/app.js`, `server/routes/*.js` etc., mas `import '../server/app'` morria com `ERR_MODULE_NOT_FOUND` e derrubava **todas** as rotas. Corrigido com `.js` explícito em **45 imports relativos** de `server/**` + no entry (`import('../server/app.js')`); `tsx` local resolve `.js → .ts` e continua funcionando. Bônus: `api/index.ts` agora captura a falha de boot e registra no log em vez de sumir. **Validado em produção**: `/api/health` → 200 `database: connected`, `/api/whatsapp/instance` → 200 com a instância `crm-malas-slz` e QR em cache, `/api/nao-existe` → 404 JSON do Express.
22. **S3 da Onda 1 entregue (2026-11-19, commit `9d4409c`)**: `server/routes/webhooks.ts` registrado em `server/app.ts` — `POST /api/webhooks/evolution` público com segredo timing-safe (sem `EVOLUTION_WEBHOOK_SECRET` → 503, segredo errado → 401), `MESSAGES_UPSERT` com dedupe por `externalId` e upsert de Lead/Conversation/Message(CLIENT) em transação, `fromMe` de humano → Message(AGENT) + pausa de `interventionPauseHours` + `DevLog CRM_WEBHOOK`, `CONNECTION_UPDATE`/`QRCODE_UPDATED` na `WhatsAppInstance` e `MESSAGES_UPDATE` nos ticks. Fail-closed para grupo/broadcast/`@lid`/mídia/sem-texto/sem-`externalId`, com o motivo no `DevLog` (sem telefone/texto). **Sem alteração de schema**. Validado com **15 casos `curl`** local e em produção (`crm-facil-ia.vercel.app`), latência **304 ms–3,1 s**; 2 leads e 11–15 DevLogs de fixture apagados e linha `whatsapp_instances` restaurada do snapshot (`CONNECTING`, QR 13.318 bytes). `tsc -p tsconfig.server.json` + `npm run build` verdes. **Pendências**: S4 (envio real — atenção à corrida do eco `fromMe`) e S5 (frontend); o payload real de `MESSAGES_UPSERT` ainda não apareceu (falta chip) e o parser tolerante está documentado no brief.
