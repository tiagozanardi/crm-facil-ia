# PROJETO: CRM ÁGIL + IA (CLIENTE PILOTO: MALAS SLZ)
> **Arquivo Central de Handoff & Estado do Projeto**
> Última atualização: 2026-11-13 | Plataforma atual: Antigravity

---

## 1. Visão Geral do Produto
CRM moderno, ultrassimplificado e inteligente para pequenos lojistas que vendem via WhatsApp e Instagram (1 a 5 atendentes).
- **Cliente Piloto**: *Malas SLZ* (malas de viagem, mochilas e acessórios). A proprietária é arquiteta, exigindo um visual impecável, refinado, clean e responsivo (mobile e desktop).
- **Escalabilidade**: Multi-tenant / White-label desde o nascimento. A identidade visual (logo, paleta de cores primária/secundária, nome) é 100% customizável em tela, inclusive com algoritmo que extrai a paleta das imagens de identidade da marca.
- **IA de Atendimento**: Foco em simplicidade para leigos. O lojista **não digita prompts**; ele apenas seleciona seletores visuais amigáveis (tom consultivo vs vendedor, intensidade de emojis, gírias locais, estratégia de chamada para ação - CTA) com simulador ao vivo.
- **Intervenção Humana Inteligente**: Quando um atendente humano responde no WhatsApp, a IA pausa automaticamente por 24h. No chat, há um botão de "Adicionar resposta humana ao conhecimento da IA", permitindo que o lojista ensine a IA continuamente.
- **Redirecionamento para Fechamento**: Botão e regra para transbordar leads quentes para grupos VIP ou vendedores humanos.
- **Área de Desenvolvedor / Admin Técnico**: Painel oculto de diagnósticos, logs de erros da Evolution API / LLM e consumo de tokens por loja.

---

## 2. Stack Tecnológica
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons
- **Suporte Multi-dispositivo**: Exposto na rede local via `host: '0.0.0.0'` na porta `3000` para validação em smartphones (iOS e Android) e PCs.
- **Fase Futura (Backend)**: SQLite/PostgreSQL com Prisma/Drizzle ou Supabase + Evolution API (WhatsApp) + Provider LLM com custo/benefício otimizado.

---

## 3. Status Atual de Desenvolvimento
- [x] Inicialização do repositório Git local e regras de `.gitignore`
- [x] Configuração do protocolo de transição entre plataformas (`AGENTS.md` e `HANDOFF.md`)
- [x] Organização da pasta `docs/features/`
- [x] **CONCLUÍDO COM SUCESSO**: Criação da aplicação frontend interativa completa (Dashboard, Funil, Kanban, Chats com respostas rápidas e pausa de IA, Configuração de IA com Playground em tempo real, Follow-up, Pós-Venda, Configurações de Marca com Extrator de Cores, e Área Dev de Logs).
- [x] Build de produção testado e aprovado com TypeScript (`npm run build`).
- [ ] Subida para repositório remoto no GitHub.

---

## 4. Como Executar e Validar Localmente
1. **Instalar dependências**: `npm install` (já concluído)
2. **Iniciar servidor para a rede local**: `npm run dev` (já configurado com `--host 0.0.0.0 --port 3000`)
3. **Acesso no PC**: `http://localhost:3000`
4. **Acesso no Smartphone (mesmo Wi-Fi)**: `http://192.168.101.3:3000`

---

## 5. Histórico de Handoffs de Features
- [`docs/features/01-setup-multiagente-e-frontend-base.md`](./docs/features/01-setup-multiagente-e-frontend-base.md) (Setup multiagente e Frontend completo com tema Malas SLZ).
