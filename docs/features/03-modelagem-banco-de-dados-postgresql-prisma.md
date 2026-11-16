# Feature Handoff: Modelagem do Banco de Dados PostgreSQL & Prisma ORM
- **Data**: 2026-11-16
- **Agente / Plataforma**: Antigravity (Senior Dev)
- **Status**: Concluído com Sucesso

---

### 1. Objetivo da Feature
Estruturar e aplicar a modelagem relacional completa do CRM no **PostgreSQL (Supabase)** utilizando o **Prisma ORM**, garantindo arquitetura multi-tenant escalável para novas lojas, controle de estoque, pipeline de leads, histórico de conversas do WhatsApp, configuração de linguagem da IA e auditoria técnica de erros/tokens.

---

### 2. Arquivos Criados ou Modificados
- `.env` & `.env.example`: Configuração das credenciais seguras do pooler e conexão direta do Supabase PostgreSQL.
- `prisma/schema.prisma`: Modelagem declarativa das entidades:
  1. `Store` (Tenant / Loja: dados cadastrais, regras de 24h, link VIP e paleta visual).
  2. `User` (Atendentes, vendedores e devs com controle de perfis).
  3. `Product` (Estoque físico, medidas ANAC, fotos, preço normal e Pix).
  4. `Lead` (Pipeline de vendas, níveis de urgência e motivos de atenção).
  5. `Conversation` & `Message` (Histórico de chats do WhatsApp, status de pausa da IA).
  6. `AIConfig` (Linguagem sem prompts: tom, intensidade de emojis, gírias regionais e CTA).
  7. `AIKnowledge` (Chunks de conhecimento RAG para aprendizado contínuo).
  8. `QuickReply` (Respostas rápidas cadastradas por atalho).
  9. `FollowUpCampaign` (Gatilhos automáticos de reaquecimento pós 24h/48h).
  10. `DevLog` (Logs de eventos da Evolution API, tokens LLM e latência).
- `prisma/seed.ts`: Script de carga inicial para popular o banco de dados com os dados oficiais da loja piloto **Malas SLZ**.
- `package.json`: Adicionadas dependências `@prisma/client`, `prisma` e `tsx` com comando de seed automatizado.

---

### 3. Decisões Técnicas Tomadas
1. **Multi-Tenant Nativo com Chave Estrangeira `storeId`**: Todas as tabelas são vinculadas a uma `Store`, permitindo isolamento de dados por loja e facilidade para plugar novos clientes no futuro.
2. **Dual-URL no Supabase (Connection Pooling)**: Configurada `DATABASE_URL` (porta 6543 via Transaction Pooler / PgBouncer) para consultas rápidas e `DIRECT_URL` (porta 5432 via Session Pooler) para migrações do Prisma sem problemas de conexão.
3. **Seed Automatizado**: O comando `npx prisma db seed` popula o banco instantaneamente, permitindo que novos desenvolvedores e agentes tenham um banco funcional com dados realistas da Malas SLZ imediatamente.

---

### 4. Como Visualizar e Gerenciar o Banco de Dados
1. **Pelo Painel do Supabase**:
   - Acesse o projeto no Supabase e clique em **Table Editor** no menu lateral para ver todas as tabelas e linhas criadas.
2. **Pelo Prisma Studio (Interface Visual Local)**:
   - No terminal, rode: `npx prisma studio`
   - Abra `http://localhost:5555` para ver e editar qualquer dado do banco como se fosse uma planilha interativa.

---

### 5. Próximos Passos (Fase 3)
- Criar a camada de API / Serviços do Backend para conectar o frontend ao Prisma.
- Integração da IA (LLM) lendo produtos, respostas rápidas e conhecimento direto do banco de dados via RAG.
