# DIRETRIZES PARA AGENTES DE IA (AGENTS.MD)

> **Atenção Agente**: Este repositório é desenvolvido de forma colaborativa entre múltiplos ambientes (Antigravity, DeepSeek Harness, etc.) e múltiplos agentes especializados. Você DEVE seguir rigorosamente este protocolo antes, durante e após qualquer tarefa.

---

## 1. Regra de Ouro: Entrada e Saída
1. **Ao Iniciar Qualquer Tarefa**:
   - Leia obrigatoriamente o arquivo [`HANDOFF.md`](./HANDOFF.md). Ele contém o estado atualizado do projeto, a stack, o que já foi feito e o que é o próximo passo.
   - Verifique a pasta `docs/features/` para entender o histórico de decisões técnicas das features já entregues.
   - Consulte [`docs/database/dicionario-do-banco-de-dados.md`](./docs/database/dicionario-do-banco-de-dados.md) antes de mexer em schema, Prisma ou consultas — ele explica cada tabela, coluna, enum e as pegadinhas do banco.
   - **NUNCA** assuma ou adivinhe requisitos que possam quebrar a arquitetura existente. Se houver dúvida crítica, pergunte ao usuário.

2. **Ao Concluir Qualquer Tarefa**:
   - Crie um arquivo de handoff específico da feature em `docs/features/<nome-da-feature>.md`.
   - Atualize o arquivo principal [`HANDOFF.md`](./HANDOFF.md) refletindo o novo status do projeto, pendências e próximos passos.
   - Verifique se a aplicação compila sem erros (`npm run build`).
   - Registre um commit no Git com mensagem semântica (ex: `feat(chat): adiciona gaveta de respostas rapidas`).

---

## 2. Estrutura do Arquivo de Handoff da Feature (`docs/features/<nome-da-feature>.md`)
Todo agente que desenvolver ou alterar uma feature deve documentar usando este template padrão:

```markdown
# Feature Handoff: [Nome da Feature]
- **Data**: AAAA-MM-DD
- **Agente / Plataforma**: [Ex: DeepSeek Harness / Antigravity]
- **Status**: [Concluído | Parcial | Bloqueado]

### 1. Objetivo da Feature
O que foi implementado e qual problema resolveu.

### 2. Arquivos Criados ou Modificados
- `caminho/do/arquivo1.tsx`: Descrição do que faz.
- `caminho/do/arquivo2.ts`: Descrição do que faz.

### 3. Decisões Técnicas Tomadas
Por que foi feito desta forma e quais padrões foram adotados.

### 4. Como Testar / Validar
Passo a passo prático para testar no navegador (PC e Mobile).

### 5. Pendências ou Próximos Passos
O que o próximo agente deve prestar atenção ao continuar ou integrar.
```

---

## 3. Padrões de Código e Arquitetura
- **Linguagem & Framework**: React 18+ com TypeScript e Vite.
- **Estilização**: Tailwind CSS com variáveis CSS dinâmicas (`--color-primary`, `--color-accent`, etc.) para suporte total a multi-tenant e personalização da paleta da loja.
- **Design System**: Estilo limpo, moderno, com micro-interações, focado na experiência de lojistas não-técnicos (cliente inicial: Malas SLZ - arquitetura visual clean, tons terracota/grafite/areia).
- **Responsividade**: Mobile-first e Desktop friendly (acesso via rede local Wi-Fi para testes no smartphone).
- **Semântica de Componentes**: Componentes desacoplados, modulares e reutilizáveis em `src/components/`.
- **Área Dev/Admin**: Telas de logs técnicos e diagnósticos de IA devem ser isoladas, com chave de acesso ou toggle de desenvolvedor, invisíveis para o lojista comum.

---

## 4. Como Manter o Contexto Limpo
Não despeje logs massivos ou histórico redundante no chat. Sempre confie no `HANDOFF.md` e nos arquivos da pasta `docs/` como memória persistente entre trocas de agentes e plataformas.
