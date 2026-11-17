# Feature Handoff: IA no Chat + Rotas de Leads e Conversas
- **Data**: 2026-11-17
- **Agente / Plataforma**: DeepSeek Harness (deepseek-flash)
- **Status**: Concluído e validado com a chave real da OpenAI

---

### 1. Objetivo da Feature
Fechar a Fase 6 do projeto: tirar a IA do Playground e colocá-la dentro do atendimento real. Agora:

- O botão **"Responder com IA"** no chat chama a OpenAI com o **histórico real da conversa salvo no PostgreSQL**, o catálogo de produtos, as configurações de linguagem, as respostas rápidas e a base de conhecimento (RAG).
- **Regra de intervenção humana** passa a existir no backend: quando o atendente responde, a IA é pausada por `interventionPauseHours` (padrão 24h) — no banco, não só na tela.
- Com a IA pausada, o mesmo botão gera uma **sugestão** de resposta no campo de texto, que o humano revisa e envia como atendente (respeita a pausa e acelera o atendimento).
- Pausas vencidas **voltam a IA automaticamente** na próxima leitura de leads/conversas.
- Pipeline e chats agora são **persistidos no banco**: estágio do lead, urgência, pausa/retomada da IA, mensagens de cliente/IA/atendente e última mensagem de cada conversa.

---

### 2. Arquivos Criados ou Modificados

**Backend**
- `server/services/ai.ts` (novo): serviço único de geração de resposta. Monta o system prompt a partir do banco (loja, AIConfig, produtos ativos com estoque, quick replies, conhecimento), chama a OpenAI, normaliza o histórico (últimas 10 mensagens) e registra `DevLog` de sucesso (`AI_CALL`) ou erro. Exporta `MissingApiKeyError` para mapear chave ausente em HTTP 503.
- `server/services/leadState.ts` (novo): `pauseAIForLead`, `resumeAIForLead`, `resumeExpiredPauses` e `ensureConversationForLead`. Centraliza a regra de intervenção humana e mantém `Lead` + `Conversation` sincronizados em transação. Não sobrescreve estágio de leads `FECHADO`/`PERDIDO`.
- `server/helpers/mappers.ts` (novo): tradução entre enums do Prisma (`NOVO`, `ATENDIMENTO_IA`...) e os valores do frontend (`novo`, `atendimento_ia`...), além de `formatLead`, `formatMessage`, `formatTime`, `formatRelative` e `formatPausedUntil` ("hoje 20:18", "amanhã 09:00").
- `server/routes/leads.ts` (novo): `GET /api/leads`, `PATCH /api/leads/:id/stage`, `PATCH /api/leads/:id/ai-status`, `PATCH /api/leads/:id/urgency`, `PATCH /api/leads/:id`.
- `server/routes/conversations.ts` (novo):
  - `GET /api/conversations` — lista com histórico e garante conversa para todo lead.
  - `GET /api/conversations/:leadId`.
  - `POST /api/conversations/:leadId/messages` — grava mensagem (`client` | `ai` | `agent`), atualiza `lastMessage` e, se `agent`, pausa a IA automaticamente.
  - `POST /api/conversations/:leadId/ai-reply` — responde a última mensagem do cliente usando o histórico do banco e grava a resposta da IA. Com `{ "persist": false }` devolve só o texto (modo sugestão).
- `server/routes/ai.ts` (reescrito): ficou fino e reutiliza `server/services/ai.ts`; mesmo contrato de resposta do Playground (`response`, `model`, `tokensUsed`, `latencyMs`).
- `server/app.ts`: registra `/api/leads` e `/api/conversations`.
- `prisma/seed-leads.ts` (novo): seed **idempotente** que cria os leads Rodrigo, Beatriz, Marcelo e Juliana (com conversas e mensagens) sem apagar nada. Script `npm run seed:leads`.

**Frontend**
- `src/services/api.ts`: novos tipos (`AIReplyResult`, `SendMessageResult`) e métodos `getLeads`, `getConversations`, `sendLeadMessage`, `generateAIReplyForLead`, `updateLeadStage`, `setLeadAIStatus`, `setLeadUrgency`. Erros de API agora carregam mensagem amigável (`ApiRequestError`).
- `src/context/CRMContext.tsx`:
  - Hidratação inicial também busca leads e conversas do banco (mantendo fallback para mocks se o backend estiver offline).
  - `sendMessage` persiste no PostgreSQL; `pauseAIForLead`, `resumeAIForLead`, `updateLeadStage` e `toggleLeadUrgency` sincronizam com a API.
  - Nova ação `generateAIReplyForLead(leadId, { persist })` que adiciona a mensagem da IA no chat e registra log técnico.
- `src/views/ChatView.tsx`: botão **"Responder com IA"** (com spinner e tratamento de erro via toast). Quando o lead está com IA pausada, gera sugestão no campo de texto em vez de enviar automaticamente.

---

### 3. Decisões Técnicas Tomadas

1. **Serviço de IA único**: `generateAIReply` é usado pelo Playground e pelo chat. Isso evita duas montagens de prompt divergentes e garante que ambos tenham catálogo, RAG e DevLog iguais.
2. **Histórico vindo do banco**: o chat não confia no estado do React para montar contexto — lê as últimas mensagens da `Conversation`, o que mantém a IA coerente mesmo após recarregar a página ou trocar de dispositivo.
3. **Modo sugestão quando pausado**: em vez de bloquear o botão, a IA gera um rascunho que o humano revisa. Respeita a regra de intervenção e ainda ajuda o atendente.
4. **Auto-resume de pausas vencidas**: `GET /leads` e `GET /conversations` chamam `resumeExpiredPauses`. Sem isso, um lead ficaria "pausado" para sempre após as 24h.
5. **Seed complementar idempotente**: o seed principal apaga o banco; o `seed:leads` só adiciona o que falta (checagem por telefone), podendo rodar sem medo.
6. **Fallback resiliente preservado**: se o backend cair, a UI continua com os mocks locais e os toasts explicam o problema.
7. **`persist: false` no `/ai-reply`**: um único endpoint cobre os dois fluxos (envio automático e sugestão), reduz custo de manutenção.

---

### 4. Como Testar / Validar

1. **Configure a chave real** no `.env` (nunca commitar — o arquivo é gitignored):
   ```
   OPENAI_API_KEY="sk-..."
   OPENAI_MODEL="gpt-4o-mini"
   ```
2. Suba o backend: `npm run server` (porta 3001) e o frontend: `npm run dev` (porta 3000).
3. Abra `http://localhost:3000` → aba **Chats**.
4. Selecione **Rodrigo Sampaio** (IA ativa) e clique em **"Responder com IA"**.
   - A resposta deve aparecer como bolha da IA, citando produto do catálogo e medidas ANAC.
   - O rodapé do toast mostra tokens e latência.
5. Selecione **Beatriz Menezes**, escreva uma resposta humana e envie. A IA pausa por 24h; o banner amarelo mostra "até amanhã HH:mm".
6. Com a IA pausada, clique em **"Responder com IA"**: a sugestão é inserida no campo de texto (não é enviada automaticamente).
7. Recarregue a página: as mensagens continuam lá (vieram do banco).
8. Aba **Funil/Kanban**: mover um lead de estágio deve persistir após o reload.
9. Validação de API (sem abrir o navegador):
   ```powershell
   curl.exe -s http://localhost:3001/api/leads
   curl.exe -s http://localhost:3001/api/conversations
   ```
10. Sem chave configurada, o clique em "Responder com IA" mostra o toast `OPENAI_API_KEY não configurada no .env` (HTTP 503) — comportamento esperado.

---

### 4.1. Validação real executada (2026-11-17, chave da OpenAI configurada no `.env`)

| Verificação | Resultado |
|---|---|
| `POST /api/ai/generate` (Playground) | HTTP **200** · modelo `gpt-4o-mini` · API **3746ms** · **1403 tokens** |
| `POST /api/conversations/:leadId/ai-reply` (Chat, persistindo) | HTTP **201** · **2328ms** · **1392 tokens** · mensagem gravada com `sender = AI` |
| Conteúdo gerado | Citou o produto certo do catálogo, preço Pix (R$ 781 / R$ 119), estoque, medidas ANAC e CTA do Grupo VIP — sem alucinar item fora do catálogo |
| `DevLog` no PostgreSQL | 2 registros `AI_CALL` / `OPENAI` confirmados (1312 in / 80 out e 1321 in / 82 out, com `latencyMs`) |
| Typecheck | `tsc -b` (frontend) e `tsc -p tsconfig.server.json` (backend + prisma) sem erros |
| Build de produção | `npm run build` OK (2111 módulos, bundle 370 kB) |
| Hidratação do banco | 5 leads, 5 conversas e 15 mensagens vindos do Supabase (dashboard e chats conferidos por screenshot) |

As mensagens criadas nos testes foram **removidas do banco** ao final (conversa restaurada), mantendo os DevLogs como registro real da chamada. O banco continua com os dados do seed.

---

### 5. Pendências ou Próximos Passos

- ~~Testar a IA real com a chave no `.env`~~ — **feito em 2026-11-17** (resultados na seção 4.1).
- **Persistir AIConfig** no banco: hoje tom/emojis/gírias/CTA continuam só no estado do React. Criar `server/routes/aiConfig.ts` + `GET/PUT /api/ai-config`.
- **Persistir "Ensinar IA com esta resposta"**: hoje cria apenas `AIKnowledgeItem` local; falta `POST /api/knowledge` gravando `AIKnowledge`.
- **Hidratar quickReplies e devLogs** do banco (hoje ainda vêm dos mocks; a Área Dev só vê os logs locais + os gerados nesta sessão).
- **Webhooks da Evolution API** (Fase 7): receber mensagem real do WhatsApp, aplicar pausa de intervenção e responder via `generateAIReply`.
- **Testes automatizados**: nenhum teste de rota existe ainda; `scripts/test-api.ts` só verifica conexão/contagens.
- **Mídia no chat**: `Message.mediaUrl` existe no schema, mas o frontend ainda não envia/renderiza imagens.
