# Feature Handoff: Área Dev com Logs Reais e Diagnóstico por IA
- **Data**: 2026-11-18
- **Agente / Plataforma**: DeepSeek Harness (deepseek-flash)
- **Status**: Concluído e validado

---

### 1. Objetivo da Feature
Tirar a Área Dev do mock e transformá-la numa ferramenta real de operação:

- Antes: a tela mostrava logs fixos do mock, tokens hardcoded ("48.250 tokens") e o botão "Diagnosticar com Agente de IA" devolvia um texto pré-escrito com `setTimeout` — nada vinha do banco nem da IA.
- Agora: logs reais do `DevLog` (PostgreSQL), métricas calculadas dos últimos 30 dias (tokens, custo estimado, latência média, erros/avisos, eventos por serviço), filtros por nível/serviço/busca, atualização manual e **diagnóstico real via GPT-4o-mini**.

---

### 2. Arquivos Criados ou Modificados

**Backend**
- `server/routes/devLogs.ts` (novo):
  - `GET /api/dev-logs` — lista com filtros (`level`, `service`, `search`, `limit` até 200) + `summary` de 30 dias: `tokensIn`, `tokensOut`, `tokensTotal`, `estimatedCostUsd` (tabela de preço do gpt-4o-mini), `aiCalls`, `errors`, `warnings`, `events`, `avgLatencyMs`, `byService`, `firstLogAt`.
  - `POST /api/dev-logs/:id/diagnose` — envia o log para a OpenAI com prompt de engenheiro sênior (causa raiz, impacto, severidade, ação recomendada) e registra a própria chamada como `DevLog` `AI_CALL`.
  - Mapeia enums do Prisma (`LogLevel`, `ServiceName`) para os valores do frontend.
- `server/services/ai.ts`: nova `generateDevDiagnosis()` com prompt técnico separado do prompt de atendimento (temperatura 0.2, máximo 180 palavras) e log automático de tokens/latência.
- `server/app.ts`: registra `/api/dev-logs`.
- `server/routes/conversations.ts`: quando um atendente humano responde, além de pausar a IA, agora grava um `DevLog` (`INFO` / `CRM_WEBHOOK`) — a intervenção aparece na Área Dev.

**Frontend**
- `src/types/index.ts`: `DevLogItem` ganhou `tokensIn`, `tokensOut`, `latencyMs`; novo `DevLogSummary`.
- `src/services/api.ts`: `getDevLogs(filters)` e `diagnoseDevLog(id)` (este lança `ApiRequestError` para exibir o motivo no painel).
- `src/context/CRMContext.tsx`: hidrata `devLogs` + `devLogSummary` do banco e expõe `refreshDevLogs(filters)`, usado pela tela e reutilizável por outras.
- `src/views/DevAdminView.tsx` (reescrito):
  - Cards reais: chamadas OpenAI + latência média, erros/avisos + eventos monitorados, eventos da Evolution API (com aviso honesto de "webhook real aguardando integração").
  - Lista de logs com badges por nível (`IA`, `ERRO`, `AVISO`, `INFO`), tokens e latência por evento, busca com debounce, filtros e botão de recarregar.
  - Painel de diagnóstico com loading, tratamento de erro e metadados (modelo, tokens, latência) + copiar.

---

### 3. Decisões Técnicas Tomadas

1. **Métricas no servidor**: o resumo é agregado no Prisma (não no cliente), então continua correto mesmo com a lista paginada/limitada a 100 logs.
2. **Estimativa de custo explícita**: `$0,15/1M` entrada e `$0,60/1M` saída (gpt-4o-mini) aplicados sobre os tokens reais; se o modelo mudar, é um ponto único para ajustar.
3. **Diagnóstico de verdade**: reutiliza o cliente OpenAI já configurado, mas com prompt de engenheiro — não o prompt de atendente. A chamada também é logada, então o custo do diagnóstico aparece na própria tela.
4. **Diagnóstico com temperatura baixa (0.2)** e limite curto para respostas previsíveis e baratas.
5. **Filtros no banco + busca com debounce**: evita trazer tudo e mantém a tela responsiva.
6. **Honestidade sobre integrações pendentes**: o card da Evolution API não finge "Online"; mostra quantos eventos existem e que o webhook real ainda não está integrado.
7. **DevLog de intervenção humana**: fecha o ciclo do produto — quando o lojista assume o chat, isso aparece na trilha técnica.

---

### 4. Como Testar / Validar

1. Suba backend e frontend (`npm run server` / `npm run dev`).
2. No header, clique em **Dev** (canto superior direito) — o menu "Área Dev (Logs & IA)" aparece só nesse modo.
3. Confira o banner: tokens, custo estimado e janela de 30 dias devem bater com o banco.
4. Use os filtros: nível **Chamadas de IA**, serviço **OpenAI**, e a busca `Playground`.
5. Clique num log e em **Diagnosticar com Agente de IA**: a resposta deve vir do GPT (causa raiz, impacto, severidade, ações) com tokens/latência no rodapé.
6. Recarregue a lista: o diagnóstico aparece como um novo evento `IA / OpenAI`.
7. Responda um cliente no chat como atendente e volte à Área Dev: deve existir um evento `INFO / CRM_Webhook` de intervenção humana.
8. API direta:
   ```powershell
   curl.exe -s "http://localhost:3001/api/dev-logs?level=ai_call&limit=5"
   ```

---

### 4.1. Validação real executada (2026-11-18)

| Verificação | Resultado |
|---|---|
| `GET /api/dev-logs` | 200 · 6 logs no banco · resumo com **5.048 tokens** (in 4.574 / out 474), custo **US$ 0,0010**, 5 chamadas de IA, latência média 2.622 ms |
| Filtros | `level=ai_call` → 5; `level=info` → 1; `service=Evolution_API` → 1; `search=Playground` → 2; busca sem match → 0; `limit=2` respeitado |
| `POST /api/dev-logs/:id/diagnose` | 200 em 6.669 ms · `gpt-4o-mini` · 485 tokens · 4.120 ms de latência · diagnóstico com Causa Raiz/Impacto/Severidade/Ações |
| Log do próprio diagnóstico | Novo `DevLog` `AI_CALL` registrado (307 in / 178 out, 4120 ms) e visível na lista |
| DevLog de intervenção humana | `POST` de mensagem como atendente gerou `INFO / CRM_Webhook` ("Intervenção humana: atendente respondeu Juliana Portela...") — validado e o dado de teste removido depois |
| Typecheck + build | `tsc -b`, `tsc -p tsconfig.server.json` e `npm run build` sem erros |
| Tela | Cards, filtros, lista e painel de diagnóstico renderizando dados do banco (screenshot conferido) |

---

### 5. Pendências ou Próximos Passos

- **Paginação/scroll infinito**: hoje a tela busca no máximo 100 logs (com `total` exibido).
- **Retenção**: falta rotina de limpeza de `DevLog` antigos (ex.: > 90 dias) para não crescer indefinidamente.
- **Billing real por tenant**: o custo é estimado pela tabela de preço; `TOKEN_BILLING` ainda não é gravado por loja.
- **Evolution API**: card segue aguardando a integração real dos webhooks (próxima fase sugerida).
- **Testes automatizados** de rota ainda não existem.
