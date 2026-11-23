# Dicionário do Banco de Dados — CRM Fácil IA

> **Público-alvo:** desenvolvedor(a) júnior que acabou de receber acesso ao banco e nunca viu este projeto.
> **Objetivo:** explicar, tabela por tabela, *o que é*, *para que serve*, *quem escreve/lê* e *as pegadinhas* de cada campo.
> **Fonte da verdade:** `prisma/schema.prisma` (este documento foi conferido contra o banco real — 11 tabelas, 12 enums, 12 chaves estrangeiras e 26 índices).
> **Última atualização:** 2026-11-23 · **Banco:** PostgreSQL no Supabase · **ORM:** Prisma 6
> **Onda 1 / Modo Teste:** `stores.testModeEnabled` e `stores.testModeNumbers` (migration `20261123120000_modo_teste_allowlist`) e as colunas de envio da Evolution em `messages`/`ai_configs` (migration `20261118153000_whatsapp_onda1`).

---

## Como usar este documento

- Se você só quer **entender o negócio**, leia a seção 1, 3 (diagrama) e 4 (fluxo de uma mensagem).
- Se você vai **mexer em uma tela**, procure a tabela na seção 5 e veja "quem usa".
- Se você vai **rodar uma consulta**, pule para as receitas da seção 7.
- Se algo parecer estranho (enum em maiúsculo, campo repetido em duas tabelas, data "sem fuso"), veja as pegadinhas da seção 9.

---

## 1. Visão geral

O CRM é **multi-tenant desde o nascimento**: existe uma loja (`stores`) e **todo dado de negócio aponta para ela** com a coluna `storeId`. Não existe tabela global de dados de cliente: se você esquecer o filtro `storeId`, vai misturar lojas. Hoje o projeto roda com uma loja piloto (`Malas SLZ`), mas o modelo já suporta N lojas.

São **11 tabelas** agrupadas em 5 domínios:

| Domínio | Tabelas | Para que serve |
|---|---|---|
| **Tenant & pessoas** | `stores`, `users` | Identidade da loja (cores, logo, WhatsApp) e atendentes |
| **Catálogo** | `products` | Malas, mochilas e acessórios com preço, Pix, estoque e medidas ANAC |
| **Atendimento** | `leads`, `conversations`, `messages` | Funil de vendas, inbox do WhatsApp e histórico de mensagens |
| **Inteligência** | `ai_configs`, `ai_knowledge`, `quick_replies` | Como a IA fala, o que ela aprendeu e os atalhos do atendente |
| **Operação** | `follow_up_campaigns`, `dev_logs` | Campanhas de follow-up e trilha técnica (tokens, erros, diagnóstico) |

**Como o código acessa:** o backend Express (`server/`) usa o Prisma Client (`server/db.ts`, singleton). O frontend **nunca** fala com o banco direto — sempre pela API `/api/*`.

---

## 2. Convenções que valem para todas as tabelas

| Convenção | Detalhe |
|---|---|
| **IDs** | `String` no formato **cuid** (ex.: `cmwlcr0bn0001434ocrc9lowd`). São gerados pelo Prisma, não pelo banco. |
| **Nomes** | Tabelas em `snake_case` (`ai_configs`, `dev_logs`); colunas em `camelCase` (`storeId`, `createdAt`). **No SQL puro, sempre aspire colunas camelCase:** `SELECT "storeId" FROM leads;` |
| **Multi-tenant** | Toda tabela de negócio tem `storeId` com FK para `stores.id` e `ON DELETE CASCADE`. |
| **Dinheiro** | `Decimal(10,2)` no banco (`numeric(10,2)` no Postgres). No código vira `number` por `Number(...)`. **Nunca use `float` para preço.** |
| **Listas** | `text[]` no Postgres (`tags`, `colors`). No Prisma é `String[]`. A coluna aceita `NULL`, mas o app sempre grava `[]`. |
| **Datas** | `timestamp without time zone`, gravadas em **UTC**. A API formata usando o fuso do servidor (hoje `America/Sao_Paulo`). `createdAt` tem default `CURRENT_TIMESTAMP`; `updatedAt` é mantido **pelo Prisma** (não tem default no banco). |
| **Enums** | Valores em MAIÚSCULO no banco (`ATENDIMENTO_IA`) e em minúsculo na API/frontend (`atendimento_ia`). A conversão é feita nos mappers do backend. |
| **Exclusão** | Quase tudo é `CASCADE` a partir da loja. Produto e usuário têm "soft delete" via `active = false`; não apague produto que já apareceu em conversa sem pensar. |
| **JSON** | `dev_logs.metadata` é `jsonb` livre — o formato depende de quem gerou o log (veja seção 5.11). |

---

## 3. Diagrama de relacionamentos

```mermaid
erDiagram
    STORES ||--o{ USERS : "atendentes"
    STORES ||--|| AI_CONFIGS : "1 configuração por loja"
    STORES ||--o{ PRODUCTS : "catálogo"
    STORES ||--o{ LEADS : "funil"
    STORES ||--o{ CONVERSATIONS : "inbox"
    STORES ||--o{ AI_KNOWLEDGE : "RAG"
    STORES ||--o{ QUICK_REPLIES : "atalhos"
    STORES ||--o{ FOLLOW_UP_CAMPAIGNS : "campanhas"
    STORES ||--o{ DEV_LOGS : "logs técnicos"

    USERS |o--o{ LEADS : "assignedTo (opcional)"

    LEADS ||--|| CONVERSATIONS : "1 conversa por lead"
    CONVERSATIONS ||--o{ MESSAGES : "histórico"

    STORES {
      text id PK
      text slug UK
      text name
      int interventionPauseHours
    }
    LEADS {
      text id PK
      text storeId FK
      text phone
      enum stage
      enum aiStatus
      timestamp pausedUntil
    }
    CONVERSATIONS {
      text id PK
      text leadId FK_UK
      text storeId FK
      text lastMessage
      timestamp lastMessageAt
    }
    MESSAGES {
      text id PK
      text conversationId FK
      enum sender
      text text
      boolean read
    }
    AI_CONFIGS {
      text id PK
      text storeId FK_UK
      enum tone
      enum ctaStrategy
      int maxWordsPerReply
    }
```

**Resumo das cardinalidades:**
- `stores` 1 : N `users`, `products`, `leads`, `conversations`, `ai_knowledge`, `quick_replies`, `follow_up_campaigns`, `dev_logs`
- `stores` 1 : 1 `ai_configs` (`storeId` é **unique**)
- `leads` 1 : 1 `conversations` (`conversations.leadId` é **unique**)
- `conversations` 1 : N `messages`
- `users` 1 : N `leads` (`leads.assignedToId`, opcional)

---

## 4. O caminho de uma mensagem (leitura recomendada)

Entender esta sequência resolve 80% das dúvidas sobre o banco:

1. **Chega uma mensagem do cliente** (hoje via teste/seed; no futuro, webhook da Evolution API).
2. O backend encontra (ou cria) o **`leads`** daquele telefone e a **`conversations`** correspondente (`ensureConversationForLead`).
3. A mensagem é gravada em **`messages`** com `sender = 'CLIENT'`, `read = false`.
4. `conversations.lastMessage`/`lastMessageAt` são atualizados (para a lista do inbox não precisar de `JOIN`).
5. `leads.lastInteraction` é atualizado e `leads.unreadCount` incrementa.
6. Quando o atendente ou a IA respondem:
   - a resposta vira outro registro em **`messages`** com `sender = 'AGENT'` ou `'AI'`;
   - se foi **humano**, a IA é pausada: `leads.aiStatus = PAUSED`, `pausedUntil = agora + stores.interventionPauseHours` (padrão 24h) — e o mesmo estado é espelhado em `conversations`.
7. Para gerar a resposta da IA, o backend lê **`ai_configs`** (tom/emojis/gírias/CTA), **`products`** (só ativos com estoque), **`quick_replies`** e **`ai_knowledge`** (últimos 20 ensinamentos) e monta o prompt.
8. Toda chamada de LLM grava um **`dev_logs`** com `level = 'AI_CALL'`, tokens e latência — é o que a Área Dev mostra.
9. Quando o humano ensina a IA, nasce um **`ai_knowledge`** (`source = 'HUMANO_CHAT'`).

---

## 5. Dicionário das tabelas

Legenda das colunas: **Nulo?** = aceita `NULL`. **Padrão** = valor aplicado pelo banco/Prisma quando o campo não é enviado.

---

### 5.1 `stores` — a loja (tenant)

**Para que serve:** é a raiz de tudo. Guarda a identidade visual (cores, logo), o WhatsApp público e as regras de negócio da loja. Existe uma configuração de IA por loja (`ai_configs.storeId` é `unique`).
**Quem escreve:** seed e tela "Configurações & Cores" (`PUT /api/store`).
**Quem lê:** praticamente todo o backend (`getDefaultStore()`), o tema do frontend e o prompt da IA.

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `name` | text | — | — | Nome fantasia (ex.: "Malas SLZ"). Aparece no prompt e no header. |
| `slug` | text | — | — | Identificador único legível (ex.: `malas-slz`). O backend procura por ele em `getDefaultStore()`. |
| `segment` | text | sim | `'Malas de Viagem & Acessórios'` | Segmento de atuação. |
| `whatsappNumber` | text | — | — | WhatsApp público da loja (texto livre, com máscara). Vai para o prompt e para o cliente. |
| `address` | text | sim | — | Endereço físico. Usado quando o CTA é "convidar para a loja". |
| `logoUrl` | text | sim | `/logo-malas-slz.jpg` | Caminho da logo usada no CRM. |
| `primaryColor` | text | — | `#B3471A` | Cor primária (terracota). Vira a variável CSS `--color-brand-500`. |
| `accentColor` | text | — | `#D97706` | Cor de destaque (caramelo). |
| `surfaceColor` | text | sim | `#FAF8F5` | Cor de fundo/off-white. |
| `interventionPauseHours` | integer | — | `24` | **Regra central:** quantas horas a IA fica em silêncio depois que um humano responde. |
| `vipGroupLink` | text | sim | — | Link do Grupo VIP (usado no CTA de mesmo nome). |
| `testModeEnabled` | boolean | — | `false` | **Modo Teste (Onda 1.5):** quando `true`, o webhook descarta qualquer contato fora de `testModeNumbers` **sem gravar nada** (nem Lead, Message ou DevLog) e a IA só responde automaticamente para esses números. |
| `testModeNumbers` | text[] | sim | `[]` | Números permitidos no modo teste, em **E.164 só com dígitos** (ex.: `5598988451290`). Máximo de 10 por loja (validado na API). |
| `createdAt` | timestamp | — | `now()` | Criação. |
| `updatedAt` | timestamp | — | Prisma | Última alteração. |

**Índices/constraints:** PK em `id`; **unique** em `slug`.
**Exemplo:** `{ "name": "Malas SLZ", "slug": "malas-slz", "whatsappNumber": "+55 98 98845-1290", "interventionPauseHours": 24 }`

---

### 5.2 `users` — atendentes e administradores

**Para que serve:** pessoas que operam o CRM (1 a 5 atendentes + admin/dev).
**Quem escreve:** seed (hoje). **Quem lê:** atribuição de lead (`leads.assignedToId`) e telas de equipe.
**Importante:** **ainda não existe login/autenticação implementado** — `passwordHash` está sempre `NULL` e a senha não é usada. É preparação para a fase de autenticação.

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `name` | text | — | — | Nome do atendente. |
| `email` | text | — | — | **Unique** no banco; login futuro. |
| `passwordHash` | text | sim | — | Hash da senha (vazio hoje; não usar em produção sem auth). |
| `role` | enum `Role` | — | `SELLER` | `ADMIN`, `SELLER` ou `DEV`. |
| `active` | boolean | — | `true` | Desativa sem apagar histórico. |
| `createdAt` / `updatedAt` | timestamp | — | `now()` / Prisma | Auditoria. |

**Relações:** `store`; `assignedLeads` (leads em que é responsável).
**Índices:** PK `id`; unique `email`; índice `(storeId)` para listar a equipe de uma loja.

---

### 5.3 `products` — catálogo e estoque

**Para que serve:** o que a loja vende. É a fonte do catálogo que a IA pode oferecer e das propostas enviadas no chat.
**Quem escreve:** tela "Produtos & Estoque" (`POST/PUT/PATCH/DELETE /api/products`).
**Quem lê:** listagem de produtos, modal "Enviar Produto" no chat e o prompt da IA (somente `active = true` e `stock > 0`).

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `name` | text | — | — | Nome comercial (ex.: "Kit Mala de Bordo + Frasqueira Rígida"). |
| `sku` | text | sim | — | Código interno (ex.: `KIT-BORDO-TERRA`). Não é unique no banco. |
| `category` | enum `ProductCategory` | — | `BORDO` | `BORDO`, `MEDIA_GRANDE`, `FRASQUEIRA`, `MOCHILA`, `ACESSORIOS`. |
| `price` | numeric(10,2) | — | — | Preço cheio em R$. |
| `pixPrice` | numeric(10,2) | sim | — | Preço com desconto Pix (usado no prompt e na proposta). |
| `stock` | integer | — | `0` | Quantidade física. **Não pode ser negativo** (API usa `Math.max(0, ...)`). |
| `minStock` | integer | — | `3` | Alerta de reposição (estoque baixo). |
| `dimensions` | text | sim | — | Medidas (ex.: `55 x 35 x 25 cm (Padrão ANAC)`). |
| `colors` | text[] | sim | `[]` | Cores disponíveis (ex.: `["Terracota","Preto"]`). |
| `imageUrl` | text | — | — | URL/caminho da foto. |
| `description` | text | sim | — | Descrição comercial. |
| `active` | boolean | — | `true` | Soft delete: produto inativo some da API e da IA. |
| `createdAt` / `updatedAt` | timestamp | — | `now()` / Prisma | Auditoria. |

**Relações:** `store` apenas. Não há vínculo produto↔conversa: quando a IA cita um produto, é texto livre.
**Índices:** PK `id`; índice composto `(storeId, active)` — cobre a listagem da loja e a query da IA (`active = true`).
**Uso pela IA:** o prompt lista nome, preço, Pix, estoque, cores, medidas e descrição. Produto com `stock = 0` **não** entra no contexto.

---

### 5.4 `leads` — funil de vendas

**Para que serve:** o "cliente potencial" e o estágio dele no funil. É a tabela que o Kanban/Funil arrasta.
**Quem escreve:** seed, `PATCH /api/leads/:id/stage`, `/ai-status`, `/urgency`, e o envio de mensagens (atualiza `lastInteraction`/`unreadCount`).
**Quem lê:** Dashboard, Funil, Kanban e a lista de Chats.

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `name` | text | — | — | Nome do cliente (ex.: "Dra. Camila Vasconcelos"). |
| `phone` | text | — | — | Telefone **como texto livre, com máscara** (`(98) 99123-4455`). Não há normalização E.164 ainda. |
| `interest` | text | sim | — | Interesse principal (ex.: "Kit Mala de Bordo + Frasqueira Terracota"). |
| `estimatedValue` | numeric(10,2) | — | `0` | Valor potencial da venda (métrica do funil). |
| `stage` | enum `LeadStage` | — | `NOVO` | Etapa do funil: `NOVO`, `ATENDIMENTO_IA`, `INTERVENCAO_HUMANA`, `EM_NEGOCIACAO`, `FECHADO`, `PERDIDO`. |
| `aiStatus` | enum `AIStatus` | — | `ACTIVE` | Se a IA responde (`ACTIVE`), está pausada (`PAUSED`) ou desligada (`DISABLED`). |
| `pausedUntil` | timestamp | sim | — | Até quando a pausa vale. **Se já passou, a IA volta sozinha** na próxima leitura (`resumeExpiredPauses`). |
| `lastInteraction` | timestamp | — | `now()` | Última movimentação (mensagem/estágio). Usada para ordenar. |
| `urgent` | boolean | — | `false` | Marca "precisa de atenção" (vermelho no Dashboard). |
| `urgentReason` | text | sim | — | Motivo da urgência (ex.: "embarque em 48h"). |
| `unreadCount` | integer | — | `0` | **Contador incremental** de mensagens não lidas do cliente. Ver pegadinha 9.6 (não é decrementado hoje). |
| `tags` | text[] | sim | `[]` | Etiquetas livres (`["Alta Intenção","Pix"]`). |
| `assignedToId` | text | sim | — | FK → `users.id` com **ON DELETE SET NULL** (se o usuário for apagado, o lead fica sem responsável). |
| `createdAt` / `updatedAt` | timestamp | — | `now()` / Prisma | Auditoria. |

**Relações:** `store`; `assignedTo` (User); `conversation` (1:1).
**Índices:** PK `id`; `(storeId, stage)` para o funil/Kanban; `(storeId, lastInteraction)` para a ordenação do pipeline; `(storeId, aiStatus, pausedUntil)` para o "quem está pausado e até quando".
**Espelhamento importante:** `stage` e `aiStatus`/`pausedUntil` existem também em `conversations` e são mantidos em sincronia pelo backend (`server/services/leadState.ts`). Se você atualizar um, atualize o outro.

---

### 5.5 `conversations` — a "aba" de conversa do inbox

**Para que serve:** representa a conversa de WhatsApp de um lead. Guarda o resumo exibido na lista (última mensagem/hora) para o inbox não precisar varrer `messages` a cada render.
**Quem escreve:** `ensureConversationForLead` (cria sob demanda), envio de mensagens e mudanças de estágio/pausa.
**Quem lê:** tela Chats (lista + cabeçalho).

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `leadId` | text | — | — | FK → `leads.id` (CASCADE) e **unique** → garante **1 conversa por lead**. |
| `phone` | text | — | — | Cópia denormalizada do telefone do lead. |
| `leadName` | text | — | — | Cópia denormalizada do nome (evita join na lista). |
| `stage` | enum `LeadStage` | — | `NOVO` | Espelho de `leads.stage`. |
| `aiStatus` | enum `AIStatus` | — | `ACTIVE` | Espelho de `leads.aiStatus`. |
| `pausedUntil` | timestamp | sim | — | Espelho de `leads.pausedUntil`. |
| `lastMessage` | text | sim | — | Prévia da última mensagem. |
| `lastMessageAt` | timestamp | — | `now()` | Quando foi a última mensagem. **Ordena o inbox** (`orderBy lastMessageAt desc`). |
| `createdAt` / `updatedAt` | timestamp | — | `now()` / Prisma | Auditoria. |

**Relações:** `store`; `lead` (1:1); `messages` (1:N).
**Índices:** PK; **unique** em `leadId` (1:1); `(storeId, lastMessageAt)` para ordenar o inbox da loja.

---

### 5.6 `messages` — histórico do chat

**Para que serve:** cada mensagem trocada, com autor e status de leitura. É o contexto que a IA usa para responder.
**Quem escreve:** o webhook da Evolution (`server/routes/webhooks.ts`), `POST /api/conversations/:leadId/messages`, `POST .../ai-reply` (a resposta da IA é persistida aqui) e o envio real do S4/auto-resposta (`server/services/whatsappFlow.ts`).
**Quem lê:** tela Chats e o `generateAIReply` (últimas 10–14 mensagens montam o histórico multi-turno).

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `conversationId` | text | — | — | FK → `conversations.id` (CASCADE). |
| `sender` | enum `MessageSender` | — | — | Quem enviou: `CLIENT` (cliente), `AI` (agente virtual) ou `AGENT` (atendente humano). |
| `text` | text | — | — | Conteúdo da mensagem. |
| `mediaUrl` | text | sim | — | URL de mídia. **Campo preparado, ainda não usado** (o chat não envia/renderiza imagem). |
| `externalId` | text | sim | — | **Unique.** `key.id` do WhatsApp (webhook e envio). É a chave de dedupe das reentregas e da correlação dos ticks. Sem ele, o webhook **descarta** a mensagem. |
| `status` | enum `MessageStatus` | — | `SENT` | `PENDING → SENT → DELIVERED → READ`, ou `FAILED`. O envio do S4 nasce `PENDING` e vira `SENT` (com `externalId`) ou `FAILED` (com `error`). |
| `error` | text | sim | — | Motivo da falha de envio (só quando `status = FAILED`). |
| `delivered` | boolean | — | `true` | Se a mensagem chegou ao destino. Com o envio real, mensagens `PENDING`/`FAILED` ficam `false`. |
| `read` | boolean | — | `false` | Para mensagens do cliente, indica se o atendente já leu. O badge de "não lidas" usa **este campo**. |
| `isLearned` | boolean | — | `false` | Marca que a mensagem virou ensinamento da IA. **Hoje só o seed preenche**; o botão "Ensinar IA" cria o `ai_knowledge` mas ainda não marca a mensagem. |
| `createdAt` | timestamp | — | `now()` | Ordem cronológica do chat (`orderBy createdAt asc`). No webhook, usa o `messageTimestamp` do WhatsApp (segundos) quando disponível. |

**Índices:** PK `id`; índice composto `(conversationId, createdAt)` — é exatamente o acesso do chat (mensagens de uma conversa em ordem cronológica) e o do histórico da IA; **unique** em `externalId` (dedupe).

---

### 5.7 `ai_configs` — como a IA fala

**Para que serve:** traduz as escolhas visuais do lojista (tom, emojis, gírias, CTA, limite de palavras, horário) em dados que o prompt usa. O lojista **nunca digita prompt**.
**Quem escreve:** `GET/PUT /api/ai-config` (a tela "Linguagem da IA" salva a cada clique).
**Quem lê:** `generateAIReply` em toda geração de resposta.

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE) e **unique** → 1 config por loja. |
| `tone` | enum `AITone` | — | `CONSULTIVO` | Tom de voz: `CONSULTIVO`, `VENDEDOR`, `DIRETO`, `AFETUOSO`. |
| `emojiIntensity` | enum `EmojiIntensity` | — | `MODERATE` | `NONE`, `MODERATE`, `EXPRESSIVE`. |
| `slangType` | enum `SlangType` | — | `DESCONTRAIDO` | `NEUTRO`, `REGIONAL_SLZ`, `DESCONTRAIDO`, `FORMAL`. |
| `ctaStrategy` | enum `CTAStrategy` | — | `GRUPO_VIP_WHATSAPP` | `LINK_PAGAMENTO`, `DIRECIONAR_LOJA_FISICA`, `GRUPO_VIP_WHATSAPP`, `CONSULTOR_HUMANO`. |
| `maxWordsPerReply` | integer | — | `55` | Limite de palavras por resposta (instrução do prompt). API valida 20–200. |
| `activeHoursStart` | text | — | `08:00` | Início do horário de atendimento (`HH:MM`). **Ainda não é aplicado** no envio automático. |
| `activeHoursEnd` | text | — | `22:00` | Fim do horário de atendimento. |
| `respondOffHours` | boolean | — | `true` | Se deve responder fora do horário. **Ainda não aplicado.** |
| `autoReplyEnabled` | boolean | — | `false` | Liga a resposta automática no WhatsApp em produção. **A Onda 2/S6 ainda não implementou a automação geral**; no Modo Teste a IA responde mesmo com esta flag `false` (a lista de números é a trava). |
| `replyDelaySeconds` | integer | — | `8` | Debounce entre a mensagem do cliente e a resposta automática. No webhook do Modo Teste o atraso é **capado em 2 s** (limite da Vercel); a Onda 2 deve mover a automação para uma fila. |
| `dailyReplyLimit` | integer | — | `200` | Proteção de custo/loop por loja. **Ainda não aplicado** (a Onda 2/S6 aplica). |
| `createdAt` / `updatedAt` | timestamp | — | `now()` / Prisma | Auditoria. |

**Criação sob demanda:** se a loja não tiver configuração, o `GET /api/ai-config` cria uma com os defaults (`ensureAIConfig`).
**Índices:** PK `id`; **unique** em `storeId` (garante 1 config por loja).

---

### 5.8 `ai_knowledge` — o que a IA aprendeu (RAG)

**Para que serve:** pares pergunta/resposta que o lojista ensina (pelo chat ou manualmente) e que entram no prompt como base de conhecimento.
**Quem escreve:** `POST /api/knowledge` (botão "Ensinar IA com esta resposta" e cadastro manual na tela de IA).
**Quem lê:** `generateAIReply` (os **20 mais recentes**).

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `question` | text | — | — | Pergunta/contexto (API limita a 500 caracteres). |
| `answer` | text | — | — | Resposta ensinada. |
| `source` | enum `KnowledgeSource` | — | `HUMANO_CHAT` | `HUMANO_CHAT` (aprendido no atendimento) ou `MANUAL`. |
| `createdAt` | timestamp | — | `now()` | Usado para escolher os 20 mais recentes. |

**Limitação atual:** não há embeddings/busca semântica — o prompt recebe os 20 mais recentes (ver 9.9).
**Índices:** PK `id`; `(storeId, createdAt)` para buscar os ensinamentos mais recentes da loja.

---

### 5.9 `quick_replies` — atalhos do atendente

**Para que serve:** respostas prontas que o atendente insere no chat com um clique (ex.: medidas ANAC, condições de pagamento). Também vão para o prompt da IA.
**Quem escreve:** `POST /api/quick-replies` (tela "Linguagem da IA" + modal do chat).
**Quem lê:** chips do chat, modal de respostas rápidas e o prompt da IA.

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `title` | text | — | — | Título exibido no chip (ex.: "Medidas Padrão ANAC"). |
| `shortcut` | text | — | — | Atalho normalizado pela API (`/bordo`, `/pagamento`). **Único por loja é validado na aplicação**, não no banco. |
| `category` | text | — | `geral` | Texto livre validado pela API: `medidas`, `precos`, `envio`, `garantia`, `pagamento`, `geral`. **Não é enum no banco.** |
| `content` | text | — | — | Texto que será inserido no chat. |
| `createdAt` | timestamp | — | `now()` | Ordem dos chips no chat (mais antigos primeiro). |

**Índices:** PK; **unique composta `(storeId, shortcut)`** — o banco agora é a última linha de defesa contra atalho duplicado (a API também pré-checa para dar mensagem amigável e converte `P2002` em **409**).

---

### 5.10 `follow_up_campaigns` — campanhas de follow-up

**Para que serve:** campanhas automáticas para reaquecer leads parados (ex.: 24h sem resposta).
**Quem escreve:** seed hoje. A tela "Campanhas Follow-up" **ainda usa dados mock** e não persiste.
**Quem lê:** futuro agendador (scheduler).

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE). |
| `title` | text | — | — | Nome da campanha. |
| `triggerHours` | integer | — | `24` | Gatilho: horas sem resposta. |
| `targetStage` | enum `LeadStage` | — | `ATENDIMENTO_IA` | Público-alvo da campanha. |
| `messageTemplate` | text | — | — | Texto com placeholders futuros (ex.: `{{nome}}`). |
| `active` | boolean | — | `true` | Liga/desliga a campanha. |
| `conversionsCount` | integer | — | `0` | Quantas conversões foram atribuídas. |
| `createdAt` / `updatedAt` | timestamp | — | `now()` / Prisma | Auditoria. |

**Status:** tabela pronta, **sem execução automática** ainda (não existe cron/scheduler no backend).
**Índices:** apenas PK `id` (tabela pequena, sem consulta quente).

---

### 5.11 `dev_logs` — trilha técnica (Área Dev)

**Para que serve:** registrar tudo que é técnico e auditável: chamadas de IA (tokens/latência), erros, avisos e eventos de integração. É a fonte da Área Dev.
**Quem escreve:** `generateAIReply` (sucesso `AI_CALL` e erro `ERROR`), `generateDevDiagnosis`, o envio de mensagem por humano (`INFO`/`CRM_WEBHOOK`) e o seed.
**Quem lê:** `GET /api/dev-logs` e a tela Área Dev.

| Coluna | Tipo | Nulo? | Padrão | Descrição |
|---|---|:--:|---|---|
| `id` | text | — | cuid | PK |
| `storeId` | text | — | — | FK → `stores.id` (CASCADE) — permite billing por loja no futuro. |
| `level` | enum `LogLevel` | — | `INFO` | `INFO`, `WARN`, `ERROR`, `AI_CALL`. |
| `service` | enum `ServiceName` | — | `CRM_WEBHOOK` | `EVOLUTION_API`, `OPENAI`, `GEMINI`, `CRM_WEBHOOK`, `TOKEN_BILLING`. |
| `message` | text | — | — | Descrição legível do evento. |
| `tokensIn` | integer | sim | `0` | Tokens de entrada consumidos (só em chamadas de LLM). |
| `tokensOut` | integer | sim | `0` | Tokens de saída. |
| `latencyMs` | integer | sim | `0` | Duração em milissegundos. |
| `metadata` | jsonb | sim | — | Dados extras **variam por origem** (veja abaixo). |
| `createdAt` | timestamp | — | `now()` | Quando ocorreu. Ordena a lista (mais recente primeiro). |

**Formatos de `metadata` em uso:**
```jsonc
// Chamada de IA (sucesso)
{ "model": "gpt-4o-mini", "source": "Playground IA", "tone": "consultivo", "emojiIntensity": "moderate", "finishReason": "stop" }
// Chamada de IA (erro)
{ "error": "...", "model": "gpt-4o-mini", "source": "Chat do lead" }
// Intervenção humana
{ "leadId": "cmw...", "conversationId": "cmw..." }
// Diagnóstico da Área Dev
{ "source": "dev-diagnosis", "model": "gpt-4o-mini" }
```

**Status:** append-only. Não há rotina de retenção/limpeza (ver 9.11). Custo estimado é calculado com base no preço do gpt-4o-mini.
**Índices:** PK `id`; `(storeId, createdAt)` para a lista e o resumo de 30 dias; `(storeId, level)` para os filtros por nível.

---

### 5.12 Visão consolidada dos índices

O banco tem **26 índices**: 11 chaves primárias + **15 índices de busca/unicidade** (os novos foram criados na Fase 10). Ordem das colunas importa: um índice `(a, b)` atende consultas por `a` ou por `a + b`, mas **não** só por `b`.

| Índice | Tabela | Colunas | Por que existe |
|---|---|---|---|
| `stores_slug_key` | `stores` | `slug` (unique) | `getDefaultStore()` busca por slug |
| `users_email_key` | `users` | `email` (unique) | Login futuro + evita duplicidade |
| `users_storeId_idx` | `users` | `storeId` | Listar equipe da loja |
| `products_storeId_active_idx` | `products` | `storeId, active` | Catálogo ativo da loja (API e IA) |
| `leads_storeId_stage_idx` | `leads` | `storeId, stage` | Funil/Kanban por estágio |
| `leads_storeId_lastInteraction_idx` | `leads` | `storeId, lastInteraction` | Ordenação do pipeline |
| `leads_storeId_aiStatus_pausedUntil_idx` | `leads` | `storeId, aiStatus, pausedUntil` | Leads pausados e expiração da pausa |
| `conversations_leadId_key` | `conversations` | `leadId` (unique) | Garante 1 conversa por lead |
| `conversations_storeId_lastMessageAt_idx` | `conversations` | `storeId, lastMessageAt` | Inbox ordenado |
| `messages_conversationId_createdAt_idx` | `messages` | `conversationId, createdAt` | Histórico do chat em ordem |
| `ai_configs_storeId_key` | `ai_configs` | `storeId` (unique) | 1 config por loja |
| `ai_knowledge_storeId_createdAt_idx` | `ai_knowledge` | `storeId, createdAt` | 20 ensinamentos mais recentes |
| `quick_replies_storeId_shortcut_key` | `quick_replies` | `storeId, shortcut` (unique) | Atalho único por loja |
| `dev_logs_storeId_createdAt_idx` | `dev_logs` | `storeId, createdAt` | Lista e resumo de 30 dias |
| `dev_logs_storeId_level_idx` | `dev_logs` | `storeId, level` | Filtro por nível na Área Dev |

> `follow_up_campaigns` e as tabelas de ligação não têm índice extra: são pequenas e não têm consulta quente hoje.

---

## 6. Enums (valores fechados)

Enums são tipos do Postgres. No banco ficam em **MAIÚSCULO**; a API converte para minúsculo antes de devolver ao frontend.

| Enum | Valores | Significado | Usado em |
|---|---|---|---|
| `LeadStage` | `NOVO` | Lead recém-chegado | `leads.stage`, `conversations.stage`, `follow_up_campaigns.targetStage` |
| | `ATENDIMENTO_IA` | IA conduzindo | |
| | `INTERVENCAO_HUMANA` | Humano assumiu (IA pausada) | |
| | `EM_NEGOCIACAO` | Negociando preço/pagamento | |
| | `FECHADO` | Venda concluída | |
| | `PERDIDO` | Lead descartado | |
| `AIStatus` | `ACTIVE` | IA respondendo | `leads.aiStatus`, `conversations.aiStatus` |
| | `PAUSED` | Pausada por intervenção humana | |
| | `DISABLED` | Desligada manualmente | |
| `AITone` | `CONSULTIVO` | Tira dúvidas com calma e autoridade | `ai_configs.tone` |
| | `VENDEDOR` | Destaca oferta e cria urgência | |
| | `DIRETO` | Respostas curtas e objetivas | |
| | `AFETUOSO` | Caloroso e empático | |
| `EmojiIntensity` | `NONE` / `MODERATE` / `EXPRESSIVE` | Nenhum / 1–2 / 3–5 emojis por resposta | `ai_configs.emojiIntensity` |
| `SlangType` | `NEUTRO` / `REGIONAL_SLZ` / `DESCONTRAIDO` / `FORMAL` | Estilo de linguagem/gírias | `ai_configs.slangType` |
| `CTAStrategy` | `LINK_PAGAMENTO` | Oferecer link Pix | `ai_configs.ctaStrategy` |
| | `DIRECIONAR_LOJA_FISICA` | Convidar para a loja | |
| | `GRUPO_VIP_WHATSAPP` | Convidar para o grupo VIP | |
| | `CONSULTOR_HUMANO` | Transferir para humano | |
| `ProductCategory` | `BORDO` / `MEDIA_GRANDE` / `FRASQUEIRA` / `MOCHILA` / `ACESSORIOS` | Categorias do catálogo | `products.category` |
| `MessageSender` | `CLIENT` / `AI` / `AGENT` | Quem enviou a mensagem | `messages.sender` |
| `KnowledgeSource` | `HUMANO_CHAT` / `MANUAL` | Como o ensinamento foi criado | `ai_knowledge.source` |
| `LogLevel` | `INFO` / `WARN` / `ERROR` / `AI_CALL` | Gravidade/tipo do evento técnico | `dev_logs.level` |
| `ServiceName` | `EVOLUTION_API` / `OPENAI` / `GEMINI` / `CRM_WEBHOOK` / `TOKEN_BILLING` | Origem do evento | `dev_logs.service` |
| `Role` | `ADMIN` / `SELLER` / `DEV` | Perfil do usuário | `users.role` |

---

## 7. Receitas úteis (SQL e Prisma)

> Troque `'<storeId>'` pelo ID da loja. Em SQL puro, **aspas duplas** em colunas camelCase.
> Em `$queryRaw`, `COUNT`/`SUM` voltam como `BigInt` e `numeric`/`ROUND` voltam como string — converta antes de serializar (veja 9.15).

### 7.1 Quantos leads por estágio do funil
```sql
SELECT stage, COUNT(*) AS total
FROM leads
WHERE "storeId" = '<storeId>'
GROUP BY stage
ORDER BY total DESC;
```

### 7.2 Conversa completa de um lead (ordem cronológica)
```sql
SELECT m."createdAt", m.sender, m.text, m.read
FROM messages m
JOIN conversations c ON c.id = m."conversationId"
WHERE c."leadId" = '<leadId>'
ORDER BY m."createdAt" ASC;
```

### 7.3 Leads com a IA pausada e até quando
```sql
SELECT name, phone, "pausedUntil"
FROM leads
WHERE "storeId" = '<storeId>' AND "aiStatus" = 'PAUSED'
ORDER BY "pausedUntil" ASC;
```

### 7.4 Consumo de IA nos últimos 30 dias
```sql
SELECT
  COUNT(*)                        AS chamadas,
  SUM("tokensIn")                 AS tokens_entrada,
  SUM("tokensOut")                AS tokens_saida,
  ROUND(AVG("latencyMs"))         AS latencia_media_ms
FROM dev_logs
WHERE "storeId" = '<storeId>'
  AND level = 'AI_CALL'
  AND "createdAt" >= now() - interval '30 days';
```

### 7.5 Produtos com estoque baixo
```sql
SELECT name, stock, "minStock"
FROM products
WHERE "storeId" = '<storeId>' AND active = true AND stock <= "minStock"
ORDER BY stock ASC;
```

### 7.6 Mesmas consultas no Prisma Client
```ts
// funil
const porEstagio = await prisma.lead.groupBy({
  by: ['stage'],
  where: { storeId },
  _count: { _all: true },
});

// conversa completa
const conversa = await prisma.conversation.findUnique({
  where: { leadId },
  include: { messages: { orderBy: { createdAt: 'asc' } } },
});

// tokens 30 dias
const inicio = new Date(Date.now() - 30 * 24 * 3600 * 1000);
const agregado = await prisma.devLog.aggregate({
  where: { storeId, level: 'AI_CALL', createdAt: { gte: inicio } },
  _count: { _all: true },
  _sum: { tokensIn: true, tokensOut: true },
  _avg: { latencyMs: true },
});
```

### 7.7 Consultas validadas

Todas as receitas desta seção foram executadas contra o banco real em 2026-11-18 e retornaram resultados coerentes (funil 3/1/1, 15 mensagens, 5 chamadas de IA somando 4.574 tokens de entrada e 474 de saída). Os planos de execução das consultas mais quentes foram conferidos com `EXPLAIN` e usam os índices da seção 5.12 (`Index Scan` em `messages(conversationId, createdAt)` e nos filtros por `storeId`). Se você alterar o schema, rode-as novamente.

---

## 8. Acessar e manter o banco

**Variáveis de ambiente (`.env`, nunca versionado):**
```env
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true"  # runtime (pooler)
DIRECT_URL="postgresql://...pooler.supabase.com:5432/postgres"                    # migrations/seed (direto)
```

**Ferramentas:**
```powershell
npx prisma studio          # painel visual em http://localhost:5555
npx prisma db pull         # reflete o banco no schema (cuidado: sobrescreve o schema.prisma)
npx prisma db push         # aplica o schema no banco (é o que o projeto usa hoje)
npx prisma migrate dev     # alternativa com histórico de migrations (recomendado ao ir para produção)
```

**Seeds (idempotentes e seguros de rodar):**
```powershell
npm run seed:leads          # cria leads/conversas de demonstração que faltam
npm run seed:quick-replies  # cria atalhos de demonstração que faltam
npx prisma db seed          # ATENÇÃO: apaga e recria TODOS os dados da loja piloto
```

> ⚠️ `prisma db push` **não** mantém histórico de migrations. Em produção, prefira `prisma migrate`. Nunca rode `prisma migrate reset` sem confirmar que o banco é de desenvolvimento.
>
> ⚠️ Ao adicionar um **unique** (como `quick_replies(storeId, shortcut)`), o Prisma pede `--accept-data-loss` mesmo sem perda real: ele só está avisando que o índice falha se houver duplicatas. **Confira antes** com um `GROUP BY ... HAVING COUNT(*) > 1`; se não houver, a flag é segura.

---

## 9. Pegadinhas comuns (leia antes de codar)

1. **Enum em maiúsculo no SQL.** `WHERE stage = 'em_negociacao'` não retorna nada; o valor no banco é `'EM_NEGOCIACAO'`. Converse com o banco em UPPER e com o frontend em lower.
2. **`Decimal` não é `number`.** O Prisma devolve `Prisma.Decimal`. Sempre `Number(product.price)` antes de somar/formatar; nunca `price + 1` direto.
3. **Datas sem fuso.** As colunas são `timestamp without time zone`, tratadas como UTC. `new Date(row.createdAt)` funciona; comparações com `new Date()` também, mas evite `toISOString()` ingênuo na tela — a API já formata em pt-BR.
4. **`updatedAt` não tem default.** Se você inserir via SQL puro, precisa preencher `"updatedAt" = now()`. Pelo Prisma é automático.
5. **Estágio e IA duplicados.** `leads` e `conversations` guardam `stage`/`aiStatus`/`pausedUntil`. Sempre atualize os dois (use `server/services/leadState.ts`).
6. **`leads.unreadCount` só cresce.** O incremento acontece ao receber mensagem de cliente, mas nada decrementa. O badge da sidebar usa `messages.read`, não este campo. Se for implementar "marcar como lido", faça os dois.
7. **`phone` é texto livre.** Existem `(98) 99123-4455`, `+55 98 ...` etc. Qualquer busca por telefone precisa normalizar (só dígitos).
8. **Índices só funcionam se a consulta casar com o prefixo.** O banco tem 26 índices (ver 5.12), mas um índice `(storeId, stage)` não ajuda uma query ordenada só por `createdAt`. Antes de otimizar, rode `EXPLAIN (ANALYZE)` e veja se aparece `Index Scan`. Em tabelas de demonstração o planejador pode preferir `Seq Scan` por causa do volume — isso não significa que o índice está errado.
9. **RAG não é vetorial (ainda).** `ai_knowledge` entra no prompt por recência (20 últimos), não por similaridade. Ensinamentos antigos podem não ser usados.
10. **Unicidade agora é garantida pelo banco.** `quick_replies` tem `@@unique([storeId, shortcut])`; a API ainda pré-checa para devolver mensagem amigável com o dono do atalho e converte violação `P2002` em **409**. Ao criar novas constraints únicas, cheque duplicatas antes e só então rode `prisma db push --accept-data-loss`.
11. **`dev_logs` cresce para sempre.** Não há retenção; para relatórios, filtre por período. Futuro: apagar logs com mais de 90 dias.
12. **`follow_up_campaigns` e `users.passwordHash` são preparação.** Não há scheduler nem autenticação ainda — não presuma que existem.
13. **`isLearned` não é confiável hoje.** O ensinamento é criado em `ai_knowledge`, mas a mensagem não é marcada. Não use esse campo para métricas ainda.
14. **Multi-tenant sem auth.** `getDefaultStore()` resolve sempre a loja `malas-slz` (ou a primeira). Toda rota presume esse tenant — ao adicionar login, o `storeId` deve vir do usuário autenticado.
15. **`$queryRaw` devolve `BigInt` e string.** `COUNT(*)` e `SUM(...)` chegam como `BigInt` (e quebram `JSON.stringify`); `numeric`/`ROUND(...)` chegam como string (ex.: `"2622"`). Converta com `Number(...)` ou trate no mapper.

---

## 10. O que já existe no banco mas ainda não é usado pela aplicação

| Item | Situação |
|---|---|
| `users.passwordHash` | Sem login/autenticação |
| `users.role` | Sem controle de permissão por perfil |
| `messages.mediaUrl` | Sem upload/render de mídia |
| `messages.delivered` | Sem confirmação real de entrega |
| `messages.isLearned` | Só seed; botão de ensinar não marca |
| `ai_configs.activeHoursStart/End`, `respondOffHours` | Salvos, mas o envio automático não respeita horário |
| `follow_up_campaigns` | Tabela pronta, sem scheduler |
| `dev_logs.level = 'WARN'` / `service = 'TOKEN_BILLING'` | Enums prontos, ainda não emitidos |
| Embeddings/pgvector | Não existem; RAG é por recência |

---

## 11. Snapshot do banco (2026-11-18)

| Tabela | Registros |
|---|---:|
| `stores` | 1 |
| `users` | 2 |
| `products` | 6 |
| `leads` | 5 |
| `conversations` | 5 |
| `messages` | 15 |
| `ai_configs` | 1 |
| `ai_knowledge` | 2 |
| `quick_replies` | 5 |
| `follow_up_campaigns` | 1 |
| `dev_logs` | 6 |

> Contagens de um banco de demonstração; não são valores esperados em produção.

---

## 12. Glossário rápido

| Termo | Significado no projeto |
|---|---|
| **Tenant** | A loja cliente do CRM (linha em `stores`). |
| **Lead** | Potencial cliente no funil (`leads`). |
| **Conversa** | Inbox de WhatsApp de um lead (`conversations`, 1:1 com o lead). |
| **Intervenção humana** | Atendente respondeu → IA pausada por `interventionPauseHours`. |
| **RAG** | Base de conhecimento que alimenta o prompt (`ai_knowledge`). |
| **Quick reply** | Resposta pronta/atalho do atendente (`quick_replies`). |
| **Playground** | Tela "Linguagem da IA" onde o lojista testa a IA antes de valer no chat. |
| **DevLog** | Evento técnico registrado para auditoria e billing (`dev_logs`). |
| **Soft delete** | Desativar com `active = false` em vez de apagar. |
| **Cuid** | Formato de ID gerado pelo Prisma (string ordenável). |
