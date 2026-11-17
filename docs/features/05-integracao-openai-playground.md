# Feature Handoff: Integração OpenAI — Playground da IA com GPT-4o-mini
- **Data**: 2026-11-17
- **Agente / Plataforma**: Antigravity (Claude Sonnet 4.6 Thinking)
- **Status**: Concluído

---

### 1. Objetivo da Feature
Integrar a **OpenAI GPT-4o-mini** ao CRM, substituindo o simulador estático do Playground da IA por respostas reais geradas pelo LLM. A IA é alimentada com o catálogo de produtos do Supabase, as configurações de linguagem (AIConfig), as respostas rápidas cadastradas e a base de conhecimento (RAG), tudo montado dinamicamente em um system prompt sem que o lojista precise escrever uma linha de prompt.

---

### 2. Arquivos Criados ou Modificados

- `server/services/openai.ts`: Coração da integração:
  - Singleton do cliente OpenAI.
  - Função `buildSystemPrompt()` que monta o system prompt completo a partir de: loja, AIConfig (tom, emojis, gírias, CTA, maxWords), catálogo de produtos (com preço Pix, estoque, medidas ANAC, cores), respostas rápidas e chunks de conhecimento RAG.
  - Constante `OPENAI_MODEL` lida de `process.env.OPENAI_MODEL` (padrão: `gpt-4o-mini`).
- `server/routes/ai.ts`: Rota `POST /api/ai/generate`:
  - Recebe `{ message, conversationHistory? }`.
  - Busca dados do banco em paralelo (produtos, quickReplies, AIConfig, AIKnowledge).
  - Chama OpenAI com histórico multi-turno (últimas 10 mensagens).
  - Registra DevLog assíncrono (tokens in/out, latência, modelo, tom) sem bloquear a resposta.
  - Retorna `{ response, model, tokensUsed, latencyMs }`.
- `server/app.ts`: Registrada nova rota `/api/ai`.
- `src/services/api.ts`: Adicionados tipos `ChatHistoryEntry`, `AIGenerateResult` e método `apiService.generateAIResponse()`.
- `src/views/AILanguageView.tsx`: Playground totalmente renovado:
  - `handleSimulate` agora é async e chama `apiService.generateAIResponse()`.
  - **Fallback resiliente**: se o backend estiver offline ou a chave não estiver configurada, exibe aviso amarelo e cai na simulação local (sem quebrar a tela).
  - **Multi-turno**: histórico de conversa exibido em bolhas de chat (user/assistant).
  - **Metadados**: exibe modelo, tokens usados e latência embaixo da resposta.
  - Botão "Limpar histórico" aparece quando há contexto acumulado.
  - `Enter` (sem Shift) envia a mensagem.
- `.env` e `.env.example`: Adicionadas variáveis `OPENAI_API_KEY` e `OPENAI_MODEL`.

---

### 3. Decisões Técnicas Tomadas

1. **System Prompt Dinâmico (Sem Prompts para o Lojista)**: O `buildSystemPrompt()` traduz as escolhas visuais do lojista (tom, emojis, gírias, CTA, maxWords) em instruções precisas para o LLM. O lojista nunca vê um prompt — só clica em seletores.
2. **Modelo Configurável via Env**: `OPENAI_MODEL=gpt-4o-mini` como padrão. Para trocar para `gpt-4o` ou outro, basta alterar a variável de ambiente — zero alteração de código.
3. **Multi-turno no Playground**: O histórico da conversa é enviado a cada chamada (últimas 10 mensagens), permitindo que o lojista teste conversas completas com contexto real, não só perguntas isoladas.
4. **DevLog Automático**: Toda chamada à OpenAI gera um `DevLog` no banco (`level: AI_CALL`, `service: OPENAI`) com tokens in/out e latência. Erros também são logados (`level: ERROR`). O lojista vê isso na Área Dev/Admin.
5. **Fallback Resiliente no Frontend**: Se o backend estiver offline ou a chave não estiver configurada, o Playground exibe um aviso amarelo e usa a simulação local original. A tela nunca quebra.

---

### 4. Como Testar

1. Adicione sua chave de API ao `.env`:
   ```
   OPENAI_API_KEY="sk-sua-chave-aqui"
   OPENAI_MODEL="gpt-4o-mini"
   ```
2. Suba o backend:
   ```powershell
   npm run server
   ```
3. Suba o frontend:
   ```powershell
   npm run dev
   ```
4. Acesse `http://localhost:3000` → aba **"Configuração de IA"**.
5. Escolha tom, emojis, gírias e CTA ao lado esquerdo.
6. Digite uma pergunta de cliente e clique em **"Simular Resposta da IA"**.
7. A resposta virá do GPT-4o-mini com o contexto completo da Malas SLZ (produtos, estoque, medidas ANAC, etc.).
8. Continue conversando — o contexto é mantido em multi-turno.

---

### 5. Próximos Passos (Fase 6)
- **Integrar IA ao ChatView**: Quando um atendente clica em "Responder com IA" no chat de um lead, a mesma rota `/api/ai/generate` é chamada com o histórico real da conversa.
- **Módulos de Leads e Conversas**: `server/routes/leads.ts` e `server/routes/conversations.ts` para persistir pipeline e chats no banco.
- **Webhooks da Evolution API**: Receber mensagens reais do WhatsApp e responder automaticamente via `/api/ai/generate`.
- **Salvar AIConfig no banco**: Atualmente, as configs de IA são salvas no estado local do React. Criar `server/routes/aiConfig.ts` para persistir no Supabase.
