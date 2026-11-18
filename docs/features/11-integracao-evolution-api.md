# Feature Handoff: Integração Evolution API (WhatsApp real)
- **Data**: 2026-11-18
- **Agente / Plataforma**: DeepSeek Harness
- **Status**: 📝 **Planejamento** (nada implementado ainda — aguardando decisões do responsável)

> Este documento é o **plano** da Fase 11. Ele será atualizado para "Concluído/Parcial" conforme
> cada onda for entregue, seguindo o template do `AGENTS.md`.

---

## 1. Objetivo da Feature

Tirar o CRM do modo "demo/mock" no atendimento e conectá-lo ao WhatsApp real:

1. O lojista **conecta o número** por QR Code dentro do CRM (sem terminal, sem Docker na mão).
2. Toda mensagem que chega no WhatsApp aparece **no chat do CRM** (e no funil/kanban).
3. O **atendente humano responde pelo CRM** e a mensagem sai de verdade no WhatsApp.
4. A **IA responde sozinha** respeitando as regras já existentes (tom, horário, pausa de 24h
   após intervenção humana, base de conhecimento, estoque/preços).
5. Quando o humano responde **pelo celular** (fora do CRM), a IA percebe e pausa sozinha.
6. Tudo isso aparece na **Área Dev** (`DevLog` com `service = EVOLUTION_API`) e no status de conexão.

O que **não** entra nesta fase (fica para a Fase 12/13): grupos, áudio/transcrição, campanhas em massa,
Instagram, multi-tenant com login de verdade, billing.

---

## 2. O que já existe (ganchos que vamos reaproveitar)

| Peça | Onde | Situação |
|---|---|---|
| Modelos `Lead`, `Conversation`, `Message`, `DevLog` | `prisma/schema.prisma` | Prontos, mas sem ID externo nem telefone normalizado |
| Serviço de IA com prompt dinâmico | `server/services/ai.ts` | Reutilizável como está |
| Pausa/retomada da IA (24h) | `server/services/leadState.ts` | Reutilizável como está |
| Gravação de mensagens | `server/routes/conversations.ts` | Grava no banco, **mas não envia nada** |
| Chat do CRM | `src/views/ChatView.tsx` + `CRMContext.tsx` | Otimista, hidrata 1x no mount, **sem tempo real** |
| Logs técnicos | `server/routes/devLogs.ts` + `DevAdminView` | Já aceita `service = EVOLUTION_API` |
| Deploy do backend | `api/index.ts` + `vercel.json` | Express serverless na Vercel (300s de duração no Hobby) |
| `Store.whatsappNumber` | schema | Texto decorativo (ex.: `+55 98 98845-1290`) — não é usado para enviar |

**Lacunas que esta fase fecha:** não existe cliente HTTP da Evolution, não existe webhook público,
não existe vínculo `loja ↔ instância`, não existe `externalId` nas mensagens, o chat não atualiza sozinho
e as rotas de escrita não têm autenticação (hoje qualquer pessoa com a URL poderia fazer a IA gastar tokens
e, depois desta fase, **mandar mensagem para clientes reais**).

---

## 3. Arquitetura alvo

```
[WhatsApp / chip da loja]
        │  (Baileys / multi-device, como um "WhatsApp Web")
        ▼
[Evolution API v2]  ── Docker, sempre no ar, HTTPS ──────────────────────────┐
   • /instance/create, /instance/connect (QR), /instance/connectionState     │
   • /message/sendText                                                       │
   • /webhook/set  (MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED,      │
                    MESSAGES_UPDATE, SEND_MESSAGE)                           │
        │ webhook HTTPS (com header secreto)                                 │
        ▼                                                                    │
[Express API]  (Vercel serverless — mantido nesta fase)                      │
   ├─ POST /api/webhooks/evolution   → valida, dedupe, grava, orquestra      │
   ├─ GET  /api/whatsapp/instance    → status + QR (proxy)                   │
   ├─ POST /api/whatsapp/instance/{reconnect|logout|restart}                 │
   ├─ POST /api/conversations/:id/messages  → grava + sendText               │
   ├─ POST /api/conversations/:id/ai-reply  → IA + sendText                  │
   ├─ server/services/evolution.ts   → cliente HTTP tipado + DevLog          │
   └─ server/services/whatsappFlow.ts → regras (debounce, pausa, horário)   │
        │                                                                    │
        ▼                                                                    │
[PostgreSQL Supabase]  ◄── Prisma ──►  [Frontend React na Vercel]            │
                                        • polling 5s no chat (MVP)           │
                                        • tela "Conexão WhatsApp" com QR     │
```

**Fluxo de uma mensagem recebida (caminho feliz):**

1. Cliente manda "tem a mala rosa?" no WhatsApp.
2. Evolution dispara `MESSAGES_UPSERT` para `https://<crm>/api/webhooks/evolution`.
3. O webhook valida o segredo, ignora `fromMe`, grupos e status, deduplica por `externalId`.
4. Faz upsert do lead (telefone E.164 normalizado), da conversa e da mensagem (`sender = CLIENT`).
5. Se a IA está ativa e dentro do horário: espera o *debounce* (ex.: 8s) para juntar mensagens picadas,
   confere se chegou mensagem mais nova, gera a resposta com `generateAIReply`, grava `Message(sender=AI,
   status=PENDING)` e chama `/message/sendText`.
6. Sucesso → `status = SENT` + `externalId` do WhatsApp. Falha → `FAILED` + `DevLog ERROR` + retry com backoff.
7. O frontend (polling 5s) mostra a conversa atualizada com os ticks de status.

**Fluxo de mensagem enviada pelo CRM:** `POST /messages` grava (`status=PENDING`) → `sendText` →
atualiza status; se o humano enviou, a pausa de 24h da IA é aplicada (regra já existente).

---

## 4. Escopo em 3 ondas (ordem de execução)

### 🌊 Onda 1 — Fundação (conectar, receber, enviar) — *fecha o MVP técnico*
- [ ] Subir a Evolution API v2 (Docker) no host escolhido, com HTTPS, API key forte, cache em memória
      (sem Redis) e `DATABASE_SAVE_DATA_INSTANCE=true` (sessão sobrevive a restart/deploy).
- [ ] `server/services/evolution.ts`: cliente tipado (`createInstance`, `connect`, `connectionState`,
      `setWebhook`, `sendText`, `restart`, `logout`, `deleteInstance`) com timeout, erros tipados e
      `DevLog` (INFO em sucesso, ERROR em falha, latência).
- [ ] Modelo `WhatsAppInstance` + migration (ver seção 5).
- [ ] `POST /api/whatsapp/instance` (cria instância + configura webhook), `GET /api/whatsapp/instance`
      (status + QR), `POST /api/whatsapp/instance/reconnect|logout|restart`.
- [ ] `POST /api/webhooks/evolution`: segredo no header, allowlist de eventos, dedupe por `externalId`,
      upsert lead/conversa/mensagem em transação; `CONNECTION_UPDATE` atualiza o status da instância;
      `QRCODE_UPDATED` guarda o QR em cache.
- [ ] `POST /api/conversations/:leadId/messages` e `/ai-reply` passam a **enviar** pelo WhatsApp
      (feature flag `EVOLUTION_ENABLED`, com fallback para o comportamento atual quando desligada).
- [ ] Tela **"Conexão WhatsApp"** em Configurações: status (conectado/desconectado/aguardando QR),
      QR Code, número conectado, botões Reconectar / Desconectar, última atualização.
- [ ] Chat: polling de 5s enquanto a aba está visível + atualização ao focar a janela; ticks
      enviando/enviado/entregue/lido/falhou; botão "reenviar" para `FAILED`; banner quando desconectado.
- [ ] `GET /api/conversations?since=<iso>` para polling incremental (evita baixar tudo a cada 5s).

**Critério de aceite da Onda 1:** mensagem real do celular aparece no CRM em ≤ 5s; resposta digitada no
CRM chega no celular; desconectar o celular do Wi-Fi e voltar não duplica mensagens.

### 🌊 Onda 2 — IA no WhatsApp (automático e seguro)
- [ ] `AIConfig.autoReplyEnabled` (liga/desliga por loja) + `replyDelaySeconds` (debounce, padrão 8s).
- [ ] `server/services/whatsappFlow.ts`: decide responder ou não com base em:
      `autoReplyEnabled`, `lead.aiStatus`, `pausedUntil`, horário (`activeHoursStart/End` e
      `respondOffHours`), mensagem do tipo suportado, limite diário de respostas por lead.
- [ ] Debounce real: espera, relê a última mensagem do cliente e só responde se ainda for a mesma
      (resolve "cliente mandou 4 mensagens picadas").
- [ ] Detecção de intervenção humana **pelo celular**: evento `fromMe` de mensagem que não foi enviada
      pelo CRM → grava como `AGENT` e pausa a IA por `interventionPauseHours` (mesma regra do chat).
- [ ] "Kill switch" na tela de conexão: pausar a IA de todos os leads da loja em 1 clique.
- [ ] Retry com backoff (2 tentativas) + `DevLog` `EVOLUTION_API`; dedupe de resposta por mensagem.
- [ ] Card na Área Dev: mensagens enviadas/recebidas, falhas de envio, latência do webhook.

**Critério de aceite da Onda 2:** cliente manda 3 mensagens seguidas → IA responde **uma** vez, com
contexto; humano responde pelo celular → IA cala por 24h; kill switch para tudo imediatamente.

### 🌊 Onda 3 — Endurecimento (antes do piloto com a loja)
- [ ] Autenticação mínima da API (`Authorization: Bearer <API_AUTH_TOKEN>`) nas rotas de escrita +
      rate limit por IP/loja (protege tokens da OpenAI e evita spam de mensagens).
- [ ] Idempotência/auditoria de webhooks (`WebhookEvent` com payload bruto e status) para depurar
      reentregas e eventos fora de ordem.
- [ ] Backup do Postgres da Evolution + rotina de reconexão automática + alerta se cair.
- [ ] LGPD: aviso na tela, retenção configurável, rotina de expurgo, mascarar telefone nos logs.
- [ ] Testes automatizados das rotas novas (fixtures de payload real da Evolution) e checklist E2E.
- [ ] Documentação final (`docs/features/11-...md` como Concluído + `HANDOFF.md` + dicionário do banco).

---

## 5. Modelo de dados proposto

```prisma
enum WhatsAppStatus {
  DISCONNECTED
  CONNECTING
  CONNECTED
  ERROR
}

model WhatsAppInstance {
  id             String         @id @default(cuid())
  storeId        String         @unique          // 1 instância por loja nesta fase
  instanceName   String         @unique          // ex.: "malas-slz"
  instanceToken  String?                          // API key específica da instância
  phoneNumber    String?                          // número conectado (E.164)
  status         WhatsAppStatus @default(DISCONNECTED)
  qrCodeBase64   String?         @db.Text         // cache do último QR
  qrUpdatedAt    DateTime?
  lastSeenAt     DateTime?                        // último CONNECTION_UPDATE recebido
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  store          Store           @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@map("whatsapp_instances")
}

enum MessageStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}

// Em Message:
//   externalId String? @unique        // key.id do WhatsApp (dedupe + correlação de status)
//   status     MessageStatus @default(SENT)
//   error      String?                // motivo da falha de envio
//   @@index([conversationId, createdAt]) já existe

// Em Lead:
//   phoneE164 String                  // só dígitos, ex.: "5598988451290"
//   @@unique([storeId, phoneE164])    // dedupe de lead por telefone

// Em AIConfig:
//   autoReplyEnabled  Boolean @default(false)  // nasce desligado: liga só depois do teste
//   replyDelaySeconds Int     @default(8)
//   dailyReplyLimit   Int     @default(200)    // proteção contra loop/custo

// Em Store:
//   whatsappInstance WhatsAppInstance?
```

**Migração dos dados atuais:** o seed usa telefones formatados (`(98) 99123-4455`). A migration precisa
de um backfill que gera `phoneE164` a partir de `phone` (assumindo DDI 55 quando faltar) antes de aplicar
o `unique`. Leads de demonstração sem telefone válido ficam com um sufixo artificial (`+seed-<id>`).

**Adotar `prisma migrate` agora** (hoje o projeto só usa `db push`): criar uma baseline do estado atual,
marcá-la como aplicada com `prisma migrate resolve --applied`, e daqui pra frente usar
`migrate dev` local / `migrate deploy` na Vercel. Isso evita alterar tabela de produção "no escuro".

---

## 6. Contratos de API (novos e alterados)

| Método | Rota | Uso |
|---|---|---|
| `POST` | `/api/webhooks/evolution` | Recebe eventos (público, autenticado por header secreto) |
| `GET` | `/api/whatsapp/instance` | Status, número, QR em cache, última atividade |
| `POST` | `/api/whatsapp/instance` | Cria/recria a instância da loja e configura o webhook |
| `POST` | `/api/whatsapp/instance/reconnect` | `GET /instance/connect/{name}` → devolve QR novo |
| `POST` | `/api/whatsapp/instance/logout` | Desconecta o celular |
| `POST` | `/api/whatsapp/instance/restart` | Reinicia a sessão na Evolution |
| `GET` | `/api/conversations?since=<iso>` | Polling incremental do chat |
| `POST` | `/api/conversations/:leadId/messages` | Agora envia de verdade (com `EVOLUTION_ENABLED`) |
| `POST` | `/api/conversations/:leadId/ai-reply` | Agora envia de verdade (com `EVOLUTION_ENABLED`) |

Variáveis de ambiente novas (`.env.example`):

```dotenv
# Evolution API
EVOLUTION_ENABLED="false"                 # feature flag mestre
EVOLUTION_API_URL="https://evo.seudominio.com"
EVOLUTION_API_KEY="chave-global-forte"
EVOLUTION_WEBHOOK_SECRET="segredo-do-webhook"
EVOLUTION_INSTANCE_PREFIX="crm"            # nomes: crm-malas-slz
API_AUTH_TOKEN="token-das-rotas-de-escrita" # Onda 3 (obrigatório antes do piloto)
```

---

## 7. Regras de negócio da orquestração

1. **Ignorar**: `fromMe` no recebimento (vira AGENT/intervenção, não CLIENT), grupos (quando
   `groupsIgnore`), `status@broadcast`, newsletters, reações, mensagens apagadas/editadas (tratar como
   `MESSAGES_UPDATE` só para ajustar o texto, se for simples).
2. **Dedupe**: `externalId` único em `Message`; se já existe, responde 200 e não faz nada.
3. **Lead**: telefone normalizado E.164 → se existe, reaproveita; se novo, cria com
   `stage = NOVO`, `aiStatus = ACTIVE`, `unreadCount = 1`.
4. **Resposta automática** só se: `autoReplyEnabled` + `aiStatus = ACTIVE` + fora de pausa +
   dentro do horário (ou `respondOffHours = true`) + abaixo do `dailyReplyLimit` + mensagem de texto
   suportada. Caso contrário: só grava e (opcional) marcа como pendente de humano.
5. **Debounce**: espera `replyDelaySeconds`, relê a última mensagem do cliente; se mudou, aborta
   (a próxima execução responde o conjunto).
6. **Humano no celular**: `fromMe` de origem externa ao CRM → grava como `AGENT` + pausa 24h.
7. **Envio**: grava `PENDING` → `sendText` → `SENT` + `externalId`; erro → `FAILED` + `DevLog` +
   retry 2x com backoff (nunca reenvia se o `externalId` já existe).
8. **Horário**: fora da janela, nenhuma resposta; opcional mensagem única de ausência
   (configurável depois, não no MVP).

---

## 8. Hospedagem da Evolution API — análise e recomendação

> Requisito: **sempre no ar** e, de preferência, **R$ 0** até validar.
> Fato central: **todo PaaS gratuito dorme** quando fica ocioso — e quando ele dorme, a sessão do
> WhatsApp cai e mensagens são perdidas. "Grátis + sempre no ar" só é garantido em **VM com free tier
> permanente** (ou cartão de crédito com cobrança zero).

| Opção | Custo | Sempre no ar? | Esforço | Observações |
|---|---|---|---|---|
| **Google Cloud e2-micro (Always Free)** | R$ 0 | ✅ sim | Médio (SSH + Docker) | 1 GB RAM, 30 GB, 1 GB egress/mês, regiões us-west1/us-central1/us-east1. Exige cartão. Free tier permanente. |
| **Oracle Cloud Always Free** | R$ 0 | ✅ sim | Alto (cadastro/capacity) | 2 OCPU / 12 GB ARM (cortado de 4/24 em jun/2026) ou 2× VM.1.Micro. Exige cartão; "out of capacity" e reclaim de ocioso são comuns; imagem oficial ARM é incerta. |
| **Fly.io** | ~US$ 0–5/mês | ✅ sim (não dorme) | Baixo (PaaS/Docker) | Não tem free tier; contas pessoais **com fatura < US$ 5/mês são isentas**. Machine 256 MB ≈ US$ 2,19; 512 MB ≈ US$ 4,39. Exige cartão; região `gru` pode custar mais. |
| **Render Free** | R$ 0 | ❌ dorme em 15 min | Baixo | Sem disco persistente; Postgres free é apagado em 30 dias. Bom só para teste. |
| **Koyeb Free** | R$ 0 | ❌ dorme ocioso | Baixo | Idem: não serve para produção. |
| **VPS barato (HostGator EVO pré-instalada / Contabo / Hetzner)** | ~R$ 20–30/mês | ✅ sim | Baixo | HostGator é parceira oficial e entrega EVO pré-instalada a partir de R$ 19,99/mês. Caminho "paga pouco e esquece". |
| **Sua máquina + Cloudflare Tunnel** | R$ 0 | ⚠️ só com o PC ligado | Baixo | Ótimo para **desenvolvimento**, não atende "sempre no ar". |

### Recomendação

**Para a validação: Google Cloud e2-micro (Always Free) rodando Evolution API v2 em Docker**, com:
- Postgres local no próprio VM (tudo em 1 GB; EVO com cache em memória, sem Redis, sem download de mídia);
- TLS automático via Caddy em um subdomínio gratuito (DuckDNS) — sem precisar comprar domínio;
- 3 containers: `evolution-api`, `postgres`, `caddy`; `restart: unless-stopped`; healthcheck;
- sessão salva no Postgres (`DATABASE_SAVE_DATA_INSTANCE=true`) → sobrevive a restart/atualização.

**Por quê:** é o único caminho realmente **R$ 0 e sempre no ar** com complexidade aceitável. Oracle é mais
potente, porém o cadastro e a migração ARM dão mais dor de cabeça do que o ganho.

**Plano B:** se a operação de VM incomodar, **Fly.io** (~US$ 0–5/mês, sem dormir, deploy por Docker) —
mesma arquitetura, menos SSH. **Plano C** (se o piloto virar produção): VPS HostGator de R$ 19,99/mês com
a EVO já instalada.

> **D1 decidida em 2026-11-18: Google Cloud e2-micro (Always Free).** Runbook operacional, artefatos de
> deploy e divisão de tarefas em [`deploy/evolution/README.md`](../../deploy/evolution/README.md).

---

## 9. Segurança e LGPD

- **Webhook**: header secreto (`x-evolution-webhook-secret`) + validação de `instanceName` conhecido;
  se não bater, 401 sem processar. Idealmente também IP allowlist (a EVO é seu próprio servidor).
- **Chaves**: `EVOLUTION_API_KEY` e `instanceToken` só no servidor. O frontend **nunca** vê a chave —
  o QR é servido por proxy.
- **Rotas de escrita**: hoje estão abertas. Antes de ligar o envio real, aplicar `API_AUTH_TOKEN`
  (Bearer) + rate limit. Sem isso, qualquer um com a URL manda mensagem para os clientes da loja.
- **Logs**: não gravar telefone completo nem conteúdo de mensagem no `DevLog` (mascarar `5598*****1290`).
- **LGPD**: o CRM passa a armazenar conversas de WhatsApp (dado pessoal). Inclui aviso na tela de
  conexão, política de retenção (ex.: 12 meses) e expurgo agendado.
- **OpenAI**: `dailyReplyLimit` por lead + `max_tokens` já limitado no serviço; um loop de webhook não pode
  virar uma conta de US$ 100.

---

## 10. Decisões pendentes (com recomendação)

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| **D1** | Onde hospedar a Evolution API | (a) GCP e2-micro Always Free · (b) Fly.io · (c) VPS pago ~R$ 20 · (d) Oracle Free · (e) Render/Koyeb free (dorme) | ✅ **DECIDIDO: (a) GCP e2-micro** — runbook em `deploy/evolution/README.md` |
| **D2** | Qual número do WhatsApp | (a) chip novo dedicado ao piloto · (b) número atual da Malas SLZ · (c) número virtual/eSIM | **(a)** — se o número atual for banido, a loja perde o canal principal |
| **D3** | A IA pode enviar sozinha desde o início? | (a) automático com kill switch · (b) 1–2 dias em "modo sombra" e depois automático · (c) sempre sugestão manual nesta fase | **(a)**, mas com `autoReplyEnabled=false` de fábrica e o teste ligado manualmente depois do checklist |
| **D4** | Onde roda o backend/webhook | (a) manter Express na Vercel · (b) mover para a mesma VM da EVO | ✅ **(a)** decidido por mim (reversível): já está pronto; mover só se aparecer timeout/cold start |
| **D5** | Escopo do MVP | (a) só texto · (b) texto + imagens · (c) completo (áudio, grupos, documentos) | **(a)** com (b) na sequência; áudio é o que mais consome tempo e o mais arriscado |
| **D6** | Migrations | (a) adotar `prisma migrate` com baseline · (b) continuar `db push` | ✅ **(a)** decidido por mim: vamos alterar tabelas com dados de produção |
| **D7** | Retenção de conversas (LGPD) | (a) 12 meses · (b) 6 meses · (c) indefinido | **(a)** — pode ser ajustado na Onda 3 |

---

## 11. Requisitos — o que só você pode fazer

Checklist do responsável (não é código):

- [ ] **D1–D7** decididos.
- [ ] Conta no provedor de hospedagem escolhido (com cartão de crédito para verificação; no GCP/Fly/Oracle
      o cartão é obrigatório mesmo quando o custo é zero).
- [ ] **Chip/número dedicado** ao piloto: comprar, ativar no WhatsApp e deixar em um celular que fique
      ligado (não precisa ser o celular principal — a EVO conecta como "dispositivo vinculado").
- [ ] Esse número **não pode estar em uso em outro sistema** (Chatwoot, outro CRM, etc.).
- [ ] Autorizar explicitamente o **risco de ban** do número (API não oficial — ver seção 12).
- [ ] Definir **quem atende** o WhatsApp durante o teste e o horário da janela (para acompanhar as
      primeiras mensagens em tempo real).
- [ ] Informar se o número tem **foto, nome e catálogo** configurados (a IA vai se apresentar em nome da loja).
- [ ] Definir **mensagem de boas-vindas/ausência** (opcional nesta fase).
- [ ] Acesso ao painel da Vercel e do Supabase (para variáveis de ambiente) — você já tem.
- [ ] Confirmar se o domínio `crm-facil-ia` já tem deploy ativo (URL que a EVO vai chamar no webhook).
- [ ] Se houver clientes reais no WhatsApp da Malas SLZ, avisar que o atendimento passará por IA no piloto.

---

## 12. Riscos e mitigação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Ban do número** (WhatsApp não permite clientes não oficiais) | Média | Número dedicado, sem disparo em massa, sem grupos, volume baixo, mensagens naturais, "aquecimento" (conversar normalmente por alguns dias antes), não usar link no primeiro contato, monitorar avisos no app |
| Sessão cai e para de receber | Média | Reconexão automática, `DATABASE_SAVE_DATA_INSTANCE=true`, restart automático do container, alerta na Área Dev, botão Reconectar |
| Mensagem duplicada / respondida 2x | Alta sem dedupe | `externalId` único + checagem de "última mensagem" antes de responder |
| Webhook chega fora de ordem ou reentregue | Média | Idempotência + `WebhookEvent` (Onda 3) + sempre reler o estado do banco |
| Cold start/timeout na Vercel | Baixa | 300s de duração no Hobby; processamento síncrono curto; plano B: mover para a VM |
| Custo de OpenAI descontrolado | Baixa | `autoReplyEnabled`, `dailyReplyLimit`, `max_tokens`, rate limit |
| Supabase free pausa por inatividade | Baixa/Média | Monitor de ping diário; se o piloto engatar, upgrade |
| Perda do banco da EVO | Média | Backup diário do Postgres local (dump para storage) |
| Sessão da EVO não sobreviver a restart sem Redis | Média | Testar na Onda 1 (item de aceite); se falhar, volume de 1 GB ou Redis grátis (Upstash) |
| Vercel Hobby é para uso pessoal | — | Uso comercial exige plano Pro (US$ 20/mês) — considerar antes de vender o CRM |

---

## 13. Testes e critérios de aceite (Definition of Done)

**Ambiente de desenvolvimento (antes de tocar no número do piloto):**
1. Subir EVO local em Docker + `cloudflared tunnel --url http://localhost:8080` para gerar webhook público temporário.
2. Conectar um número de teste (pode ser o seu) e validar: recebimento, envio, desconexão/reconexão.
3. Simular payloads reais com `curl` (fixtures salvas em `tmp/evolution-fixtures/`) e testar dedupe,
   `fromMe`, grupo, mensagem sem texto, status de conexão.

**Checklist no número do piloto:**
- [ ] QR conecta e o CRM mostra "Conectado" com o número certo.
- [ ] Mensagem do celular aparece no chat em ≤ 5s (com nome e telefone).
- [ ] Resposta digitada no CRM chega no celular (tick de enviado).
- [ ] IA responde com preço/estoque corretos quando `autoReplyEnabled` está ligado.
- [ ] IA não responde fora do horário nem quando pausada por intervenção humana.
- [ ] Humano responde pelo celular → IA pausa 24h e aparece na Área Dev.
- [ ] Desligar o celular do Wi-Fi e religar não duplica conversa.
- [ ] Kill switch para a IA imediatamente.
- [ ] Reiniciar o container da EVO → sessão volta sozinha (sem novo QR).
- [ ] Área Dev mostra os eventos `EVOLUTION_API` com latência e erros.
- [ ] `npm run build` e `tsc --noEmit` sem erros.

---

## 14. Estimativa e ordem de execução

| Etapa | Trabalho | Sessões |
|---|---|---|
| 1 | Infra: VM + Docker + TLS + EVO no ar + API key | 1 |
| 2 | Cliente Evolution + modelo `WhatsAppInstance` + migrations | 1 |
| 3 | Webhook + upsert + tela de conexão/QR | 1–2 |
| 4 | Envio real pelo CRM + polling do chat + status | 1 |
| 5 | Orquestração da IA (debounce, regras, pausa, kill switch) | 1–2 |
| 6 | Endurecimento (auth, retry, backup, LGPD, testes) | 1 |

Total estimado: **~15–25 h de trabalho**, distribuídas em 6–9 sessões, com um número de teste antes do
número do piloto.

---

## 15. Próximo passo imediato

1. 🧑 **Você:** Fases A e B do runbook (conta/projeto/VM + DuckDNS) e Fase C (bootstrap) —
   ver [`deploy/evolution/README.md`](../../deploy/evolution/README.md).
2. 🤖 **Eu:** valido a Evolution por HTTPS (`scripts/check-evolution.ps1`) e já implemento a Onda 1
   (schema + cliente + webhook + tela de conexão), testando com um número de teste.
3. 🧑 **Você:** cola as variáveis na Vercel (Fase E) e escaneia o QR quando a tela existir.
4. Só então conectamos o número do piloto e ligamos a IA (`autoReplyEnabled`).

**Continua em aberto (não bloqueia a infra):** D2 (chip dedicado), D3 (modo da IA) e D5 (escopo do MVP).

---

## 16. Infraestrutura: artefatos criados e divisão de trabalho

Criados em `deploy/evolution/` (uma VM Ubuntu 24.04 no GCP `e2-micro`):

| Arquivo | Função |
|---|---|
| `docker-compose.yml` | 3 serviços: `postgres` (256 MB), `evolution-api` v2.3.7 (560 MB) e `caddy`; porta 8080 **não** publicada; limites de memória e rotação de logs para caber em 1 GB / 30 GB. |
| `Caddyfile.template` | HTTPS automático via Let's Encrypt, proxy para `evolution-api:8080`, bloqueio de `/manager`, `/docs` e `/api-docs`. |
| `.env.example` | Modelo do `.env` da Evolution: Postgres, cache em memória, `DATABASE_SAVE_DATA_INSTANCE=true`, webhook global desligado, integrações off. |
| `bootstrap.sh` | Instalação idempotente: pacotes, swap de 2 GB, Docker, segredos, UFW, DuckDNS/cron, stack no ar, espera do HTTPS e backup diário. |
| `backup.sh` | `pg_dump` diário às 03:30 em `/var/backups/evolution`, retenção de 7 dias. |
| `README.md` | Runbook completo (GCP, DuckDNS, bootstrap, Vercel, operação, troubleshooting, custos, segurança). |
| `doctor.sh` | Diagnóstico de 1 comando (containers, memória/swap, disco, HTTPS, `.env` mascarado, logs, cron, backups) para colar no chat sem expor segredos. |
| `scripts/check-evolution.ps1` | Verificação local: HTTPS, versão e autenticação, sem imprimir a chave. |

**Divisão:** só você pode criar/autenticar a conta Google, aceitar faturamento, rodar o bootstrap na sua
VM, criar o subdomínio DuckDNS, colar as variáveis na Vercel, comprar/ativar o chip e escanear o QR.
Todo o resto (arquivos, scripts, código, chamadas de API e diagnóstico) é meu. Opcional "modo turbo":
chave SSH sua para eu operar a VM diretamente.

**Por que v2.3.7 e não a mais nova:** a partir da 2.4.0 a Evolution exige ativação de licença gratuita
(login no navegador). A 2.3.7 é estável, não exige licença e é posterior à 2.3.5, onde o CVE-2026-91997
(RCE não autenticado) foi reportado. Como defesa extra, a porta 8080 não é publicada e o `/manager` é
bloqueado no Caddy. Se um dia precisarmos da API oficial da Meta, subimos para 2.4.x e ativamos a licença
community (gratuita).
