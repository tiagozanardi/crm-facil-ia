# Feature Handoff: Modo Teste (allowlist) + Envio real no WhatsApp (S4)

- **Data**: 2026-11-23
- **Agente / Plataforma**: DeepSeek Harness
- **Status**: Concluído (Onda 1 / S4 + Onda 1.5 / Modo Teste)

---

## 1. Objetivo da Feature

Permitir **testar a Evolution API + IA com o número real conectado sem risco** de a IA conversar
com contatos de verdade.

Quando o **Modo Teste** está ligado:

1. o webhook da Evolution **descarta completamente** qualquer contato que não esteja em
   `stores.testModeNumbers` — nenhum `Lead`, `Conversation`, `Message` ou `DevLog` é gravado;
2. a IA **responde automaticamente** às mensagens dos números cadastrados;
3. o lojista vê o status no card **Configurações → Modo Teste** e no badge do Header.

Para a auto-resposta existir de verdade, esta entrega também concluiu o **S4 da Onda 1** (envio
real pelo WhatsApp), que estava pendente: chat do atendente, botão "Responder com IA" e
auto-resposta agora saem pela Evolution quando `EVOLUTION_ENABLED=true` e a instância está
`CONNECTED`.

---

## 2. Arquivos Criados ou Modificados

### Banco de dados

- `prisma/schema.prisma`: `Store.testModeEnabled` (`Boolean`, default `false`) e
  `Store.testModeNumbers` (`String[]`, default `[]`).
- `prisma/migrations/20261123120000_modo_teste_allowlist/migration.sql`: migration aditiva
  (`ADD COLUMN`) aplicada com `prisma migrate deploy`; backup lógico prévio em
  `tmp/backup-pre-test-mode.json` (gitignored).

### Backend

- `server/services/testMode.ts` **(novo)**: normalização E.164 (`normalizeTestNumber`), validação
  da lista (`normalizeTestNumbers`, máx. 10), leitura da configuração (`getTestModeConfig`) e
  decisão de acesso (`resolveTestModeAccess` / `isTestModeNumber`).
- `server/routes/testMode.ts` **(novo)**: `GET /api/test-mode` e `PUT /api/test-mode`.
  - `PUT` valida booleano, normaliza/deduplica números, recusa lista vazia quando `enabled=true`
    (`400 NO_TEST_NUMBERS`), recusa número inválido (`400 INVALID_PHONE`) e o excesso de números
    (`400 TOO_MANY_NUMBERS`).
  - Erros de pooler do Supabase (`P1001/P1002/P1017/P2024`) viram `503 DATABASE_UNAVAILABLE`.
- `server/services/whatsappFlow.ts` **(novo)**: único ponto de envio real.
  - `deliverOutboundMessage`: confere a conexão (estado do banco recente é confiável por 2 min;
    senão, `connectionState` ao vivo), chama `sendText`, grava `SENT` + `externalId` ou `FAILED` +
    `error`. Nunca lança.
  - `tryAdoptOutboundEcho`: resolve a **corrida do eco** — o `fromMe` do próprio CRM que chega antes
    do `externalId` é casado com a `Message(PENDING)` recente (mesmo texto, janela de 3 min) e
    adotado, **sem pausar a IA** e sem criar `AGENT` duplicado.
  - `maybeAutoReplyToTestNumber`: valida envio/pausa → debounce (cap 2 s) → relê a última mensagem
    → confere a OpenAI/conexão → gera → grava `Message(AI, PENDING)` → envia → marca SENT/FAILED.
- `server/routes/webhooks.ts`: carrega o modo teste por evento; contato fora da lista é descartado
  antes de qualquer escrita (inclusive `fromMe`); números da lista disparam a auto-resposta;
  `fromMe` do CRM é contado como `echo` (não como intervenção humana); resposta JSON ganhou
  `autoReplies`, `autoReplySkips`, `echoes` e `blockedByTestMode`. Quando só houve bloqueio do modo
  teste, **nenhum `DevLog` é gravado** (nem resumo do evento).
- `server/routes/conversations.ts`: **S4** em `POST /:leadId/messages` e `POST /:leadId/ai-reply` —
  `Message` nasce `PENDING` quando o envio será tentado, com `delivery` no JSON; sem a flag ou sem
  número E.164 mantém o comportamento de demo. `formatConversation` agora expõe `status`.
- `server/helpers/mappers.ts`: `formatMessage` inclui `status` (`PENDING/SENT/.../FAILED`).
- `server/app.ts`: registra `/api/test-mode`.
- `vercel.json`: `functions["api/index.ts"].maxDuration = 60` (a auto-resposta é síncrona no
  webhook; 10 s era apertado).

### Frontend

- `src/components/TestModeCard.tsx` **(novo)**: toggle, lista de números (adicionar/remover),
  salvar, diagnóstico (envio desligado / WhatsApp desconectado / pronto para testar), passo a passo
  e aviso do que acontece com contatos fora da lista.
- `src/views/SettingsView.tsx`: card logo abaixo de "Conexão WhatsApp".
- `src/components/Header.tsx`: badge âmbar **“Modo teste”** quando ligado (clique abre
  Configurações), para o lojista nunca esquecer que está nesse modo.
- `src/services/api.ts`: tipos `TestModeConfig`, `OutboundDelivery`; métodos `getTestMode` e
  `updateTestMode`; `delivery` em `SendMessageResult` e `AIReplyResult`.
- `src/context/CRMContext.tsx`: estado compartilhado `testMode` / `testModeLoading`, ações
  `refreshTestMode` e `saveTestMode`; aviso (toast) quando a mensagem é registrada mas **não sai**
  pelo WhatsApp (FAILED ou SKIPPED por conexão).
- `src/types/index.ts`: `ChatMessage.status` (preparação do S5b/ticks).

### Documentação

- `docs/features/12-modo-teste-e-envio-real.md` (este arquivo).
- `docs/features/11-onda-1-implementacao.md`: S4 marcado como entregue e nota do modo teste.
- `docs/database/dicionario-do-banco-de-dados.md`: colunas novas de `stores` e atualização de
  `messages`/`ai_configs`.
- `HANDOFF.md`: status, seção de execução e diário.

---

## 3. Decisões Técnicas Tomadas

| Decisão | Por quê |
|---|---|
| Configuração em `stores` (não em `AIConfig`) | É política de **quem entra no CRM**, multi-tenant e lida tanto pelo webhook quanto pela UI. |
| Filtro **antes** de qualquer escrita no webhook | O pedido era “não registrar nada”: nem Lead, nem Message, nem DevLog. O resultado do bloqueio só aparece na resposta HTTP (`ignored: ['test-mode']`), útil para `curl`, sem poluir o banco. |
| Auto-resposta só com o modo teste ligado | A automação geral (Onda 2/S6) ainda não existe. Fora do modo teste o CRM continua apenas registrando — nada responde sozinho, exatamente o comportamento seguro prometido. |
| `autoReplyEnabled` **não** é exigido no modo teste | O objetivo do modo é justamente testar a resposta automática; exigir outra flag escondida na tela de IA criaria um “não funciona” silencioso. A Onda 2 aplica `autoReplyEnabled`, limites e horário na automação geral. |
| Envio do webhook é **síncrono** | Na Vercel o “fire-and-forget” não é confiável (a função congela após a resposta). O debounce foi capado em **2 s** e o `maxDuration` subiu para **60 s**. O caminho de eco/dedupe evita resposta duplicada em reentrega. |
| `Message(PENDING)` **antes** de `sendText` | Sem a linha pendente o eco `fromMe` chegaria antes do `externalId` e o S3 criaria um `AGENT` + pausa de 24h. |
| Checagem de conexão com janela de confiança (2 min) | `connectionState` na Evolution levou ~3–4 s no teste; confiar no estado do banco (atualizado por `CONNECTION_UPDATE`) mantém o webhook rápido, sem o risco do `sendText` esperar 15 s numa sessão caída. |
| Números em E.164 só com dígitos (máx. 10) | Casa com `Lead.phoneE164` e com o JID do WhatsApp; evita lista de transmissão acidental. |
| Envio manual **não** é bloqueado para números fora da lista | O escopo escolhido foi esconder/descartar **mensagens recebidas** de fora da lista. Bloquear o envio manual impediria atender um cliente real enquanto o modo teste está ligado; leads antigos continuam visíveis. |
| Sem `schema` novo além de `stores` | A Onda 1 já tinha `Message.status/externalId/error` e `WhatsAppInstance`. |

### Contrato rápido da API

```jsonc
// GET /api/test-mode
{ "enabled": true, "numbers": ["5598988451234"], "maxNumbers": 10 }

// PUT /api/test-mode
{ "enabled": true, "numbers": ["+55 (98) 98845-1234"] }   // normaliza para "5598988451234"
// 400: NO_TEST_NUMBERS | INVALID_PHONE | TOO_MANY_NUMBERS | INVALID_BODY

// POST /api/webhooks/evolution (resumo de sucesso)
{
  "ok": true, "event": "MESSAGES_UPSERT", "processed": 1, "duplicates": 0,
  "ignored": [], "autoReplies": 1, "autoReplySkips": []
}
// contato bloqueado pelo modo teste: nenhum registro no banco
{ "ok": true, "...": "...", "ignored": ["test-mode"], "blockedByTestMode": 1 }
```

---

## 4. Como Testar / Validar

### 4.1 Local (sem chip, sem enviar)

1. `npm run server` (3001) e `npm run dev` (3000).
2. Abra **Configurações → Modo Teste**:
   - ligue o toggle, cadastre um número (ex.: `+55 98 99999-0001`) e salve;
   - confira o badge âmbar **Modo teste** no Header e o aviso do card.
3. Com `EVOLUTION_ENABLED=false`, mande um `curl` de fixture para o webhook do número **fora** da
   lista → resposta `ignored: ["test-mode"]` e **nenhum** Lead/Message/DevLog novo.
4. Fixture do número **da lista** → Lead/Message criados; a auto-resposta fica registrada no DevLog
   como `sending-disabled` (envio desligado), sem chamar a OpenAI.
5. Desligue o modo teste e salve → o webhook volta a registrar qualquer contato.

### 4.2 Teste real ponta a ponta (celular)

Pré-requisitos:

1. **Vercel → Settings → Environment Variables → Production**: `EVOLUTION_ENABLED=true` e
   **Redeploy** (variável nova não entra em deployment existente).
2. **Configurações → Conexão WhatsApp**: escanear o QR com o número da loja (`CONNECTED`).
3. **Configurações → Modo Teste**: ligar e cadastrar o **segundo celular** (o número de teste).
4. Do segundo celular, mandar uma mensagem para o número conectado. Em alguns segundos:
   - a mensagem aparece no chat;
   - a IA responde e a resposta chega no WhatsApp do segundo celular;
   - a Área Dev mostra `EVOLUTION_API` (`sendText`) e `CRM_WEBHOOK` (`Modo teste · IA respondeu...`).
5. Mandar de um número **fora** da lista: nada aparece no CRM e nenhum `DevLog` é criado (a IA
   também não responde). Ao desligar o modo teste, esse número volta a entrar normalmente.
6. Responder manualmente do celular da loja: a IA pausa por `interventionPauseHours` (24h) — é a
   regra de intervenção humana. O eco do envio feito **pelo CRM** não pausa (é adotado).

### 4.3 O que foi validado nesta entrega

- `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.server.json` e `npm run build` verdes.
- Migration aplicada e client do Prisma lendo `testModeEnabled`/`testModeNumbers`.
- **36 asserções** de E2E local (API do modo teste, filtro sem rastro, `fromMe` bloqueado, dedupe,
  corrida do eco, intervenção humana real e desligamento do modo) — `tmp/test-mode-e2e.ts`.
- **7 asserções** de envio: `deliverOutboundMessage` recusa em ~3 s (sem esperar o timeout de 15 s
  do `sendText`) e a auto-resposta com instância `CONNECTING` para em `whatsapp-connecting`, sem
  criar `Message(AI)` e **sem chamar a OpenAI** — `tmp/test-send-flow.ts`.
- Banco restaurado ao final: 5 leads, 15 mensagens, 0 logs de fixture, modo teste
  `enabled=false` / `numbers=[]`.

> Os scripts de teste ficam em `tmp/` (gitignored). Recrie-os se precisar; o padrão é fixtura com
> `externalId` começando em `FIXTURE-` e limpeza por `Lead.phoneE164` + `DevLog.createdAt`.

---

## 5. Pendências ou Próximos Passos

1. **S5b (Onda 1)**: polling de 5 s em `/api/conversations` com a aba visível, refresh ao focar,
   **ticks** `PENDING/SENT/DELIVERED/READ/FAILED` no chat (o `status` já vem na API) e banner de
   WhatsApp desconectado. Sem isso, a resposta chega ao celular mas o chat só mostra a mensagem
   depois de um reload.
2. **Onda 2 / S6**: generalizar a auto-resposta (`autoReplyEnabled`, `dailyReplyLimit`, janela de
   horário, fila/retry em vez do webhook síncrono). O `whatsappFlow.ts` já concentra o envio e pode
   ser reaproveitado.
3. **Vercel**: conferir o `EVOLUTION_ENABLED=true` em Production e o Redeploy; o `maxDuration: 60`
   no `vercel.json` só vale no próximo deploy.
4. **Webhook real**: quando o chip for conectado, conferir no primeiro `MESSAGES_UPSERT` real se
   `data.key.id`, `remoteJid` e o texto chegam como o parser tolerante espera.
5. **Modo teste não esconde dados antigos**: leads/conversas criados antes de ligar o modo continuam
   visíveis; o filtro vale para **mensagens novas**. Envio manual para eles também continua
   liberado (decisão registrada acima). Se o lojista quiser uma “demo limpa”, o próximo passo pode
   ser filtrar o funil/chat por allowlist enquanto o modo estiver ligado.
6. **Testar com chip**: a validação desta sessão cobriu todo o caminho exceto o envio físico (não há
   chip conectado); o primeiro teste real deve confirmar a resposta no celular e os ticks do S5b.
