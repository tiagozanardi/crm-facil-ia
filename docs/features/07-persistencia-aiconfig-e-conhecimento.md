# Feature Handoff: Persistência da Configuração da IA e do Conhecimento (Ensinar IA)
- **Data**: 2026-11-17
- **Agente / Plataforma**: DeepSeek Harness (deepseek-flash)
- **Status**: Concluído e validado

---

### 1. Objetivo da Feature
Fazer as escolhas visuais da IA e o que o lojista ensina **sobreviverem ao recarregamento e valerem para todos os atendimentos**:

- Antes: tom, emojis, gírias, CTA, `maxWordsPerReply` e horários viviam apenas no estado do React (sumiam ao recarregar) e o "Ensinar IA com esta resposta" criava um item só na memória do navegador.
- Agora: tudo é gravado no PostgreSQL (`AIConfig` e `AIKnowledge`) e o `buildSystemPrompt()` já lê esses dados do banco em cada chamada — então a configuração salva muda de fato o comportamento da IA, inclusive entre dispositivos/atendentes.

---

### 2. Arquivos Criados ou Modificados

**Backend**
- `server/routes/aiConfig.ts` (novo):
  - `GET /api/ai-config` — devolve a configuração da loja; se não existir, cria a default na hora (`ensureAIConfig`).
  - `PUT /api/ai-config` — atualização parcial com validação: tom, intensidade de emojis, gírias, CTA, `maxWordsPerReply` (20–200) e `activeHours` (`start`, `end`, `respondOffHours`).
  - Traduz os enums do Prisma (`CONSULTIVO`, `GRUPO_VIP_WHATSAPP`...) para os valores do frontend (`consultivo`, `grupo_vip_whatsapp`...).
- `server/routes/knowledge.ts` (novo):
  - `GET /api/knowledge` — lista a base (RAG) da loja, mais recente primeiro.
  - `POST /api/knowledge` — cria um ensinamento (`question`, `answer`, `source`: `humano_chat` | `manual`).
  - `DELETE /api/knowledge/:id` — remove um ensinamento (404 se não existir).
- `server/app.ts`: registra `/api/ai-config` e `/api/knowledge`.

**Frontend**
- `src/services/api.ts`: `getAIConfig`, `updateAIConfig`, `getKnowledge`, `addKnowledge`, `deleteKnowledge`.
- `src/context/CRMContext.tsx`:
  - Hidrata `aiConfig` e `aiKnowledge` do banco no load inicial (mantendo mocks como fallback).
  - `updateAIConfig` agora persiste via `PUT` (otimista na tela + toast de erro se o banco não aceitar).
  - `teachAIFromMessage` grava o ensinamento via `POST /api/knowledge` e troca o item temporário pelo registro real devolvido pelo banco.
  - Nova ação `removeKnowledge(id)` para limpar ensinamentos errados.
- `src/views/AILanguageView.tsx`: a lista "Conhecimento Aprendido pelo Atendente" agora vem do banco, mostra botão de lixeira por item e um estado vazio explicando como ensinar a IA pelo chat.

---

### 3. Decisões Técnicas Tomadas

1. **Config criada sob demanda**: `ensureAIConfig` evita que uma loja nova (sem `AIConfig` no seed) quebre o Playground ou o chat — o primeiro GET cria o registro default.
2. **PUT parcial e validado**: o frontend salva a cada clique em um seletor, enviando só o campo alterado. O servidor valida faixas/valores e devolve 400 com mensagem clara, evitando lixo no banco.
3. **O prompt sempre lê do banco**: nenhum ajuste de tela passa a valer só no navegador — `generateAIReply` busca `AIConfig` e `AIKnowledge` a cada geração. Validado na prática: ao salvar `tone=vendedor` + `emojiIntensity=expressive`, a resposta do `/api/ai/generate` mudou para o estilo promocional com mais emojis.
4. **Ensinamento com ida e volta ao servidor**: o item aparece na hora (otimista), mas se o `POST` falhar o lojista recebe aviso — nada de fingir que aprendeu.
5. **Exclusão de conhecimento disponível na tela**: como a IA aprende com respostas humanas, é preciso permitir corrigir/remover ensinamentos ruins (botão de lixeira).
6. **Fallback preservado**: se o backend estiver offline, a tela continua funcionando com os mocks, com aviso de que não foi salvo.

---

### 4. Como Testar / Validar

1. Suba backend e frontend (`npm run server` e `npm run dev`).
2. Abra `http://localhost:3000` → **Linguagem da IA**.
3. Troque o tom para **"Vendedor Ativo"**, emojis para **"Expressivo & Animado"** e recarregue (F5): as escolhas devem continuar marcadas.
4. No chat, responda um cliente e clique em **"Ensinar IA com esta resposta"** → volte para **Linguagem da IA**: o item aparece em "Conhecimento Aprendido".
5. Recarregue: o ensinamento continua lá. Clique na lixeira e confirme que sumiu (e que continua fora após o reload).
6. Peça uma resposta no Playground: a IA deve refletir o tom/config salva e citar o conhecimento recém-aprendido quando for relevante.
7. API direta:
   ```powershell
   curl.exe -s http://localhost:3001/api/ai-config
   curl.exe -s http://localhost:3001/api/knowledge
   ```

---

### 4.1. Validação real executada (2026-11-17)

| Verificação | Resultado |
|---|---|
| `GET /api/ai-config` | 200 · `consultivo / moderate / descontraido / grupo_vip_whatsapp / 55` (defaults criados no banco) |
| `PUT /api/ai-config` (vendedor + expressive + 70) | 200 com os valores atualizados persistidos |
| Efeito real no prompt | `/api/ai/generate` passou a responder em estilo promocional ("super condição", mais emojis) — 1388 tokens, 2074 ms |
| Reversão para o padrão | 200 · voltou para `consultivo / moderate / 55` |
| `POST /api/knowledge` | 201 com o item retornado |
| `DELETE /api/knowledge/:id` | 200 `{ success: true }` e base voltou aos 2 registros do seed |
| Validações de entrada | 400 para `tone inválido` e para `maxWordsPerReply: 999` |
| Typecheck + build | `tsc -b`, `tsc -p tsconfig.server.json` e `npm run build` sem erros |
| Tela | Configuração e 2 itens de conhecimento renderizados a partir do banco (screenshot conferido) |

---

### 5. Pendências ou Próximos Passos

- **Persistir respostas rápidas**: `quickReplies` ainda vêm do mock no frontend; falta `server/routes/quickReplies.ts` e hidratação no contexto (o formulário da tela ainda salva só em memória).
- **Hidratar a Área Dev com `DevLog` real**: `devLogs` continuam mock + logs locais; falta `GET /api/dev-logs` para ver tokens/latência por loja.
- **Editar conhecimento existente**: hoje só cria e exclui; um `PUT /api/knowledge/:id` fecharia o ciclo.
- **Busca vetorial real (RAG)**: o prompt usa os 20 ensinamentos mais recentes; para escalar, embeddings + `pgvector` no Supabase.
- **Webhooks da Evolution API** (Fase 8) e **testes automatizados de rota** seguem pendentes.
