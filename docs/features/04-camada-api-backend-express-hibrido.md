# Feature Handoff: Camada de API / Serviços (Backend Express Híbrido)
- **Data**: 2026-11-17
- **Agente / Plataforma**: Antigravity (Claude Sonnet 4.6 Thinking)
- **Status**: Concluído

---

### 1. Objetivo da Feature
Criar a camada de backend Express + Prisma que conecta o frontend React ao PostgreSQL do Supabase, com **fallback resiliente**: se o backend estiver offline, o frontend continua funcionando com os dados mock. Quando online, os dados reais do banco assumem automaticamente no carregamento da app.

### 2. Arquivos Criados ou Modificados

**Servidor (Express):**
- `server/db.ts`: Singleton do PrismaClient com suporte a hot reload em dev.
- `server/app.ts`: Configuração do Express com CORS, JSON e registro de rotas.
- `server/index.ts`: Ponto de entrada do servidor (porta 3001 por padrão via `npm run server`).
- `server/helpers/tenant.ts`: Helper `getDefaultStore()` — resolve a loja piloto `malas-slz` com fallback para qualquer loja existente.
- `server/routes/health.ts`: `GET /api/health` — verifica status do banco e conta lojas.
- `server/routes/products.ts`: CRUD completo de produtos:
  - `GET /api/products` — lista todos os produtos ativos (ou todos com `?all=true`).
  - `POST /api/products` — cadastra produto novo.
  - `PUT /api/products/:id` — atualiza produto existente.
  - `PATCH /api/products/:id/stock` — ajusta estoque com delta +/-.
  - `DELETE /api/products/:id` — remove produto.
- `server/routes/store.ts`: Configurações da loja:
  - `GET /api/store` — retorna dados da loja e tema visual.
  - `PUT /api/store` — atualiza nome, WhatsApp, cores, regras de pausa da IA etc.

**Adaptador Vercel (Serverless):**
- `api/index.ts`: Importa o Express app e o expõe como handler serverless. Zero reescrita de código para deploy na Vercel.

**Frontend:**
- `src/services/api.ts`: Camada de serviço que encapsula todos os `fetch` para a API (produtos + loja). Todos os métodos retornam `null` em caso de falha — nunca quebram a UI.
- `src/context/CRMContext.tsx`: Modificado para:
  1. Carregar produtos e configurações da loja do backend no `useEffect` de mount (substituindo os mocks silenciosamente se o backend estiver online).
  2. Sincronizar com a API ao criar, editar, excluir produto e ajustar estoque (com atualização otimista: a UI atualiza primeiro, a API persiste em background).
  3. Sincronizar `updateStoreSettings` com `PUT /api/store`.

**Config e TypeScript:**
- `vite.config.ts`: Adicionado proxy `/api → http://localhost:3001` para dev local sem CORS.
- `vercel.json`: Atualizado para rotear `/api/*` → `api/index.ts`.
- `tsconfig.server.json`: TSConfig dedicado para o backend (`module: CommonJS`, `moduleResolution: node`).
- `package.json`: Adicionado script `npm run server` para subir o Express em dev.

---

### 3. Decisões Técnicas Tomadas

1. **Fallback Resiliente (Graceful Degradation)**: O frontend nunca quebra se a API estiver offline. O `useEffect` de mount tenta carregar dados reais do banco; se falhar (rede, banco, servidor offline), os mocks continuam ativos silenciosamente.

2. **Atualização Otimista nos Produtos**: Ao criar/editar/excluir produto, a UI atualiza instantaneamente (otimista) e a API persiste em background. Para criação, o ID temporário (`prod-{timestamp}`) é substituído pelo ID real do banco assim que a API confirmar.

3. **Arquitetura Portátil (Híbrida)**: O Express em `server/` é o código de verdade. O arquivo `api/index.ts` é apenas uma casca serverless que o importa. Isso garante que:
   - **Vercel agora (custo zero)**: deploy automático via `api/index.ts`.
   - **Railway/Render no futuro**: `npm run server` sobe o mesmo Express como servidor dedicado para Webhooks da Evolution API.

4. **Singleton do Prisma**: `server/db.ts` usa o padrão de singleton global para evitar múltiplas conexões em hot reload do Next/tsx dev mode.

5. **Multi-tenant via `getDefaultStore()`**: Cada rota busca a loja por slug (`malas-slz`), abrindo caminho para suporte a múltiplos tenants no futuro apenas passando o slug via header ou subdomínio.

---

### 4. Como Testar / Validar

**Localmente (desenvolvimento):**
```powershell
# Terminal 1: Backend Express (porta 3001)
npm run server

# Terminal 2: Frontend Vite com proxy (porta 3000)
npm run dev
```
Acesse `http://localhost:3000`. Os produtos e configurações da loja virão do PostgreSQL automaticamente.

**Testar os endpoints diretamente:**
```powershell
# Health check
curl http://localhost:3001/api/health

# Produtos
curl http://localhost:3001/api/products

# Dados da loja
curl http://localhost:3001/api/store
```

**Build de produção (Vercel):**
```powershell
npm run build   # ✅ Aprovado sem erros
```

---

### 5. Pendências / Próximos Passos (Fase 5)

- **Módulo de Leads**: Criar `server/routes/leads.ts` com CRUD do pipeline + filtros por estágio. Conectar `KanbanView` e `SalesFunnelView` ao banco.
- **Módulo de Chats/Conversas**: Criar `server/routes/conversations.ts` para persistir histórico de mensagens no PostgreSQL.
- **Módulo de AI Config**: Criar `server/routes/aiConfig.ts` para salvar configurações de linguagem da IA no banco.
- **Módulo de Quick Replies**: Criar `server/routes/quickReplies.ts`.
- **Webhooks da Evolution API**: Criar `server/routes/webhook.ts` para receber eventos do WhatsApp.
- **Autenticação**: Proteger as rotas com JWT ou sessão simples (login da loja).
