# Feature Handoff: Catálogo de Produtos & Controle de Estoque com Upload de Fotos
- **Data**: 2026-11-13
- **Agente / Plataforma**: Antigravity (Senior Dev)
- **Status**: Concluído com Sucesso

---

### 1. Objetivo da Feature
Atender à necessidade do lojista de gerenciar produtos, preços de venda, descontos para pagamento via Pix, estoque físico e medidas/dimensões (essencial para as malas de bordo padrão ANAC da Malas SLZ). Além disso, permitir o upload direto de fotos de produtos e integrar o catálogo ao chat do WhatsApp com 1 clique.

---

### 2. Arquivos Criados ou Modificados
- `src/types/index.ts`: Adicionada a interface `Product` e tipos de categorias (`ProductCategory`).
- `src/mock/initialData.ts`: Cadastrado o catálogo inicial de produtos da Malas SLZ com fotos, dimensões ANAC, cores e valores.
- `src/context/CRMContext.tsx`: Adicionados métodos `products`, `addProduct`, `updateProduct`, `deleteProduct` e `updateProductStock`.
- `src/views/ProductsView.tsx`: Nova tela de gestão visual de estoque com:
  - Cards com foto, preço, preço com desconto Pix, medidas, cores e estoque.
  - Ajuste rápido de estoque com botões `+` e `-` com um toque no celular.
  - Métricas de estoque total, valor investido, itens com estoque baixo e esgotados.
  - Modal de cadastro/edição com upload de foto local (Base64) ou URL e atalho para dimensões ANAC.
- `src/views/ChatView.tsx`: Adicionado botão **"Enviar Produto / Estoque"** na barra de mensagens, permitindo selecionar qualquer produto cadastrado e gerar uma proposta formatada pronta para envio no WhatsApp.
- `src/components/Sidebar.tsx` & `src/App.tsx`: Vinculada a nova rota e item de menu "Produtos & Estoque".

---

### 3. Decisões Técnicas Tomadas
1. **Upload Imediato via Base64/FileReader**: Para dispensar a necessidade de um storage S3/Cloudinary neste momento de validação frontend, implementamos leitura local de imagens em Base64 com prévia instantânea.
2. **Integração Nativa com o Chat**: Vendedores de pequeno varejo perdem muito tempo digitando preços e dimensões no WhatsApp. O botão no chat injeta uma mensagem elegante com formatação markdown, medidas ANAC e valor Pix calculado automaticamente.
3. **Controle Rápido de Estoque (+/-)**: Lojistas atendendo no balcão precisam dar baixa ou entrada em estoque rapidamente pelo smartphone sem abrir formulários complexos.

---

### 4. Como Testar / Validar
1. Acesse `http://localhost:3000` ou pelo smartphone em `http://192.168.101.3:3000`.
2. Clique no menu **"Produtos & Estoque"**:
   - Teste ajustar o estoque de uma mala clicando em `+` e `-`.
   - Clique em **"Cadastrar Novo Produto"**, teste subir uma foto do seu computador ou celular, clique no atalho `+ Padrão ANAC` e salve.
3. Vá para a tela **"WhatsApp & Chats"**:
   - Abra qualquer conversa e clique no botão **"Enviar Produto / Estoque"**.
   - Escolha um item do catálogo e veja a mensagem formatada preencher o campo de texto pronta para envio!

---

### 5. Próximos Passos
- Persistência dos produtos na tabela `products` do banco de dados na Fase 2.
- IA ler a lista de produtos diretamente do banco via RAG ou Function Calling para informar estoque e valores exatos.
