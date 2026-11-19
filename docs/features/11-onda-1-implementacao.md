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
| API na Vercel | ✅ **200** em `/api/health` e `/api/whatsapp/instance` (envs + imports ESM corrigidos) |
| Código da integração | 🟡 **S1 e S2 concluídos** (cliente + rotas `/api/whatsapp`); S3–S5 pendentes |

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
- `server/services/evolution.ts` — **novo (S1)**: cliente HTTP tipado da Evolution v2.3.7 + `DevLog`.
- `server/routes/devLogs.ts` + `DevAdminView` — `DevLog` já aceita `service = EVOLUTION_API`.
- `src/context/CRMContext.tsx` — hidrata 1x no mount, envio otimista, sem polling.
- `src/views/ChatView.tsx` — chat funcional, mas estático depois da carga.
- `prisma/schema.prisma` — `WhatsAppInstance`, `Message.externalId/status/error`, `Lead.phoneE164`,
  `AIConfig.autoReplyEnabled/replyDelaySeconds/dailyReplyLimit`.

---

## 3. Ordem de implementação (slices)

### S1 — Cliente `server/services/evolution.ts` — ✅ **concluído em 2026-11-18**
- Lê `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`; `assertEvolutionConfigured()` lança erro tipado (503).
- Timeout via `AbortSignal.timeout`, `EvolutionError { status, body }` com `code`
  (`NOT_CONFIGURED | INVALID_INPUT | TIMEOUT | NETWORK | HTTP`) e `status` já no formato HTTP
  (503 não configurado, 504 timeout, 502 rede, demais = status da Evolution).
- Métodos (API v2.3.7, header `apikey`):
  - `createInstance(name, { qrcode, number, webhookUrl, webhookSecret })` → `POST /instance/create`
    (e, se veio `webhookUrl`, chama `setWebhook` em seguida);
  - `connect(name)` → `GET /instance/connect/{name}` (retorna `base64`, `code`, `pairingCode`);
  - `connectionState(name)` → `GET /instance/connectionState/{name}`;
  - `setWebhook(name, url, secret)` / `getWebhook(name)` → `POST /webhook/set/{name}` / `GET /webhook/find/{name}`;
  - `sendText(name, number, text)` → `POST /message/sendText/{name}` (`{ number, text }`);
  - `restart(name)` / `logout(name)` / `deleteInstance(name)` / `fetchInstances()` / `findInstance(name)`.
- `DevLog` `EVOLUTION_API` em sucesso (INFO, latência) e falha (ERROR), **sem** telefone completo
  (`maskPhone` → `5598*****1290`) e **sem** o texto da mensagem (só `textLength`); leituras de polling
  (`connectionState`, `fetchInstances`, `findInstance`, `getWebhook`) não geram log de sucesso.
- Helpers exportados para as próximas fatias: `toEvolutionNumber`, `maskPhone`, `isEvolutionEnabled`,
  `getEvolutionPublicConfig` (diagnóstico sem segredo), `buildWebhookPayload`, `EVOLUTION_WEBHOOK_EVENTS`.

**Contratos verificados contra a API real — não confiar cegamente na documentação oficial:**

| Ponto | Descoberta (2026-11-18, v2.3.7) |
|---|---|
| Corpo do `sendText` | A OpenAPI oficial documenta `textMessage: { text }`, mas o servidor exige **`text` plano**: com `textMessage` devolve `400 instance requires property "text"`. |
| `GET /webhook/find/{name}` | Devolve o webhook **direto** (`{ enabled, url, headers, events, webhookByEvents, webhookBase64 }`), sem o envelope `webhook` que o `POST /webhook/set` usa na requisição. |
| Envio sem conexão | `sendText` numa instância desconectada **não falha rápido**: fica aguardando a conexão e só termina no timeout do cliente (504). O S4 deve checar `connectionState` antes de enviar. |
| `DELETE /instance/delete/{name}` | Responde `{ status: "SUCCESS" }` e a instância some do `fetchInstances` em ~1–3 s (não é instantâneo). |
| Formato de erro | `{ status, error, response: { message: [["..."]] } }` — o cliente achata arrays aninhados e prioriza `response.message` (mais específico que `error`). |
| Cabeçalho secreto | `webhook.headers` é aceito no `POST /webhook/set` e devolvido no `find`: dá para mandar `x-evolution-webhook-secret` sem segredo na URL. |

**Validação do S1**: `npx tsc --noEmit -p tsconfig.server.json` e `npm run build` verdes; smoke test
descartável (`tmp/check-evolution-client.ts`, gitignored) **11/11** contra `https://crm-evo-malas.duckdns.org`
(config, helpers, `fetchInstances`, 404 tipado, `createInstance` + webhook + cabeçalho, `connect`/QR,
timeout do `sendText` e limpeza). **Nenhuma escrita no banco do CRM** nessa validação: o `DevLog` não foi
exercitado porque exige `storeId` (fica para o S2, quando a rota real chamar o cliente).

### S2 — Rotas `/api/whatsapp` (`server/routes/whatsapp.ts`) — ✅ **concluído em 2026-11-18**

Registradas em `server/app.ts` (`app.use('/api/whatsapp', whatsappRouter)`). Toda chamada ao cliente passa
`{ storeId, source: 'Conexão WhatsApp' }`, então o `DevLog` `EVOLUTION_API` é gravado de verdade.

| Método | Rota | Comportamento |
|---|---|---|
| `GET` | `/api/whatsapp/instance` | Lê do banco (status, número, QR em cache, `lastSeenAt`) + diagnóstico sem segredo (`hasApiKey`, `webhookUrl`, `webhookWarning`) |
| `GET` | `/api/whatsapp/instance?refresh=1` | Consulta `fetchInstances`, atualiza status/número/`lastSeenAt`; se a Evolution não responder, devolve o cache com `stale: true` e `refreshError` |
| `POST` | `/api/whatsapp/instance` | Cria (idempotente) `crm-malas-slz`, configura o webhook e faz upsert; **201** na criação e **200** quando já existia (`action` = `created` ou `existing`) |
| `POST` | `/api/whatsapp/instance/connect` | QR novo; **409** `INSTANCE_NOT_CREATED` sem instância e **409** `INSTANCE_MISSING` se a instância sumiu na Evolution |
| `POST` | `/api/whatsapp/instance/logout` | Desconecta, limpa QR/número, status `DISCONNECTED` (404 da Evolution é tolerado: o objetivo já está cumprido) |
| `POST` | `/api/whatsapp/instance/restart` | Reinicia a sessão, status `CONNECTING`, limpa o QR |

**Decisões tomadas**

- Nome da instância = `<EVOLUTION_INSTANCE_PREFIX>-<slug da loja>` → hoje `crm-malas-slz`.
- **`EVOLUTION_ENABLED` não bloqueia estas rotas**: conectar o número é pré-requisito para ligar o envio
  depois; a flag só vale para envio (S4). Assim dá para conectar o QR com o envio ainda desligado.
- QR sempre por proxy (`data:image/png;base64,...`); a chave nunca vai ao frontend. O `hash` devolvido
  pelo `create` (apikey da instância) **não** é gravado para não espalhar segredo no banco.
- Webhook = `<APP_PUBLIC_URL>/api/webhooks/evolution`, com `x-evolution-webhook-secret` nos `headers`.
  Sem `APP_PUBLIC_URL` a instância é criada mas o webhook **não** é configurado — a resposta traz
  `webhookWarning` explicando o que falta.
- Falhas do pooler do Supabase (`P1001/P1002/P1017/P2024`) viram **503 `DATABASE_UNAVAILABLE`** em vez
  de 500 (aconteceu no primeiro teste real).

**Validação real (2026-11-18)**: `GET`, `POST` create (idempotente nos dois sentidos), `connect`, `logout`,
`restart` e `?refresh=1` testados contra a Evolution v2.3.7 + Supabase. A linha `whatsapp_instances` foi
criada (`crm-malas-slz`, `CONNECTING`, QR de ~13 KB em cache) e **7 `DevLog` `EVOLUTION_API`** (INFO,
latência 170–5.827 ms) apareceram na Área Dev. Webhook conferido na Evolution: `enabled=true`, 4 eventos,
cabeçalho secreto presente.

**Pegadinha**: o primeiro `POST /api/whatsapp/instance` criou a instância na Evolution e **falhou ao gravar
no Supabase** (`P1001`, pooler). O retry caiu no caminho idempotente e gravou a linha — estado parcial é
recuperável chamando de novo, mas o QR da criação perdido só volta pelo `/connect`.

### S3 — Webhook `server/routes/webhooks.ts`
- `POST /api/webhooks/evolution`, público, com header secreto (`EVOLUTION_WEBHOOK_SECRET`, comparação timing-safe).
- `MESSAGES_UPSERT`: ignorar `fromMe`, grupos (`@g.us`), broadcast e mídia (MVP texto).
  - `externalId = data.key.id`; se já existe → 200 sem processar.
  - `phoneE164` a partir de `data.key.remoteJid`; upsert de `Lead` (NOVO/ATENDIMENTO_IA) + `Conversation` + `Message(CLIENT)`.
  - `fromMe` de origem externa (humano pelo celular) → `Message(AGENT)` + `pauseAIForLead`.
- `CONNECTION_UPDATE` → atualiza `WhatsAppInstance.status`/`lastSeenAt`.
- `QRCODE_UPDATED` → cache do QR.
- Sempre responder 200 rápido; processamento síncrono curto (Vercel 300s).

#### Contrato dos eventos (Evolution v2) — **confirmar com payload real antes de fechar**

```jsonc
// MESSAGES_UPSERT — mensagem recebida (ou enviada, quando fromMe = true)
{
  "event": "messages.upsert",
  "instance": "crm-malas-slz",
  "data": {
    "key": { "remoteJid": "5598988451290@s.whatsapp.net", "fromMe": false, "id": "3EB0C7E8F1234567" },
    "pushName": "João Silva",
    "message": { "conversation": "Oi, tem a mala rosa?" },   // ou { extendedTextMessage: { text } }
    "messageType": "conversation",                          // "extendedTextMessage" quando tem contexto/quote
    "messageTimestamp": 1735689600,
    "status": "PENDING",
    "instanceId": "…",
    "source": "android"
  }
}

// CONNECTION_UPDATE
{ "event": "connection.update", "instance": "crm-malas-slz",
  "data": { "instance": "crm-malas-slz", "state": "open" | "close" | "connecting", "statusReason": 200 } }

// QRCODE_UPDATED
{ "event": "qrcode.updated", "instance": "crm-malas-slz",
  "data": { "qrcode": { "base64": "data:image/png;base64,…", "code": "2@…" } } }

// MESSAGES_UPDATE — ticks de entrega/leitura (o `data` é ARRAY)
{ "event": "messages.update", "instance": "crm-malas-slz",
  "data": [{ "key": { "id": "3EB0…", "remoteJid": "5598…@s.whatsapp.net", "fromMe": true }, "status": "READ" }] }
```

Pontos de atenção: `data` pode vir como **array** em `messages.update`; o texto pode estar em
`message.conversation` **ou** `message.extendedTextMessage.text`; `remoteJid` pode terminar em
`@s.whatsapp.net` (pessoa) ou `@g.us` (grupo); `fromMe: true` é eco do próprio número (CRM **ou** celular).
Fonte: documentação/DeepWiki e issues da Evolution — **não** validado com payload nosso ainda (falta chip).

#### Plano de teste sem chip (a URL pública já responde)

```powershell
# 1. segredo recusado
curl.exe -i -X POST https://crm-facil-ia.vercel.app/api/webhooks/evolution -H "Content-Type: application/json" -d '{"event":"messages.upsert"}'
# esperado: 401

# 2. payload válido (troque o segredo pelo valor de EVOLUTION_WEBHOOK_SECRET no .env)
curl.exe -i -X POST https://crm-facil-ia.vercel.app/api/webhooks/evolution `
  -H "Content-Type: application/json" -H "x-evolution-webhook-secret: $env:EVOLUTION_WEBHOOK_SECRET" `
  -d '{"event":"messages.upsert","instance":"crm-malas-slz","data":{"key":{"remoteJid":"5598900000000@s.whatsapp.net","fromMe":false,"id":"FIXTURE-S3-001"},"pushName":"Teste S3","message":{"conversation":"teste do webhook"},"messageType":"conversation","messageTimestamp":1735689600}}'
# esperado: 200 e Lead/Conversation/Message criados como CLIENT

# 3. reenvio do MESMO id → 200 e nada duplicado
# 4. fromMe:true → Message(AGENT) + IA pausada (pausedUntil no futuro)
# 5. @g.us, status@broadcast e messageType de mídia → 200 ignorado
# 6. CONNECTION_UPDATE state=open → WhatsAppInstance CONNECTED + lastSeenAt
```

Limpar depois: apagar o `Lead` de fixture (cascade em `Conversation`/`Message`) e os `DevLog` de teste.

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
  `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE_PREFIX` (`crm`), `APP_PUBLIC_URL` (URL pública do CRM),
  `EVOLUTION_TIMEOUT_MS` (`15000`, entre 1000 e 60000 — usado pelo cliente do S1).
- `Message.status`: `PENDING → SENT → DELIVERED → READ`, ou `FAILED`.
- `WhatsAppInstance.status`: `DISCONNECTED | CONNECTING | CONNECTED | ERROR`.
- Todas as variáveis estão documentadas em `.env.example`.

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
- **Vercel + `"type": "module"` (armadilha que custou caro)**: a função `api/index.ts` é emitida como
  **ESM** e ESM **não resolve import relativo sem extensão**. Resultado: `FUNCTION_INVOCATION_FAILED`
  em **todas** as rotas, mesmo com o bundle completo. Todo import relativo de `server/**` e do entry
  precisa de **`.js` explícito** (`./routes/health.js`, `../server/app.js`). `tsx` local resolve
  `.js → .ts`, então `npm run server` continua igual.
- **Vercel + env vars**: salvar variável **não** atualiza deployment existente — é obrigatório
  **Redeploy** (Deployments → ⋯ → Redeploy). As 11 variáveis já estão em Production; bloco pronto em
  `tmp/vercel-env.txt` (gitignored). Conferir com `GET /api/health` → 200 e `database: connected`.
- **Diagnóstico de boot**: `api/index.ts` importa o app de forma dinâmica e, se falhar, registra o erro
  no log da função em vez de morrer em silêncio. Se a API cair de novo, o log diz o motivo.

---

## 6. O que falta de input humano

1. **URL pública do CRM na Vercel** — ✅ resolvido em 2026-11-18: `https://crm-facil-ia.vercel.app`.
   Foram **duas** causas para o `500 FUNCTION_INVOCATION_FAILED` em `/api/*`:
   (a) o projeto estava com **zero variáveis de ambiente** (11 cadastradas em Production; bloco pronto em
   `tmp/vercel-env.txt`, gitignored) e **redeploy** é obrigatório para a função ver env nova;
   (b) o `package.json` usa `"type": "module"`, então a função é emitida como **ESM** e **não resolve
   import relativo sem extensão** — `import '../server/app'` morria com `ERR_MODULE_NOT_FOUND` mesmo com
   `server/app.js` presente no bundle. Corrigido com `.js` explícito em **45 imports** de `server/**` e no
   entry (`api/index.ts`), que agora também registra falha de boot no log.
   **Validado em produção**: `/api/health` → 200 `database: connected`, `/api/whatsapp/instance` → 200 com
   `crm-malas-slz`. O webhook da Evolution já aponta para `.../api/webhooks/evolution` e começa a
   funcionar quando o S3 existir.
2. **D3**: IA automática (recomendado: começar com `autoReplyEnabled=false` e ligar após o checklist).
3. **D2**: chip dedicado comprado/ativado (necessário só no QR).
4. Variáveis na Vercel (todas as da Onda 1): `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`,
   `OPENAI_MODEL`, `EVOLUTION_ENABLED`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
   `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE_PREFIX`, `APP_PUBLIC_URL`, `EVOLUTION_TIMEOUT_MS`
   e `API_AUTH_TOKEN` (Onda 3). O `EVOLUTION_WEBHOOK_SECRET` precisa ser **o mesmo** do `.env` local,
   senão o webhook do S3 rejeita os eventos.
5. **Rotacionar a `EVOLUTION_API_KEY`** (opcional, recomendado): o valor apareceu num print de terminal
   durante a sessão do S2, e a chave é global (dá acesso a todas as instâncias da VM).

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
> `docs/features/11-onda-1-implementacao.md`. Continue a Onda 1 pelo **S3 (webhook
> `POST /api/webhooks/evolution`)**, sem alterar o schema (as tabelas e campos já existem).
> A API já está no ar na Vercel (`/api/health` → 200, `/api/whatsapp/instance` → 200) e o webhook da
> Evolution já aponta para `https://crm-facil-ia.vercel.app/api/webhooks/evolution` com o cabeçalho
> `x-evolution-webhook-secret`. Use permissão ampliada para Prisma/build/push e me mostre o diff antes
> de qualquer mudança no banco. Teste com fixtures via `curl` na URL pública (o plano está no S3) e
> limpe os dados de fixture no fim.

---

## 9. Histórico de sessões

| Data | Sessão | Entrega |
|---|---|---|
| 2026-11-18 | DSH | S1 (cliente Evolution) + S2 (rotas `/api/whatsapp`) + deploy da API na Vercel corrigido (envs + imports ESM) |
