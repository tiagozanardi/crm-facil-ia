# Feature Handoff: Chat em tempo real — polling, ticks e banner (S5b)

- **Data**: 2026-11-23
- **Agente / Plataforma**: DeepSeek Harness
- **Status**: Concluído (Onda 1 / S5b)

---

## 1. Objetivo da Feature

Fechar a experiência de atendimento no navegador: a conversa do WhatsApp passa a **atualizar sozinha**
a cada 5 s (com a aba visível), mostra **ticks reais de entrega** e avisa quando a conexão do
WhatsApp não está pronta. Antes desta fatia, mensagem e resposta só apareciam depois de recarregar a
página — justamente o que faltava para testar o envio real com o chip.

---

## 2. Arquivos Criados ou Modificados

- `src/context/conversationMerge.ts` **(novo)**: funções puras `mergeConversations` e `mergeLeads`.
  Separadas do React para serem testáveis; são o coração do polling.
- `src/context/CRMContext.tsx`:
  - `refreshConversations({ silent })` — reconsulta `GET /api/conversations`, reaproveita a
    requisição em andamento e mescla conversas + leads;
  - `replaceMessage` — troca a mensagem otimista (`msg-*`) pela versão persistida devolvida pela API,
    sem duplicar se o polling já tiver trazido a real;
  - `sendMessage` — usa ID temporário único (`msg-<timestamp>-<random>`) e substitui pelo registro
    real assim que a API responde.
- `src/views/ChatView.tsx`:
  - polling de **5 s** em `/api/conversations` **somente com `document.visibilityState === 'visible'`**
    e refresh imediato ao abrir o chat / voltar o foco para a aba;
  - **ticks** nas bolhas da IA/atendente: `PENDING` (relógio), `SENT` (1 check), `DELIVERED`
    (2 checks), `READ` (2 checks azuis) e `FAILED` (alerta vermelho + contorno na bolha);
  - **banner** no topo da conversa quando o WhatsApp está `CONNECTING` (âmbar, com link para
    Configurações) ou `DISCONNECTED/ERROR` (vermelho);
  - revalidação do status da conexão a cada ~30 s dentro do mesmo polling, para o banner refletir
    quedas/retomadas sem depender só do foco da aba;
  - auto-scroll: acompanha mensagens novas somente se o usuário já está no fim (não "puxa" a tela
    quando ele está lendo o histórico) e começa no fim ao trocar de conversa;
  - contatos novos mostram “Novo contato” no cabeçalho em vez de interesse vazio.
- `src/types/index.ts`: nenhuma mudança nesta fatia — `ChatMessage.status` foi criado junto do S4.
- Backend/schema: **nenhuma alteração**. O `GET /api/conversations` já devolvia `status` (S4).

---

## 3. Decisões Técnicas Tomadas

| Decisão | Por quê |
|---|---|
| Polling no `ChatView`, não no `CRMContext` | O `ChatView` só é montado na aba de chats (`currentView === 'chats'`), então o intervalo morre ao sair da tela. Usa `visibilitychange` + `focus` e uma trava `inFlight` para não sobrepor requisições. |
| Merge em funções puras | Permite testar as regras de otimista/dedupe sem navegador (17 asserções nesta entrega) e evita inflar o `CRMContext`. |
| Servidor é a fonte da verdade, **exceto** mensagem otimista ainda não confirmada | Sem isso, a bolha recém-enviada "pisca" ou duplica quando o polling chega antes da resposta do `POST /messages`. A otimista é preservada se não existe no servidor e removida quando o servidor já tem a mesma (`sender + texto`). |
| `replaceMessage` só troca se o ID real ainda não estiver na lista | Corrida polling × resposta da API: se ambos chegarem, o resultado é uma mensagem só. |
| Lead sintético para contato novo (`mergeLeads`) | O webhook cria o `Lead` no banco, mas a lista do frontend só conhecia os leads da carga inicial. O sintético usa nome/telefone/stage/aiStatus da conversa e entra **no topo** do inbox; a próxima carga completa traz o registro real. |
| Espelhar `aiStatus`/`pausedUntil`/`stage` da conversa no lead | O webhook pausa a IA quando um humano responde pelo celular; sem espelhar, o banner de intervenção e o botão “Reativar IA” não apareceriam. `disabled` nunca é rebaixado para `paused` (a conversa não carrega esse estado). |
| Ticks só em mensagens da IA/atendente | Mensagem de cliente é entrada; não faz sentido “tick de envio”. Mensagens antigas/mock sem `status` não exibem nada. |
| Revalidar o WhatsApp a cada ~30 s (6 ticks) | Mantém o banner honesto sem pagar um `GET /api/whatsapp/instance` a cada 5 s. A chamada é só de cache no banco (sem `?refresh=1`), então não consulta a Evolution. |
| Sem reordenação dos leads existentes | A ordem carregada é preservada; só contatos novos entram no topo. Reordenar tudo pelo último `lastMessageAt` a cada 5 s mudaria a ordem de outras telas (funil/kanban) sem necessidade. |

---

## 4. Como Testar / Validar

### 4.1 Local (sem chip)

1. `npm run server` (3001) e `npm run dev` (3000); abra **Chats**.
2. Com o Modo Teste ligado e um número cadastrado, dispare um fixture do webhook (ou mensagem real)
   para esse número — a conversa aparece no topo e a mensagem surge **sem recarregar** (≤5 s).
3. Abra outra aba, deixe o chat em segundo plano e volte: ao focar, o refresh é imediato.
4. Simule os ticks com `POST /api/webhooks/evolution` `messages.update` em uma mensagem com
   `externalId` (`SERVER_ACK` → `SENT`, `DELIVERY_ACK` → `DELIVERED`, `READ` → `READ`).
5. Desconecte o WhatsApp em Configurações: o banner vermelho aparece no topo do chat; com a instância
   `CONNECTING`, o banner é âmbar e leva ao QR.

### 4.2 Com o chip (teste real)

1. Conecte o WhatsApp da loja (`CONNECTED`) e ligue o Modo Teste com o segundo celular.
2. Envie uma mensagem do segundo celular com o CRM aberto na aba Chats:
   - a mensagem do cliente aparece em ≤5 s;
   - a resposta automática da IA aparece em seguida, com tick de enviado e depois entregue/lido;
   - o status da conexão no topo continua “Conectado”.
3. Se você responder pelo celular da loja, em ≤5 s o banner de intervenção humana aparece (IA
   pausada) — reflexo do `fromMe` no backend.

### 4.3 O que foi validado nesta entrega

- `npx tsc --noEmit` e `npm run build` verdes (bundle `index-D5MmV5vq.js`, 427,94 kB / 118,06 kB gzip).
- **17 asserções** nas funções puras (`tmp/s5b-merge-test.ts`): otimista preservada, otimista
  confirmada removida, sem IDs duplicados, conversa nova, conversa só local, lead novo no topo,
  pausa/retomada/`pausedUntil`/stage espelhados, `disabled` intocado e referência estável sem mudanças.
- **17 asserções** de ponta a ponta (`tmp/s5b-api-e2e.ts`): webhook cria lead/conversa, tick
  `messages.update` vira `READ`, `GET /api/conversations` devolve `SENT/PENDING/DELIVERED/READ/FAILED`
  e o merge do frontend adiciona conversa + lead sintético. (O payload real do tick foi ajustado
  depois — ver seção 5.)
- Banco restaurado ao final: 5 leads, 15 mensagens, modo teste desligado, 0 logs de fixture.
- **6 asserções** extras confirmaram o critério de demo do S4 (`EVOLUTION_ENABLED=false`): `POST
  /messages` → `201`, mensagem `SENT`, sem `delivery`/`externalId` (`tmp/s5b-demo-flag.ts`).
- Módulos servidos pelo Vite (`ChatView.tsx`, `conversationMerge.ts`, `CRMContext.tsx`) → HTTP 200,
  sem erro de transformação.

> Não houve captura de tela do navegador nesta sessão; a UI foi verificada por build, transformação
> do Vite e pelos contratos de dados. O app está rodando em `http://localhost:3000` para conferência.

---

## 5. Pós-teste real e correção dos ticks (2026-11-23)

O primeiro teste com o chip real (`EVOLUTION_ENABLED=true` em Production, instância `CONNECTED` no
número `554898205773`) confirmou o ciclo completo: **4 respostas automáticas** para o número de
teste `554896535640`, com preço Pix/estoque corretos, `sendText` `HTTP 201`, `externalId` gravado e
latência de **8,3–9,7 s** por resposta. A IA permaneceu `ACTIVE` (sem pausa indevida).

**Problema encontrado:** o WhatsApp real envia `MESSAGES_UPDATE` com um payload diferente do fixture
do S3 — os 34 eventos chegaram, mas todos foram ignorados com `missing-external-id` e o status das
mensagens ficou preso em `SENT` (o chat nunca mostrava entregue/lido).

**Correção em `server/routes/webhooks.ts` (`handleMessagesUpdate`):**
- o ID agora é aceito de `keyId` (payload real da v2.3.7), `key.id`, `messageId`, `id` e `update.key.id`;
- o status é lido de `item.status` ou `update.status`, como string (`SERVER_ACK`, `READ`...) **ou
  número do Baileys** (`0 ERROR`, `1 PENDING`, `2 SERVER_ACK`, `3 DELIVERY_ACK`, `4 READ`, `5 PLAYED`);
- quando não reconhece, o `DevLog` grava **somente os nomes dos campos** (`keys`, `keyKeys`,
  `updateKeys`, `statusType`) para o próximo ajuste não ficar às cegas.

**Validação:** 19 asserções com fixtures dos 5 formatos (`keyId` + string, `key.id` + número,
`keyId` + `update.status`, número em string, `data` objeto) + diagnóstico de payload sem ID —
`tmp/tick-parser-test.ts`, todas verdes; `tsc` e `build` verdes.

**Tempo de intervenção humana:** alterado para **1 hora** na interface e confirmado no banco e na
API (`interventionPauseHours = 1`, `updatedAt 2026-11-23T20:39:50Z`).

**Ainda a confirmar no real:** os ticks `DELIVERED/READ` de uma mensagem nova e o teste de
intervenção humana (responder pelo celular da loja → `fromMe` → IA pausada por 1h).

---

## 6. Pendências ou Próximos Passos

1. **Validação final com chip**: confirmar os ticks reais (`DELIVERED`/`READ`) de uma mensagem nova e
   a intervenção humana (responder pelo celular da loja → banner de IA pausada por 1h → “Reativar
   IA”). A parte de receber, responder e enviar já foi validada em 2026-11-23.
2. **Onda 2 / S6**: generalizar a auto-resposta no WhatsApp (`autoReplyEnabled`, `dailyReplyLimit`,
   janela de horário e fila em vez do webhook síncrono). O `ChatView` já está pronto para exibir o
   que essa automação gerar.
3. **Desejável (não bloqueia)**: indicador de “novas mensagens” quando o usuário está no histórico e
   a conversa cresce fora da tela; som/notificação; contador de não lidas na lista. O polling e o
   merge já entregam os dados necessários.
4. Atualizar o dicionário do banco **não** é necessário: esta fatia não alterou o schema.
