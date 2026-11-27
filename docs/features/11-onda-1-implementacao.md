# Fase 11 — Onda 1: Brief de implementação (código)

> **Status**: infraestrutura, schema e **S1–S4 + S5a + S5b** prontos, além do **Modo Teste (Onda 1.5)**.
> A Onda 1 está completa no código; falta apenas a **validação com chip real** (conectar QR, enviar e
> receber de verdade).
> Este arquivo é o ponto de entrada para quem for implementar a Onda 1, sem precisar do histórico do
> chat que montou a infra.
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
| Código da integração | 🟢 **S1–S4 + S5a + S5b concluídos** + **Modo Teste (Onda 1.5)**; falta a validação com chip |

O `.env` local (gitignored) já tem `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` válidos, além de
`DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY` e `OPENAI_MODEL`.

**Decisões fechadas**: D1 (GCP), D4 (backend na Vercel), D6 (`prisma migrate`) e a URL pública do CRM
(`https://crm-facil-ia.vercel.app`, destino do webhook).
**Pendentes**: D2 (chip dedicado), D3 (IA automática × sombra) e D7 (retenção — pode ficar para a Onda 3).

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

### S3 — Webhook `server/routes/webhooks.ts` — ✅ **concluído em 2026-11-19**

Registrado em `server/app.ts` (`app.use('/api/webhooks', webhooksRouter)`), **sem alteração de schema**.
`POST /api/webhooks/evolution` é público e autenticado pelo header `x-evolution-webhook-secret`
(comparação timing-safe: sha256 + `timingSafeEqual`). Um `GET` na mesma rota responde **405** com
`secretConfigured` apenas para conferir o deploy.

**Comportamento por evento**

| Evento | O que faz |
|---|---|
| `MESSAGES_UPSERT` | Ignora grupo (`@g.us`), broadcast, newsletter, `@lid` sem alternativa e mídia/sem texto. Dedupe por `externalId` (`data.key.id`); lead por `(storeId, phoneE164)`; `Conversation`; `Message(CLIENT)` em transação. `fromMe` de humano → `Message(AGENT)` + `pauseAIForLead(hours)` + `DevLog CRM_WEBHOOK`. |
| `CONNECTION_UPDATE` | `open/connecting/close` → `WhatsAppInstance.status` + `lastSeenAt`; `open` limpa o QR e grava `phoneNumber` quando o payload traz `wuid/ownerJid/user`. |
| `QRCODE_UPDATED` | Cache do `qrcode.base64` + status `CONNECTING` (não rebaixa sessão já `CONNECTED`). |
| `MESSAGES_UPDATE` | Ticks por `externalId` (`PENDING/SERVER_ACK/DELIVERY_ACK/READ/PLAYED/ERROR`), atualizando `status/delivered/read`. |
| Outros | 200 `unsupported-event`, sem escrita e sem log. |

**Códigos de resposta**: 200 processado/ignorado/duplicado; 400 payload inválido (JSON ou sem
`event`); 401 segredo ausente/errado; 503 `WEBHOOK_NOT_CONFIGURED` (env ausente) ou
`DATABASE_UNAVAILABLE` (pooler caído, para a Evolution reentregar); 500 erro inesperado + `DevLog ERROR`.

**Decisões**

- `EVOLUTION_ENABLED` **não** bloqueia o recebimento (só o envio): o CRM registra mensagens com o
  envio ainda desligado.
- **Fail-closed**: nunca grava `Message` sem `externalId` (não haveria dedupe) nem lead com telefone
  inválido. O motivo (`group`, `broadcast`, `lid-jid`, `unsupported:imageMessage`, `missing-external-id`,
  `fromme-unknown-contact`, `invalid-phone`…) vai para o `DevLog` em `WARN`, com **nomes de campos** —
  nunca o texto nem o telefone completo.
- `fromMe` de contato que não existe no CRM **não cria lead** (evita poluir o funil com mensagem de saída).
- Parser tolerante (o contrato ainda não foi visto num payload real): `event` em `messages.upsert` ou
  `MESSAGES_UPSERT`; `data` objeto ou array; texto em `conversation` ou `extendedTextMessage.text`;
  desembrulha `ephemeralMessage`, `viewOnceMessage`, `documentWithCaptionMessage`, `editedMessage`;
  `@lid` tenta `remoteJidAlt`/`senderPn`/`participantPn`.
- Um `DevLog EVOLUTION_API` por evento (latência + resumo). O log é **aguardado** (uma linha, é a
  evidência na Área Dev); falha de log não derruba o webhook.
- Na mensagem `fromMe`, a mensagem é gravada **antes** da pausa: se a pausa falhar, o registro não se
  perde e a falha vira `DevLog ERROR`.

#### Contrato de referência (usado no parser; ainda não confirmado com payload real)

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
Fonte: documentação/DeepWiki e issues da Evolution. **Não** validado com payload nosso ainda (falta
chip); o parser cobre essas variações e registra a estrutura recebida quando não entende.

#### Validação executada (2026-11-19)

Bateria de 15 casos `curl`, rodada **local** (`npm run server` + Supabase real) e **em produção**
(`https://crm-facil-ia.vercel.app`), com o mesmo resultado:

| Caso | Resultado |
|---|---|
| segredo errado / header ausente | 401 |
| payload sem `event` | 400 |
| `CLIENT` com `conversation` | 200; Lead + Conversation + Message(CLIENT) |
| reenvio do mesmo `externalId` | 200; `duplicates: 1`, nada duplicado |
| `fromMe` | 200; Message(AGENT), `INTERVENCAO_HUMANA`, `pausedUntil` +24h |
| `extendedTextMessage` | 200; texto extraído |
| grupo / broadcast / mídia | 200 ignorado (`group`, `broadcast`, `unsupported:imageMessage`) |
| `CONNECTION_UPDATE` `open` | 200; `CONNECTED` + `lastSeenAt` |
| `QRCODE_UPDATED` | 200; QR em cache |
| `MESSAGES_UPDATE` (data em array) | 200; mensagem vira `READ` |
| evento desconhecido / instância desconhecida | 200 `unsupported-event` / `unknown-instance` |

Extras de fail-closed: `fromMe` de contato desconhecido, JID `@lid` e mensagem sem `key.id` → 200
ignorado com motivo; `ephemeralMessage` com texto → gravado. Latência: **304 ms–3,1 s** em produção
(o caminho `fromMe` é o mais longo: lead + conversa + transação + pausa + 2 logs) e 1–10,6 s local
(RTT do pooler). Dentro dos 300 s da Vercel.

**Limpeza**: os 2 leads de fixture (cascade em conversa/mensagens) e os `DevLog` do webhook foram
apagados; a linha `whatsapp_instances` foi **restaurada** de um snapshot (`CONNECTING`, QR de 13.318
bytes, `lastSeenAt` original). Estado final conferido: 5 leads, 15 mensagens, 1 instância.

**Exemplo de reprodução** (o script usado ficou em `tmp/`, gitignored; recriar se precisar):

```powershell
$secret = (Get-Content .env | Where-Object { $_ -match '^EVOLUTION_WEBHOOK_SECRET=' } |
  ForEach-Object { $_.Substring($_.IndexOf('=') + 1).Trim().Trim('"') })
$json = '{"event":"messages.upsert","instance":"crm-malas-slz","data":{"key":{"remoteJid":"5598999990001@s.whatsapp.net","fromMe":false,"id":"FIXTURE-S3-001"},"pushName":"Teste S3","message":{"conversation":"teste do webhook"}}}'
[System.IO.File]::WriteAllText("$PWD\tmp\payload.json", $json, (New-Object System.Text.UTF8Encoding($false)))
curl.exe -i -X POST https://crm-facil-ia.vercel.app/api/webhooks/evolution `
  -H "Content-Type: application/json" -H "x-evolution-webhook-secret: $secret" `
  --data-binary "@tmp\payload.json"
# 200 e Lead/Conversation/Message(CLIENT). Limpar o lead por phoneE164 (cascade) e os DevLogs
# com "Webhook Evolution" na mensagem; se testou CONNECTION_UPDATE, restaurar o status da instância.
```

> **Pegadinha do Windows PowerShell 5.1**: JSON com aspas em `curl.exe -d '...'` é reescrito pelo
> shell e chega inválido (o body-parser responde HTML 400). Use arquivo (`--data-binary "@..."`) ou
> `Invoke-RestMethod -Body` com `ConvertTo-Json`.

### S4 — Envio real em `conversations.ts` — ✅ **concluído em 2026-11-23**

Implementado em `server/services/whatsappFlow.ts` (`deliverOutboundMessage`) e usado por
`POST /:leadId/messages` e `/ai-reply`:

- com `EVOLUTION_ENABLED=true` e número E.164 no lead, a `Message` nasce **`PENDING`**, o
  `sendText` é chamado com o **número mascarado** no log e a mensagem vira **`SENT` + `externalId`**
  (ou **`FAILED` + `error`**, com `delivered=false`);
- a conexão é conferida antes: estado `CONNECTED` recente no banco é confiável por **2 min**; fora
  disso, `connectionState` ao vivo (o S1 mostrou que `sendText` numa sessão caída espera até o
  timeout de 15 s);
- sem a flag (ou sem `phoneE164`) o comportamento de demo continua: nada sai e a mensagem fica
  `SENT`/`delivered=true`;
- a resposta da API ganhou `delivery: { attempted, status, reason?, externalId?, error? }` e o
  frontend mostra toast quando a mensagem fica registrada mas **não** sai;
- **corrida do eco resolvida**: `tryAdoptOutboundEcho` casa o `MESSAGES_UPSERT` `fromMe` com a
  `Message(PENDING)` recente (mesmo texto, janela de 3 min), grava o `externalId` nela e **não
  pausa a IA** nem cria `AGENT` duplicado. `fromMe` sem eco pendente continua sendo intervenção
  humana (pausa de 24h).

**Modo Teste (Onda 1.5)**: como o envio precisava existir para a IA "responder apenas ao número de
teste", a mesma sessão entregou a allowlist por loja (`Store.testModeEnabled/testModeNumbers`),
o filtro total no webhook e a auto-resposta. Detalhes em
[`12-modo-teste-e-envio-real.md`](./12-modo-teste-e-envio-real.md).

**Validação**: `tsc` (frontend/backend) + `npm run build` verdes; **36 asserções** de E2E local
(filtro sem rastro, dedupe, eco, intervenção humana, API do modo teste) e **8 asserções** do caminho
de envio (recusa em ~3 s sem esperar o timeout; `whatsapp-connecting` sem chamar a OpenAI). **O
envio físico ainda não foi testado** — não há chip conectado (`crm-malas-slz` em `CONNECTING`);
o primeiro teste com chip deve confirmar a resposta no celular.

### S5a — Conexão WhatsApp em Configurações — ✅ **concluído em 2026-11-19**

**Arquivos**

- `src/services/api.ts`: tipos `WhatsAppInstance` / `WhatsAppInstanceStatus` / `WhatsAppEvolutionInfo`,
  `CreateWhatsAppInstanceResult` e `ConnectWhatsAppInstanceResult`; métodos `getWhatsAppInstance`,
  `createWhatsAppInstance`, `connectWhatsAppInstance`, `logoutWhatsAppInstance` e
  `restartWhatsAppInstance` (todos com `ApiRequestError` + `parseError`, no padrão de `sendLeadMessage`).
- `src/context/CRMContext.tsx`: estado compartilhado `whatsapp` / `whatsappLoading` / `whatsappError` e
  ações `refreshWhatsApp`, `createWhatsApp`, `connectWhatsApp`, `logoutWhatsApp`, `restartWhatsApp`.
  Um `ref` reutiliza o GET em andamento e um contador de requisição invalida respostas antigas depois de
  uma ação. O `addNotification` ganhou timer único (toast novo substitui o anterior) e cleanup.
- `src/components/WhatsAppConnectionCard.tsx` (novo): card completo de conexão.
- `src/views/SettingsView.tsx`: card no topo da coluna esquerda.
- `src/components/Header.tsx`: badge real no lugar do texto fixo "WhatsApp Conectado".
- `vite.config.ts`: ignora `**/.*tmpdir/**` e `**/*.tmp` no watcher (evita o `EBUSY` que derrubou o Vite
  quando o editor grava arquivos temporários dentro de `src/`).

**Comportamento**

- **Sem instância (`id === null`)**: o `CRMContext` **pré-provisiona em background** assim que o app
  carrega — `POST /instance` (idempotente) e, se o QR do `/instance` faltar ou estiver vencido, `POST /connect`.
  O card mostra "Preparando a conexão..." (sem clique) e, quando o QR fica pronto, ele aparece
  automaticamente. O botão "Criar conexão com WhatsApp" fica para retry/caso o auto-preparo falhe; se
  clicado durante o preparo, reaproveita a mesma promise. O QR recém-criado não é seguido de um
  `/connect` redundante.
- **CONNECTING**: QR grande (`<img src={qrCode}>`, data URI por proxy), instruções
  "WhatsApp > Aparelhos conectados > Conectar aparelho", horário de `qrUpdatedAt` + contagem de expiração.
  Polling de **5 s** no `GET /instance` **sem `?refresh=1`**, só com `document.visibilityState === 'visible'`;
  voltar ao foco da aba dispara um tick imediato. `?refresh=1` é usado apenas no mount da tela e no botão
  "Atualizar". Se o QR sumir ou passar de **30 s**, chama `/connect` de novo (cooldown de 15 s, `refs`
  contra concorrência). QR vencido **não é exibido**: fica o placeholder "Renovando o QR Code...".
- **CONNECTED**: número formatado (E.164 → `+55 (98) 98845-1290`), última atividade, "Reiniciar" e
  "Desconectar" com confirmação inline (sem `window.confirm`).
- **ERROR/DISCONNECTED com instância**: "Tentar novamente" (`/connect`) + "Reiniciar".
- **`webhookWarning`**: bloco de destaque (sem webhook o QR conecta, mas as mensagens não chegam);
  `stale`/`refreshError` aparecem como aviso com o último estado conhecido.
- **Risco**: texto pequeno sobre número dedicado, API não oficial (Baileys) e risco de banimento.
- **`evolution.enabled === false`**: informa que o **envio** está desligado (modo de teste), sem bloquear
  conectar/exibir o QR.
- Loading/disabled em todas as ações, toasts via `addNotification` e erros amigáveis inline.
- **Header**: verde "WhatsApp Conectado", âmbar "Aguardando conexão", cinza "WhatsApp desconectado"
  (no mobile, rótulos curtos "Conectado"/"Aguardando"/"Desconectado" para não quebrar a linha); clicar no
  status abre Configurações. O mesmo estado do card é usado (sem polling duplicado); ao voltar para a aba,
  o contexto revalida o status.

**Validação (2026-11-19)**

- `npx tsc --noEmit` e `npm run build` verdes (2112 módulos; bundle 406,70 kB / 112,73 kB gzip).
- Prints em **390 px** (780×1800 @2x) e **1440 px**: sem overflow horizontal (`scrollWidth === clientWidth`),
  header com badge âmbar e card com QR novo. Capturados em `tmp/s5-mobile.png` e `tmp/s5-desktop.png`
  (gitignored).
- Fluxos exercitados no navegador contra o backend local + Evolution real: QR inicial; "Gerar novo QR"
  (~3,9 s, toast + `qrUpdatedAt` novo); "Reiniciar" (~7,5 s no modo CONNECTING); **pré-provisionamento**
  com o GET mockado sem instância — o contexto criou/preparou sozinho (sem clique) e, ao abrir
  Configurações depois disso, o QR já estava visível em **201 ms**; abrindo a tela imediatamente, o
  estado "Preparando a conexão..." apareceu em **73 ms** e o QR ficou pronto em **~11,2 s** desde o
  reload (primeira preparação, com Evolution + pooler do Supabase); "Desconectar" testado com
  **CONNECTED mockado** (D2: chip dedicado ainda não existe), com o **POST real** de logout e transição
  para desconectado; "Reiniciar" a partir de desconectado voltou a `CONNECTING` com QR em **~9,8 s**.
  Estado final conferido no backend: `CONNECTING`, QR novo, `webhookWarning: null`. **Nenhum QR foi
  escaneado** e não houve alteração em `server/**` nem no schema.
- **Meta de ≤2 s**: atingida no caminho normal **depois do pré-provisionamento** (Configurações → QR em
  **201 ms**). A primeira preparação é em background e levou **~11,2 s** neste ambiente (create/QR da
  Evolution + concorrência com a carga inicial do app); nesse intervalo a tela mostra "Preparando a
  conexão...". O gargalo é a Evolution (`createInstance` com QR ~6,3 s; primeiro `connect` ~2,7 s), não o
  frontend. O auto-preparo roda **sem clique** assim que o app carrega; o `POST /instance` é idempotente.

### S5b — Chat em tempo real — ✅ **concluído em 2026-11-23**

- `ChatView`: polling de **5 s** em `GET /api/conversations` somente com a aba visível, refresh
  imediato ao abrir o chat e ao voltar o foco; ticks `PENDING/SENT/DELIVERED/READ/FAILED`; banner
  âmbar (`CONNECTING`) ou vermelho (`DISCONNECTED/ERROR`) com atalho para Configurações; auto-scroll
  no fim da conversa.
- `CRMContext`: `refreshConversations` com dedupe de requisição e merge otimista; `sendMessage`
  agora substitui a mensagem temporária pela mensagem real da API (`replaceMessage`).
- `src/context/conversationMerge.ts`: funções puras de merge de conversas e leads (contatos novos
  entram no topo; pausa/retomada da IA vinda do backend é espelhada).
- O status da conexão é revalidado a cada ~30 s dentro do polling (sem consultar a Evolution), para
  o banner refletir quedas/retomadas. Detalhes em
  [`13-s5b-chat-tempo-real.md`](./13-s5b-chat-tempo-real.md).

**Validação**: 17 asserções nas funções puras + 17 no E2E (`webhook → banco → GET → merge`), `tsc` e
`build` verdes.

**Pós-teste real (2026-11-23)**: com o chip conectado (`554898205773`) e `EVOLUTION_ENABLED=true`, o
número de teste `554896535640` recebeu **4 respostas automáticas** com preço Pix/estoque corretos e
latência de 8,3–9,7 s. O payload real de `MESSAGES_UPDATE` chegou com `keyId`/status numérico e era
ignorado (`missing-external-id`); o parser foi ajustado (`keyId`, `update.status`, status numérico
0–5) e validado com 19 asserções de fixture. Detalhes na seção 5 do
[`13-s5b-chat-tempo-real.md`](./13-s5b-chat-tempo-real.md). Falta confirmar no celular os ticks de
uma mensagem nova e a intervenção humana.

### S6 — Orquestração da IA (pode ser Onda 2)
- `server/services/whatsappFlow.ts`: já existe a **primeira fatia** usada pelo Modo Teste
  (`maybeAutoReplyToTestNumber`): debounce capado em 2 s, releitura da última mensagem, pausa da IA
  e envio com `PENDING`→`SENT/FAILED`. Falta generalizar: `autoReplyEnabled`, `dailyReplyLimit`,
  janela de horário, kill switch e mover a espera para uma fila (o webhook hoje é síncrono).
- Sem `autoReplyEnabled` (ou fora do modo teste), o webhook só grava (não responde).

### S7 — Validação — ✅ **concluído em 2026-11-27**
- `npm run build` + `tsc --noEmit` — verdes na validação final (frontend e `tsconfig.server.json`).
- Webhook com fixtures reais (`curl`) — dedupe, `fromMe`, grupo, sem texto (15 casos no S3).
- E2E com chip: mensagem chega ≤5 s, resposta do CRM chega com ticks `SENT→DELIVERED→READ` e a IA
  pausa quando o humano responde pelo celular. Detalhes em
  [`14-validacao-final-onda-1.md`](./14-validacao-final-onda-1.md).

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
- **Vercel roda em UTC (fuso)**: toda data exibida pela API deve usar `APP_TIME_ZONE` (padrão
  `America/Sao_Paulo`), nunca o fuso do servidor. Sem isso, “IA pausada até 20:22” aparecia como
  `23:22` e os horários das mensagens/logs ficavam 3h adiantados. Ver seção 7 do
  [`13-s5b-chat-tempo-real.md`](./13-s5b-chat-tempo-real.md).
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
   `crm-malas-slz`. O webhook da Evolution já aponta para `.../api/webhooks/evolution` e foi **entregue no
   S3** (405 no `GET` e 200 nos eventos, validado em produção em 2026-11-19).
2. **Payload real de `MESSAGES_UPSERT`** — ainda não existe (falta chip). O S3 usa o contrato do brief
   com parser tolerante e fail-closed. No primeiro evento real, conferir se `data.key.id`,
   `data.key.remoteJid` e o texto chegaram onde o parser espera; se algo vier diferente, o `DevLog` mostra
   a estrutura e o ajuste é pontual.
3. **D3**: IA automática (recomendado: começar com `autoReplyEnabled=false` e ligar após o checklist).
4. **D2**: chip dedicado comprado/ativado (necessário só no QR).
5. Variáveis na Vercel (todas as da Onda 1): `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`,
   `OPENAI_MODEL`, `EVOLUTION_ENABLED`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
   `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE_PREFIX`, `APP_PUBLIC_URL`, `EVOLUTION_TIMEOUT_MS`
   e `API_AUTH_TOKEN` (Onda 3). O `EVOLUTION_WEBHOOK_SECRET` precisa ser **o mesmo** do `.env` local,
   senão o webhook do S3 rejeita os eventos.
6. **Rotacionar a `EVOLUTION_API_KEY`** (opcional, recomendado): o valor apareceu num print de terminal
   durante a sessão do S2, e a chave é global (dá acesso a todas as instâncias da VM).

---

## 7. Critérios de aceite da Onda 1

- [x] Criar instância pelo CRM e conectar por QR — validado em 2026-11-23 (`CONNECTED`, número `554898205773`).
- [x] Mensagem real do celular aparece no chat em ≤5 s (sem duplicar) — validado no teste real de 2026-11-23.
- [x] Resposta digitada no CRM chega no celular com tick de enviado — validado em 2026-11-27, com os
  ticks reais `SENT → DELIVERED → READ` (ver
  [`14-validacao-final-onda-1.md`](./14-validacao-final-onda-1.md)).
- [x] `EVOLUTION_ENABLED=false` mantém o comportamento atual (demo) sem erro — validado: `201`, mensagem `SENT`, sem `delivery`/`externalId`.
- [x] Tela **"Conexão WhatsApp"** em Configurações com status real, QR, criar/reiniciar/desconectar,
  aviso de webhook e de risco (S5a, validada sem escanear QR).
- [x] Badge do Header reflete o status real (verde/âmbar/cinza) — S5a.
- [x] Criar conexão + exibir QR em **≤2 s** com a conexão **pré-provisionada** (Configurações → QR em
  **201 ms**); a primeira preparação em background leva **~11,2 s** e aparece como "Preparando a conexão...".
  O gargalo é a Evolution (~6,3 s para criar com QR + primeiro `connect` ~2,7 s), não o frontend.
- [x] `DevLog` de `EVOLUTION_API` registra sucesso, falha e latência (validado no S3).
- [x] `npm run build` e `tsc --noEmit` verdes.
- [x] Doc da feature atualizado (Handoff/AGENTS) e commit semântico.

> **Nota**: em **2026-11-27** a validação foi encerrada: mensagens enviadas pela rota do chat fizeram
> `SENT → DELIVERED` em ≤3 s e chegaram a `READ` ao abrir o celular, e os `MESSAGES_UPDATE` passaram a
> registrar `1 processado(s)` em vez de `unknown-message`. A **intervenção humana** também já havia sido
> validada (23/11). Ficou um **achado para o S6**: a resposta automática do Modo Teste permaneceu em
> `SENT` mesmo entregue (provável adoção do eco antes do `markSent`); detalhes e hipóteses em
> [`14-validacao-final-onda-1.md`](./14-validacao-final-onda-1.md#6-achado-para-a-onda-2--s6-não-bloqueia-a-onda-1).

---

## 8. Prompt sugerido para o novo chat

> Leia `HANDOFF.md`, `docs/features/11-integracao-evolution-api.md`,
> `docs/features/11-onda-1-implementacao.md`, `docs/features/12-modo-teste-e-envio-real.md`,
> `docs/features/13-s5b-chat-tempo-real.md` e `docs/features/14-validacao-final-onda-1.md`.
> A Onda 1 está **concluída e validada com o chip** (S1–S4 + S5a + S5b + Modo Teste; ticks reais
> confirmados em 2026-11-27). A próxima frente é a **Onda 2 / S6**: generalizar a auto-resposta no
> WhatsApp (`autoReplyEnabled`, `replyDelaySeconds`, `dailyReplyLimit`, janela de horário, fila em vez
> do webhook síncrono), reaproveitando `server/services/whatsappFlow.ts`. Inclua no S6 o ajuste do tick
> da resposta automática (seção 6 do doc 14: `externalId` curto, acks não casados) e use status
> monotônico. A API já está no ar na Vercel e o webhook já recebe eventos; use permissão ampliada para
> Prisma/build/push.

---

## 9. Histórico de sessões

| Data | Sessão | Entrega |
|---|---|---|
| 2026-11-18 | DSH | S1 (cliente Evolution) + S2 (rotas `/api/whatsapp`) + deploy da API na Vercel corrigido (envs + imports ESM) |
| 2026-11-19 | DSH | S3 (webhook `POST /api/webhooks/evolution`): autenticação timing-safe, dedupe, Lead/Conversation/Message, intervenção humana por `fromMe`, status/QR da instância e ticks; validado com 15 casos local e em produção, fixtures limpos |
| 2026-11-19 | DSH | **S5a** (tela **Conexão WhatsApp** em Configurações + badge real no Header): tipos/métodos na API, estado compartilhado no `CRMContext`, polling 5 s só visível, renovação de QR aos 30 s, criar/conectar/desconectar/reiniciar, avisos de webhook/risco; `tsc`/`build` verdes e prints em 390 px/1440 px. Sem alterar `server/**` nem schema |
| 2026-11-23 | DSH | **S4 + Modo Teste (Onda 1.5)**: envio real (`whatsappFlow.ts` com `PENDING`→`SENT/FAILED`, checagem de conexão com janela de confiança, adoção do eco `fromMe`), allowlist por loja (`Store.testModeEnabled/testModeNumbers` + migration + `GET/PUT /api/test-mode`), filtro total no webhook (sem Lead/Message/DevLog), auto-resposta só para números da lista (debounce cap 2 s), card **Modo Teste** + badge no Header, `delivery` no chat, `maxDuration: 60` na Vercel; 44 asserções locais e banco restaurado |
| 2026-11-23 | DSH | **S5b** (chat em tempo real): polling de 5 s só com a aba visível + refresh ao focar, ticks `PENDING/SENT/DELIVERED/READ/FAILED` (com contorno em falha), banner âmbar/vermelho de conexão, auto-scroll, merge puro de conversas/leads (otimista, contato novo no topo, pausa da IA espelhada) e substituição da mensagem otimista pela real; 34 asserções locais, `tsc`/`build` verdes e banco restaurado |
| 2026-11-23 | DSH | **Validação real com chip + fix dos ticks**: 4 respostas automáticas reais (preço/Pix/estoque corretos, 8,3–9,7 s), payload real de `MESSAGES_UPDATE` com `keyId`/status numérico, parser ajustado e validado com 19 asserções; tempo de intervenção salvo em 1h (banco/API); faltam ticks reais de mensagem nova e o teste de intervenção |
| 2026-11-27 | DSH | **Validação final da Onda 1**: ambientes conferidos (git/build/tsc/env/Evolution/Vercel/DevLog) e ticks reais confirmados com o chip — `SENT → DELIVERED` em ≤3 s e `READ` (duas mensagens), `MESSAGES_UPDATE: 1 processado(s)`; ciclo inverso revalidado (mensagem do celular + auto-resposta do Modo Teste, `sendText` 201 em 460 ms); achado do tick da auto-resposta para o S6; sem alteração de código/schema (ver [`14-validacao-final-onda-1.md`](./14-validacao-final-onda-1.md)) |
