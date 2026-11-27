# Feature Handoff: Validação final da Onda 1 (ticks reais)
- **Data**: 2026-11-27
- **Agente / Plataforma**: DeepSeek Harness
- **Status**: Concluído

### 1. Objetivo da Feature
Fechar o único item pendente do critério de aceite da **Onda 1** da integração Evolution API: confirmar, com o chip real conectado, que os **ticks de status** (`SENT → DELIVERED → READ`) chegam ao CRM depois da correção do parser de `MESSAGES_UPDATE` (commit `704eee0`), e revalidar o ciclo completo receber → auto-resposta do Modo Teste → enviar. Nenhum código de produção foi alterado nesta rodada.

### 2. Arquivos Criados ou Modificados
- `docs/features/14-validacao-final-onda-1.md`: este handoff.
- `HANDOFF.md`: Fase 11 marcada como concluída no critério dos ticks + diário de execução (item 29).
- `docs/features/11-onda-1-implementacao.md`: critério de aceite dos ticks marcado como validado e nota atualizada.
- `docs/features/13-s5b-chat-tempo-real.md`: pendência de validação marcada como concluída, com o achado da auto-resposta.
- `tmp/tick-validation.mjs` e `tmp/tick-db-check.mjs` (transitórios, gitignored): scripts descartáveis usados no teste.

### 3. Verificação de ambientes (antes do teste)
| Item | Resultado |
|---|---|
| Git | `main` = `origin/main` = `5432ebc`, sem pendências |
| `tsc -b` (frontend) e `tsc -p tsconfig.server.json` | sem erros |
| `npm run build` | verde — `dist/assets/index-D5MmV5vq.js` (o mesmo bundle do último deploy; a correção de fuso é só backend) |
| `.env` local | 12 variáveis presentes |
| Evolution API | HTTPS 200, v2.3.7 |
| Instância (`GET /api/whatsapp/instance?refresh=1`) | `CONNECTED`, número da loja, webhook ok |
| Vercel `/api/health` | 200, `database: connected` |
| Rotas de dados | `/api/leads`, `/api/conversations`, `/api/test-mode` → 200 |
| DevLog (30 dias) | 0 erros |
| Modo Teste | ligado para o número de teste |

### 4. Resultado do teste dos ticks
Mensagens enviadas pelo caminho real do S4 (`POST /api/conversations/:leadId/messages`, `sender: ai` para não pausar a IA):

| Momento | Mensagem | Resultado |
|---|---|---|
| 19:49 | "Teste de validação dos ticks..." | `201`, `SENT` → **`DELIVERED` em ≤3 s** → **`READ`** quando o celular abriu a conversa |
| 19:52 | "Oi, testando" (do celular) + auto-resposta do Modo Teste | cliente gravado; IA respondeu (`sendText` 201, 460 ms, 1637 tokens); resposta ficou em **`SENT`** (ver achado abaixo) |
| 19:54 | "Teste 2/2 dos ticks..." | `201`, **`DELIVERED` em ≤3 s** → **`READ` em 27 s** |

No `DevLog`, os eventos que antes caíam todos em `unknown-message` passaram a registrar **`MESSAGES_UPDATE: 1 processado(s)`** (latência 594–711 ms), confirmando que o parser novo (`keyId`, `key.id`, status numérico do Baileys) está correto em produção. O teste também revalidou o **Modo Teste** (auto-resposta só para o número da allowlist) e a **intervenção humana** feita em 23/11 (a IA permaneceu `ACTIVE`; envio como `ai` não pausa).

### 5. Decisões Técnicas Tomadas
- **Validar pelo caminho real de envio**, não por fixture: a mensagem de teste foi criada pela rota do S4, com `sender: ai` para não disparar a pausa de intervenção humana de 1h e não travar o teste inverso.
- **Diagnóstico read-only**: consulta ao Prisma só para ler `externalId`/`status` (necessita permissão ampliada por causa do TLS do sandbox) e `GET` nas rotas públicas. Nenhuma escrita fora dos envios de teste.
- **Fixtures mantidas**: as mensagens reais do teste foram preservadas na conversa "Tiago Zanardi" (lead de teste), em vez de apagadas — elas são o registro do teste e não sujam os leads de demonstração. Banco agora com 6 leads e 30 mensagens.

### 6. Achado para a Onda 2 / S6 (não bloqueia a Onda 1)
A **resposta automática** do Modo Teste ficou em `SENT` mesmo depois de entregue no celular, enquanto as duas mensagens enviadas pelo chat chegaram a `DELIVERED`/`READ`. No banco, o `externalId` dela (`3EB01AE764C709CBBC5908`) é mais curto que os das mensagens enviadas pela rota (`3EB0...`, 22 caracteres) — indício de que a linha foi adotada pelo **eco `fromMe`** antes do `markSent`, e de que os acks dessa mensagem não foram emitidos/casados. Não houve `unknown-message` depois das 19:52:15, então os acks provavelmente não chegaram. Investigar em S6:
- registrar no `DevLog` um **fingerprint** do `externalId` (prefixo/sufixo, nunca o id completo) nas duas pontas;
- garantir **status monotônico** (não rebaixar `DELIVERED`/`READ` para `SENT`/`PENDING`);
- testar auto-respostas consecutivas (fora do mesmo request do webhook) para ver se os acks voltam a casar.

### 7. Como Testar / Validar
1. Confirmar a instância: abrir Configurações → **Conexão WhatsApp** (deve estar `CONNECTED`) ou `GET /api/whatsapp/instance?refresh=1`.
2. Abrir o chat do lead de teste e enviar uma mensagem → o tick deve ir de **enviado** para **entregue** em poucos segundos; abrindo no celular, para **lido**.
3. Mandar uma mensagem do celular de teste → ela aparece no chat e a IA responde sozinha (Modo Teste).
4. Conferir na **Área Dev** os `MESSAGES_UPDATE: 1 processado(s)` correspondentes.
5. Funciona igual em mobile (390 px) e desktop.

### 8. Pendências ou Próximos Passos
- **Onda 2 / S6**: `autoReplyEnabled`/`replyDelaySeconds`/`dailyReplyLimit` na API/UI, debounce real, janela de horário, kill switch e métricas — mais o ajuste do tick da auto-resposta descrito na seção 6.
- **Onda 3**: auth da API, rate limit, auditoria de webhooks, LGPD/retenção e testes automatizados antes do piloto.
- Dívidas antigas: adoção de `prisma migrate` como rotina, retenção de `DevLog`, editar respostas rápidas/conhecimento e RAG vetorial (pgvector).
