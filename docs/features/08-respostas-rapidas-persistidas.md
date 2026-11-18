# Feature Handoff: Respostas Rápidas Persistidas
- **Data**: 2026-11-17
- **Agente / Plataforma**: DeepSeek Harness (deepseek-flash)
- **Status**: Concluído e validado

---

### 1. Objetivo da Feature
Tirar as respostas rápidas (atalhos que o atendente usa no chat) do mock e colocá-las no PostgreSQL:

- Antes: a lista vinha de `src/mock/initialData.ts`; cadastrar uma resposta nova só existia na memória do navegador e o formulário da tela "Linguagem da IA" sempre gravava a categoria `precos`.
- Agora: `GET/POST/DELETE /api/quick-replies` persiste tudo; o chat usa a lista real do banco; a tela mostra as respostas cadastradas com atalho e categoria, permite excluir e o formulário ganhou seletor de categoria.
- O `buildSystemPrompt()` já lia `quickReply` do banco (Fase 5), então as respostas cadastradas também passam a aparecer no contexto da IA automaticamente.

---

### 2. Arquivos Criados ou Modificados

**Backend**
- `server/routes/quickReplies.ts` (novo):
  - `GET /api/quick-replies` — lista por ordem de criação.
  - `POST /api/quick-replies` — valida `title` e `content`, normaliza o atalho (minúsculo, `-` no lugar de espaço, prefixo `/`), impede atalho duplicado na mesma loja (**409** com o nome de quem já usa) e sanitiza a categoria (`medidas | precos | envio | garantia | pagamento | geral`, default `geral`).
  - `DELETE /api/quick-replies/:id` — 404 se não existir.
- `server/app.ts`: registra `/api/quick-replies`.
- `prisma/seed-quick-replies.ts` (novo): seed **idempotente** que garante os 5 atalhos de demonstração (por `shortcut`), sem apagar nada. Script `npm run seed:quick-replies`. Adicionou o `/grupovip`, que faltava no seed principal.

**Frontend**
- `src/types/index.ts`: `QuickReply.category` agora inclui `'geral'` (mesmo default do banco).
- `src/services/api.ts`: `getQuickReplies`, `createQuickReply` (lança `ApiRequestError` com a mensagem do 409) e `deleteQuickReply`.
- `src/context/CRMContext.tsx`:
  - Hidrata `quickReplies` do banco no load inicial (fallback para o mock se o backend estiver offline).
  - `addQuickReply` continua otimista, mas persiste; se o servidor recusar (ex.: atalho duplicado), **remove o item temporário** e mostra o motivo no toast.
  - Nova ação `removeQuickReply(id)`.
- `src/views/AILanguageView.tsx`: seletor de categoria no formulário e nova lista "Respostas Rápidas Cadastradas (n)" com badge "Salvas no banco", atalho e botão de lixeira por item.

---

### 3. Decisões Técnicas Tomadas

1. **Atalho único por loja**: o atalho é o que o atendente digita no chat; duplicar criaria ambiguidade. O `POST` devolve 409 explicando qual resposta já usa o atalho, e o frontend desfaz o item otimista.
2. **Normalização no servidor**: `"/Bordo VIP"` vira `/bordo-vip`. Assim o comportamento é o mesmo para quem cria pelo navegador ou por integração externa.
3. **Categoria validada e com default**: evita strings soltas no banco (`categoria: "preço"`), que quebrariam filtros futuros.
4. **Seed separado e idempotente**: `seed:leads` e `seed:quick-replies` só criam o que falta. Como o seed principal apaga tudo, esses dois são seguros para rodar em qualquer momento.
5. **Otimista com rollback**: o lojista vê a resposta na hora; se o banco recusar, ela desaparece e o aviso explica — nada de lista "fantasma".

---

### 4. Como Testar / Validar

1. Suba backend e frontend (`npm run server` / `npm run dev`).
2. Abra **Linguagem da IA** → seção "Cadastrar Nova Resposta Rápida".
3. Preencha título, atalho (`pix`), categoria **Pagamento** e o texto → **Salvar**.
4. A resposta aparece na lista abaixo com `/pix` e ícone de lixeira; recarregue (F5) e confirme que continua lá.
5. Abra **WhatsApp & Chats**: os chips de resposta rápida do rodapé mostram a lista do banco (inclusive a nova).
6. Tente cadastrar outro atalho igual a `/pix` → deve aparecer o aviso de atalho duplicado e o item não permanece.
7. Clique na lixeira de um item → some da lista e continua fora após o reload.
8. API direta:
   ```powershell
   curl.exe -s http://localhost:3001/api/quick-replies
   ```

---

### 4.1. Validação real executada (2026-11-17)

| Verificação | Resultado |
|---|---|
| `GET /api/quick-replies` | 200 · 5 itens do banco (`/bordo`, `/garantia`, `/pagamento`, `/envio`, `/grupovip`) com categorias corretas |
| `POST /api/quick-replies` | 201 · atalho normalizado (`horario` → `/horario`) e categoria `geral` |
| `POST` com atalho repetido | **409** `"O atalho /horario já está em uso por ..."` |
| `DELETE /api/quick-replies/:id` | 200 `{ success: true }` · base voltou a 5 itens |
| `POST` sem `title` | 400 `Campo "title" é obrigatório` |
| UTF-8 (acentos) | ida e volta preservados (`Horário de Funcionamento UTF8`) |
| Seed idempotente | 4 mantidos + `/grupovip` criado; total 5 |
| Typecheck + build | `tsc -b`, `tsc -p tsconfig.server.json` e `npm run build` sem erros |
| Tela | lista "Respostas Rápidas Cadastradas (5)" com badge "Salvas no banco", atalhos e lixeiras (screenshot conferido) |

---

### 5. Pendências ou Próximos Passos

- **Editar resposta existente**: hoje só cria e exclui; falta `PUT /api/quick-replies/:id` + edição inline na lista.
- **Hidratar a Área Dev com `DevLog` real** (`GET /api/dev-logs`): os logs exibidos ainda são mock + os gerados na sessão.
- **Reordenar/favoritar atalhos**: os 3 primeiros chips no chat seguem a ordem de criação.
- **Webhooks da Evolution API** (próxima fase) e **testes automatizados de rota**.
