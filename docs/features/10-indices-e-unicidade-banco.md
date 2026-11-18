# Feature Handoff: Índices de Performance e Unicidade no Banco
- **Data**: 2026-11-18
- **Agente / Plataforma**: DeepSeek Harness (deepseek-flash)
- **Status**: Concluído e validado

---

### 1. Objetivo da Feature
O dicionário do banco apontou duas dívidas técnicas concretas:

1. **Performance**: só existiam chaves primárias e uniques. Toda listagem filtra por `storeId`, o inbox ordena por `lastMessageAt`, o chat lê `messages` por `conversationId + createdAt` e a Área Dev filtra `dev_logs` por `storeId + createdAt/nível` — tudo isso fazia *seq scan*.
2. **Integridade**: o atalho de resposta rápida (`quick_replies.shortcut`) era único apenas por uma checagem em código, sujeita a corrida entre duas requisições simultâneas.

Esta fase cria os índices que casam com as consultas reais do produto e move a unicidade do atalho para o **banco** (com a API continuando a devolver erro amigável).

---

### 2. Arquivos Criados ou Modificados

- `prisma/schema.prisma`:
  - **Novo unique**: `QuickReply @@unique([storeId, shortcut])` (atalho único por loja).
  - **Novos índices**:
    - `Product @@index([storeId, active])`
    - `Lead @@index([storeId, stage])`, `@@index([storeId, lastInteraction])`, `@@index([storeId, aiStatus, pausedUntil])`
    - `Conversation @@index([storeId, lastMessageAt])`
    - `Message @@index([conversationId, createdAt])`
    - `AIKnowledge @@index([storeId, createdAt])`
    - `DevLog @@index([storeId, createdAt])`, `@@index([storeId, level])`
    - `User @@index([storeId])`
- `server/routes/quickReplies.ts`: o `POST` agora trata violação de unicidade (`P2002`) e responde **409** com mensagem clara, além da pré-checagem que já existia (defesa em profundidade).
- `docs/database/dicionario-do-banco-de-dados.md`: atualizado com a seção **5.12 Visão consolidada dos índices**, novos índices por tabela, aviso sobre `--accept-data-loss` e revisão das pegadinhas 9.8/9.10.

---

### 3. Decisões Técnicas Tomadas

1. **Índices compostos na ordem do acesso.** O Postgres só usa o índice se a consulta casar com o **prefixo** das colunas. Por isso `messages(conversationId, createdAt)` (busca por conversa já ordenada) e `leads(storeId, stage)` (funil por loja). Criar `(createdAt, conversationId)` não ajudaria o chat.
2. **Unicidade no banco + mensagem amigável na aplicação.** O `@@unique([storeId, shortcut])` elimina a corrida; a API continua fazendo a checagem prévia para responder "o atalho /bordo já está em uso por 'Medidas Padrão ANAC (10kg)'" em vez de um erro genérico de constraint.
3. **`db push` com `--accept-data-loss` consciente.** O Prisma exige a flag ao adicionar um unique, mesmo sem perda de dados. Antes, rodei `GROUP BY ... HAVING COUNT(*) > 1` e confirmei **zero duplicatas** (5 atalhos, todos distintos).
4. **Regeneração do client**: o `db push` falhou ao trocar a DLL do query engine com o backend rodando (`EPERM`). Parei o processo, rodei `prisma generate` e subi de novo — anotado para o próximo agente não perder tempo.
5. **Índice só onde há consulta quente.** `follow_up_campaigns` e `stores` ficaram com PK/unique apenas: não há consulta frequente que justifique mais escrita em disco.

---

### 4. Como Testar / Validar

1. **Schema**:
   ```powershell
   npx prisma validate          # deve dizer "valid"
   npx prisma db push           # em dev; em prod usar migrate
   ```
2. **Índices no banco**:
   ```sql
   SELECT tablename, indexname FROM pg_indexes
   WHERE schemaname = 'public' ORDER BY tablename, indexname;
   ```
   Esperado: **26 índices** (11 PKs + 15 de busca/unicidade).
3. **Unicidade**:
   ```powershell
   # repetir o atalho /bordo deve devolver 409
   curl.exe -X POST http://localhost:3001/api/quick-replies -H "Content-Type: application/json" -d "{\"title\":\"Teste\",\"shortcut\":\"/bordo\",\"content\":\"x\"}"
   ```
4. **No Prisma Client**: a chave composta aparece como `storeId_shortcut` em `prisma.quickReply.findUnique({ where: { storeId_shortcut: { storeId, shortcut } } })`.
5. **Plano de execução** (prova de uso do índice):
   ```sql
   EXPLAIN SELECT id FROM messages WHERE "conversationId" = '<id>' ORDER BY "createdAt";
   ```
   Esperado: `Index Scan using messages_conversationId_createdAt_idx`.

---

### 4.1. Validação real executada (2026-11-18)

| Verificação | Resultado |
|---|---|
| `prisma validate` | schema válido |
| `prisma db push` | banco em sincronia (após confirmar 0 duplicatas) |
| Índices no `public` | **26** (eram 15) — 11 novas estruturas |
| Duplicata direto no banco | **bloqueada** (`P2002`) e contagem permaneceu 5 |
| Duplicata via API | **HTTP 409** com o nome do atalho dono |
| Chave composta no client | `findUnique({ storeId_shortcut })` retornou o atalho `/bordo` |
| `EXPLAIN` | `Index Scan using messages_conversationId_createdAt_idx`; filtros por `storeId` usando índice de `leads` |
| Typecheck + build | `tsc -b`, `tsc -p tsconfig.server.json` e `npm run build` OK |

---

### 5. Pendências ou Próximos Passos

- **Adotar `prisma migrate`** antes de produção (o projeto ainda usa `db push`, sem histórico de migrations).
- **Monitorar índices não usados**: `pg_stat_user_indexes` após uso real; remover os que não forem usados.
- **Retenção de `dev_logs`**: índices resolvem leitura, mas a tabela cresce para sempre; falta rotina de limpeza (> 90 dias).
- **Reavaliar índices** quando entrarem webhooks da Evolution API (novos acessos por telefone e por janela de tempo).
- **Normalização de telefone** (E.164) viabilizaria um índice único por telefone/loja — hoje `phone` é texto livre.
