# PROJETO: CRM ÁGIL + IA (CLIENTE PILOTO: MALAS SLZ)
> **Arquivo Central de Handoff & Estado do Projeto**
> Última atualização: 2026-11-17 | Plataforma atual: Antigravity

---

## 1. Visão Geral do Produto
CRM moderno, ultrassimplificado e inteligente para pequenos lojistas que vendem via WhatsApp e Instagram (1 a 5 atendentes).
- **Cliente Piloto**: *Malas SLZ* (malas de viagem, mochilas e acessórios). A proprietária é arquiteta, exigindo um visual impecável, refinado, clean e responsivo (mobile e desktop).
- **Banco de Dados**: PostgreSQL na nuvem (Supabase) gerenciado com Prisma ORM, 100% multi-tenant e pronto para busca vetorial / RAG na IA.
- **Catálogo de Produtos & Controle de Estoque**: Gestão simples com upload de fotos, valores normais e Pix, medidas ANAC (55x35x25cm), controle rápido de quantidade (+/-) e envio direto de propostas formatadas no chat do WhatsApp.
- **Escalabilidade**: Multi-tenant / White-label desde o nascimento. A identidade visual (logo, paleta de cores primária/secundária, nome) é 100% customizável em tela, inclusive com algoritmo que extrai a paleta das imagens de identidade da marca.
- **IA de Atendimento**: Foco em simplicidade para leigos. O lojista **não digita prompts**; ele apenas seleciona seletores visuais amigáveis (tom consultivo vs vendedor, intensidade de emojis, gírias locais, estratégia de chamada para ação - CTA) com simulador ao vivo.
- **Intervenção Humana Inteligente**: Quando um atendente humano responde no WhatsApp, a IA pausa automaticamente por 24h. No chat, há um botão de "Adicionar resposta humana ao conhecimento da IA", permitindo que o lojista ensine a IA continuamente.
- **Redirecionamento para Fechamento**: Botão e regra para transbordar leads quentes para grupos VIP ou vendedores humanos.
- **Área de Desenvolvedor / Admin Técnico**: Painel oculto de diagnósticos, logs de erros da Evolution API / LLM e consumo de tokens por loja.

---

## 2. Stack Tecnológica
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons (Deploy contínuo via Vercel).
- **Backend & Database**: PostgreSQL (Supabase) + Prisma ORM 6 + TypeScript (com pooler pgbouncer ativo).
- **Fase Futura**: Integração LLM (Gemini / GPT) + Webhooks da Evolution API (WhatsApp).

---

## 3. Status Atual de Desenvolvimento
- [x] Repositório Git configurado e sincronizado com o GitHub (`https://github.com/tiagozanardi/crm-facil-ia.git`).
- [x] Configuração do protocolo de transição entre plataformas (`AGENTS.md` e `HANDOFF.md`).
- [x] **Frontend Base**: Dashboard, Funil de Vendas, Kanban, WhatsApp Chats, Configuração de IA com Playground, Follow-up, Pós-Venda, Configurações de Marca com Extrator de Cores, e Área Dev de Logs.
- [x] **Catálogo de Produtos & Controle de Estoque**: Tela dedicada com upload de fotos, preços, desconto Pix, medidas ANAC e propostas no chat.
- [x] **Fase 2 - Modelagem de Banco de Dados**:
  - PostgreSQL criado no Supabase.
  - Schema Prisma completo com 10 modelos relacionais (Store, User, Product, Lead, Conversation, Message, AIConfig, AIKnowledge, QuickReply, FollowUpCampaign, DevLog).
  - Migração executada com sucesso (`db push`).
  - Seed executado (`npx prisma db seed`) populando todos os dados da loja Malas SLZ.
- [x] Build de produção testado e aprovado com TypeScript (`npm run build`).
- [x] **Fase 4 - Camada de API / Serviços (Backend Express Híbrido)**:
  - Express + Prisma em `server/` com 3 módulos de rota: `/api/health`, `/api/products` (CRUD completo + patch de estoque), `/api/store` (GET + PUT).
  - Frontend conectado à API com fallback resiliente (graceful degradation): se backend offline → mocks assumem; se online → dados reais do banco.
  - Atualização otimista nos produtos (UI atualiza primeiro, banco persiste em background).
  - Adaptador serverless em `api/index.ts` para deploy gratuito na Vercel (mesmo código Express).
  - Proxy Vite configurado (`/api → localhost:3001`) para desenvolvimento local sem CORS.
  - `tsconfig.server.json` dedicado ao backend; ambos passam `tsc --noEmit` sem erros.
  - `npm run server` sobe o Express local (porta 3001).
- [x] **Fase 5 - Integração OpenAI (GPT-4o-mini)**:
  - `server/services/openai.ts`: system prompt dinâmico construído a partir de AIConfig + produtos + quickReplies + RAG.
  - Rota `POST /api/ai/generate` com multi-turno, registra DevLog automático (tokens, latência, modelo).
  - Playground da IA (`AILanguageView`) renovado: respostas reais do GPT-4o-mini, bolhas multi-turno, metadados (tokens/latência), fallback resiliente com aviso se backend offline.
  - Modelo configurável via `OPENAI_MODEL` no `.env` (padrão: `gpt-4o-mini`).

---

## 4. Como Executar e Validar Localmente
1. **Iniciar servidor Backend (Express + Prisma)**: `npm run server` → http://localhost:3001
2. **Iniciar servidor Frontend (Vite com proxy para a API)**: `npm run dev` → http://localhost:3000
3. **Abrir o Painel Visual do Banco de Dados (Prisma Studio)**:
   ```powershell
   npx prisma studio
   ```
   Acesse: `http://localhost:5555` para ver todas as tabelas e dados da Malas SLZ.

---

## 5. Histórico de Handoffs de Features
- [`docs/features/01-setup-multiagente-e-frontend-base.md`](./docs/features/01-setup-multiagente-e-frontend-base.md) (Setup multiagente e Frontend base).
- [`docs/features/02-catalogo-de-produtos-e-estoque.md`](./docs/features/02-catalogo-de-produtos-e-estoque.md) (Catálogo de produtos, estoque com fotos e integração com chat).
- [`docs/features/03-modelagem-banco-de-dados-postgresql-prisma.md`](./docs/features/03-modelagem-banco-de-dados-postgresql-prisma.md) (Modelagem completa do PostgreSQL no Supabase com Prisma ORM e Seed).
- [`docs/features/04-camada-api-backend-express-hibrido.md`](./docs/features/04-camada-api-backend-express-hibrido.md) (Backend Express híbrido com CRUD de Produtos e Store, fallback resiliente e adaptador Vercel Serverless).
- [`docs/features/05-integracao-openai-playground.md`](./docs/features/05-integracao-openai-playground.md) (Integração OpenAI GPT-4o-mini com system prompt dinâmico, multi-turno e DevLog automático no Playground da IA).
