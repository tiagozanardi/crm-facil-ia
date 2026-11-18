# Fase 11 — Onda 1: Brief de implementação (código)

> **Status**: infraestrutura e schema prontos; **código pendente**. Este arquivo é o ponto de entrada
> para quem for implementar a Onda 1, sem precisar do histórico do chat que montou a infra.
> O plano completo/arquitetura está em [`11-integracao-evolution-api.md`](./11-integracao-evolution-api.md);
> o runbook da VM em [`../../deploy/evolution/README.md`](../../deploy/evolution/README.md).

---

## 1. Estado atual (2026-11-18)

| Item | Estado |
|---|---|
| VM GCP `e2-micro` (us-east1) | ✅ no ar, IP `35.185.62.116` |
| Evolution API | ✅ **v2.3.7** em `https://crm-evo-malas.duckdns.org` (HTTP 200) |
| Postgres 16 + Caddy/TLS + backup | ✅ no ar; `docker compose` exige `sudo` |
| Schema Onda 1 | ✅ migrations `0_init` + `20261118153000_whatsapp_onda1` aplicadas |
| Backfill `Lead.phoneE164` | ✅ 5/5 (`npm run backfill:phones`) |
| `npm run build` | ✅ verde |
| Código da integração | ❌ **nada implementado ainda** |

O `.env` local (gitignored) já tem `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` válidos, além de
`DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY` e `OPENAI_MODEL`.

**Decisões fechadas**: D1 (GCP), D4 (backend na Vercel), D6 (`prisma migrate`).
**Pendentes**: D2 (chip dedicado), D3 (IA automática × sombra), D7 (retenção — pode ficar para a Onda 3)
e a **URL pública do CRM na Vercel** (destino do webhook).

---

## 2. O que já existe no código (ganchos)

- `server/routes/conversations.ts` — grava mensagens, gera IA, aplica pausa de 24h; **não envia nada**.
- `server/services/ai.ts` / `openai.ts` — geração com prompt dinâmico (reaproveitar como está).
- `server/services/leadState.ts` — `pauseAIForLead`, `resumeAIForLead`, `resumeExpiredPauses`.
- `server/routes/devLogs.ts` + `DevAdminView` — `DevLog` já aceita `service = EVOLUTION_API`.
- `src/context/CRMContext.tsx` — hidrata 1x no mount, envio otimista, sem polling.
- `src/views/ChatView.tsx` — chat funcional, mas estático depois da carga.
- `prisma/schema.prisma` — `WhatsAppInstance`, `Message.externalId/status/error`, `Lead.phoneE164`,
  `AIConfig.autoReplyEnabled/replyDelaySeconds/dailyReplyLimit`.

---

## 3. Ordem de implementação (slices)

### S1 — Cliente `server/services/evolution.ts`
- Lê `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`; `assertEvolutionConfigured()` lança erro tipado (503).
- Timeout via `AbortSignal.timeout`, `EvolutionError { status, body }`.
- Métodos (API v2.3.7, header `apikey`):
  - `createInstance(name, webhookUrl, secret)` → `POST /instance/create`
  - `connect(name)` → `GET /instance/connect/{name}` (retorna `base64`, `code`)
  - `connectionState(name)` → `GET /instance/connectionState/{name}`
  - `setWebhook(name, url, secret)` → `POST /webhook/set/{name}`
  - `sendText(name, number, text)` → `POST /message/sendText/{name}` (`{ number, textMessage: { text } }`)
  - `restart(name)` / `logout(name)` / `fetchInstances()`
- `DevLog` `EVOLUTION_API` em sucesso (INFO, latência) e falha (ERROR), sem gravar telefone completo.

### S2 — Rotas `/api/whatsapp` (`server/routes/whatsapp.ts`) + registro em `server/app.ts`
- `GET /api/whatsapp/instance` → status, número, QR em cache, `lastSeenAt`.
- `POST /api/whatsapp/instance` → cria (idempotente) `crm-<store.slug>`, configura webhook e salva em `WhatsAppInstance`.
- `POST /api/whatsapp/instance/connect` → QR novo (atualiza cache).
- `POST /api/whatsapp/instance/logout` / `restart`.
- Nada de chave no frontend; QR sempre por proxy.

### S3 — Webhook `server/routes/webhooks.ts`
- `POST /api/webhooks/evolution`, público, com header secreto (`EVOLUTION_WEBHOOK_SECRET`, comparação timing-safe).
- `MESSAGES_UPSERT`: ignorar `fromMe`, grupos (`@g.us`), broadcast e mídia (MVP texto).
  - `externalId = data.key.id`; se já existe → 200 sem processar.
  - `phoneE164` a partir de `data.key.remoteJid`; upsert de `Lead` (NOVO/ATENDIMENTO_IA) + `Conversation` + `Message(CLIENT)`.
  - `fromMe` de origem externa (humano pelo celular) → `Message(AGENT)` + `pauseAIForLead`.
- `CONNECTION_UPDATE` → atualiza `WhatsAppInstance.status`/`lastSeenAt`.
- `QRCODE_UPDATED` → cache do QR.
- Sempre responder 200 rápido; processamento síncrono curto (Vercel 300s).

### S4 — Envio real em `conversations.ts`
- `POST /:leadId/messages` e `/ai-reply`: com `EVOLUTION_ENABLED=true` e instância `CONNECTED`,
  gravar `Message(PENDING)` → `sendText` → `SENT` + `externalId`; erro → `FAILED` + `error` + `DevLog`.
- Sem a flag, manter o comportamento atual (não quebrar a demo).

### S5 — Frontend
- `src/services/api.ts`: `getWhatsAppInstance`, `createWhatsAppInstance`, `connectWhatsAppInstance`, `logoutWhatsAppInstance`.
- `SettingsView`: seção **"Conexão WhatsApp"** (status, QR `<img src={base64}>`, botões Reconectar/Desconectar, aviso de risco).
- `ChatView`: polling de 5 s em `/api/conversations` (só com a aba visível) + refresh ao focar; ticks
  `PENDING/SENT/DELIVERED/READ/FAILED`; banner quando desconectado.

### S6 — Orquestração da IA (pode ser Onda 2)
- `server/services/whatsappFlow.ts`: `autoReplyEnabled`, debounce (`replyDelaySeconds`), reler a última
  mensagem do cliente antes de responder, `dailyReplyLimit`, janela de horário e kill switch.
- Sem `autoReplyEnabled`, o webhook só grava (não responde).

### S7 — Validação
- `npm run build` + `tsc --noEmit`.
- Webhook com fixtures reais (`curl`) — dedupe, `fromMe`, grupo, sem texto.
- E2E com chip: mensagem chega ≤5 s, resposta do CRM chega, IA pausa quando humano responde pelo celular.

---

## 4. Contratos auxiliares

- `EVOLUTION_ENABLED` (feature flag mestre), `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
  `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE_PREFIX` (`crm`), `APP_PUBLIC_URL` (URL pública do CRM).
- `Message.status`: `PENDING → SENT → DELIVERED → READ`, ou `FAILED`.
- `WhatsAppInstance.status`: `DISCONNECTED | CONNECTING | CONNECTED | ERROR`.

---

## 5. Pegadinhas do ambiente (importante)

- **`docker compose` na VM exige `sudo`** (o `/opt/evolution/.env` é `600` do root).
- **Prisma**: comandos que conectam ao Supabase precisam de **permissão ampliada** no DSH; sob o sandbox
  falham com `SEC_E_NO_CREDENTIALS` (TLS nativo).
- **`prisma generate`**: se houver dev server rodando, dá `EPERM` ao trocar a DLL; o client JS costuma
  atualizar mesmo assim. Parar o dev server e rodar de novo resolve.
- **Git push**: a conta ativa do `gh` é `osfilhosdojobs` e **não tem write** no repo. Usar o Gerenciador
  de Credenciais (`credential.https://github.com.helper manager`, remote com `tiagozanardi@`).
  Nunca voltar para `!gh auth git-credential`.
- **Evolution v2.3.7**: `/manager` bloqueado no Caddy (404) de propósito; porta 8080 não publicada.
  A API key do `.env` é a nova (rotacionada) — **não** usar a chave antiga que apareceu em print.
- **DNS**: `crm-evo-malas.duckdns.org` → `35.185.62.116`; cron do DuckDNS corrigido.

---

## 6. O que falta de input humano

1. **URL pública do CRM na Vercel** (ex.: `https://crm-facil-ia.vercel.app`) → `APP_PUBLIC_URL` e webhook.
   Se ainda não estiver deployado, testar local com `cloudflared` e trocar depois.
2. **D3**: IA automática (recomendado: começar com `autoReplyEnabled=false` e ligar após o checklist).
3. **D2**: chip dedicado comprado/ativado (necessário só no QR).
4. Variáveis na Vercel: `EVOLUTION_ENABLED`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
   `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE_PREFIX`, `APP_PUBLIC_URL`, `API_AUTH_TOKEN`.

---

## 7. Critérios de aceite da Onda 1

- [ ] Criar instância pelo CRM e conectar por QR.
- [ ] Mensagem real do celular aparece no chat em ≤5 s (sem duplicar).
- [ ] Resposta digitada no CRM chega no celular com tick de enviado.
- [ ] `EVOLUTION_ENABLED=false` mantém o comportamento atual (demo) sem erro.
- [ ] `DevLog` de `EVOLUTION_API` registra sucesso, falha e latência.
- [ ] `npm run build` e `tsc --noEmit` verdes.
- [ ] Doc da feature atualizado (Handoff/AGENTS) e commit semântico.

---

## 8. Prompt sugerido para o novo chat

> Leia `HANDOFF.md`, `docs/features/11-integracao-evolution-api.md` e
> `docs/features/11-onda-1-implementacao.md`. Continue a Fase 11 pela **Onda 1**, começando pelo
> **S1 (`server/services/evolution.ts`)**, sem alterar o schema (não há migration prevista).
> Use permissão ampliada para Prisma/build/push e me mostre o diff antes de qualquer mudança no banco.
> A URL da Vercel ainda não foi informada; implemente com `APP_PUBLIC_URL` e me pergunte no S3.
