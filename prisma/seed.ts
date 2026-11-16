import { PrismaClient, ProductCategory, LeadStage, AIStatus, MessageSender, AITone, EmojiIntensity, SlangType, CTAStrategy, Role, KnowledgeSource, LogLevel, ServiceName } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados para Malas SLZ...');

  // 1. Limpar dados anteriores de forma segura
  await prisma.devLog.deleteMany();
  await prisma.followUpCampaign.deleteMany();
  await prisma.quickReply.deleteMany();
  await prisma.aIKnowledge.deleteMany();
  await prisma.aIConfig.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();

  // 2. Criar a Loja Piloto: Malas SLZ
  const store = await prisma.store.create({
    data: {
      name: 'Malas SLZ',
      slug: 'malas-slz',
      segment: 'Malas de Viagem & Acessórios',
      whatsappNumber: '+55 98 98845-1290',
      address: 'Av. dos Holandeses, 100 - Calhau, São Luís - MA',
      logoUrl: '/logo-malas-slz.jpg',
      primaryColor: '#B3471A',
      accentColor: '#D97706',
      surfaceColor: '#FAF8F5',
      interventionPauseHours: 24,
      vipGroupLink: 'https://chat.whatsapp.com/ExemploGrupoVipMalasSLZ',
    }
  });

  console.log(`✅ Loja criada: ${store.name} (ID: ${store.id})`);

  // 3. Criar Usuários da Loja
  const adminUser = await prisma.user.create({
    data: {
      storeId: store.id,
      name: 'Tiago Zanardi',
      email: 'tiago@malasslz.com.br',
      role: Role.ADMIN,
    }
  });

  const sellerUser = await prisma.user.create({
    data: {
      storeId: store.id,
      name: 'Mariana Silva',
      email: 'mariana@malasslz.com.br',
      role: Role.SELLER,
    }
  });

  console.log('✅ Usuários e atendentes criados');

  // 4. Cadastrar Produtos e Estoque Inicial
  const productsData = [
    {
      storeId: store.id,
      name: 'Kit Mala de Bordo + Frasqueira Rígida',
      sku: 'KIT-BORDO-TERRA',
      category: ProductCategory.BORDO,
      price: 689.00,
      pixPrice: 640.00,
      stock: 7,
      minStock: 3,
      dimensions: '55 x 35 x 25 cm (Padrão ANAC)',
      colors: ['Terracota', 'Rosé Gold', 'Preto Fosco'],
      imageUrl: 'https://images.unsplash.com/photo-1565026057447-bc90a3dceb87?auto=format&fit=crop&w=600&q=80',
      description: 'Conjunto em polipropileno ultrarresistente com cadeado TSA embutido e rodinhas duplas 360° silenciosas.'
    },
    {
      storeId: store.id,
      name: 'Mala de Bordo 10kg Explorer ANAC',
      sku: 'MALA-BORDO-10KG',
      category: ProductCategory.BORDO,
      price: 449.00,
      pixPrice: 417.00,
      stock: 14,
      minStock: 4,
      dimensions: '55 x 35 x 25 cm (Com rodinhas)',
      colors: ['Terracota', 'Grafite', 'Azul Marinho', 'Rose Gold'],
      imageUrl: 'https://images.unsplash.com/photo-1581553680321-4fffae59fccd?auto=format&fit=crop&w=600&q=80',
      description: 'Homologada para embarque direto na cabine da Azul, Gol e Latam sem despacho.'
    },
    {
      storeId: store.id,
      name: 'Mala Grande 28kg Viagem Internacional',
      sku: 'MALA-G-28KG',
      category: ProductCategory.MEDIA_GRANDE,
      price: 840.00,
      pixPrice: 781.00,
      stock: 5,
      minStock: 2,
      dimensions: '76 x 50 x 31 cm (Expansível)',
      colors: ['Preto Fosco', 'Grafite Ônix', 'Vinho'],
      imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80',
      description: 'Ideal para viagens internacionais longas. Zíper antifurto duplo e divisórias internas com tela.'
    },
    {
      storeId: store.id,
      name: 'Frasqueira Térmica & Rígida de Viagem',
      sku: 'FRASQ-RIGIDA-01',
      category: ProductCategory.FRASQUEIRA,
      price: 219.00,
      pixPrice: 203.00,
      stock: 9,
      minStock: 3,
      dimensions: '32 x 26 x 15 cm',
      colors: ['Terracota', 'Rosé Gold', 'Preto'],
      imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
      description: 'Frasqueira com alça carona para fixar no puxador da mala de bordo e espelho interno.'
    },
    {
      storeId: store.id,
      name: 'Mochila Executiva Antifurto USB & Notebook',
      sku: 'MOCH-EXEC-USB',
      category: ProductCategory.MOCHILA,
      price: 320.00,
      pixPrice: 297.00,
      stock: 2,
      minStock: 3,
      dimensions: '44 x 30 x 18 cm (Notebook até 15.6")',
      colors: ['Preto Carbono', 'Cinza Chumbo'],
      imageUrl: 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=600&q=80',
      description: 'Tecido impermeável Oxford, porta USB externa e bolso secreto nas costas.'
    },
    {
      storeId: store.id,
      name: 'Kit Organizadores de Bagagem 6 Peças',
      sku: 'ORG-BAG-6PC',
      category: ProductCategory.ACESSORIOS,
      price: 129.00,
      pixPrice: 119.00,
      stock: 18,
      minStock: 5,
      dimensions: 'Tamanhos P, M e G + sacos para sapatos',
      colors: ['Cinza Areia', 'Preto', 'Azul'],
      imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=600&q=80',
      description: 'Comprime roupas e organiza sapatos, cabos e roupas íntimas de forma higiênica.'
    }
  ];

  for (const prod of productsData) {
    await prisma.product.create({ data: prod });
  }
  console.log(`✅ ${productsData.length} produtos cadastrados no estoque`);

  // 5. Configuração da Linguagem da IA
  await prisma.aIConfig.create({
    data: {
      storeId: store.id,
      tone: AITone.CONSULTIVO,
      emojiIntensity: EmojiIntensity.MODERATE,
      slangType: SlangType.DESCONTRAIDO,
      ctaStrategy: CTAStrategy.GRUPO_VIP_WHATSAPP,
      maxWordsPerReply: 55,
      activeHoursStart: '08:00',
      activeHoursEnd: '22:00',
      respondOffHours: true,
    }
  });

  // 6. Cadastrar Conhecimento Aprendido (RAG)
  await prisma.aIKnowledge.createMany({
    data: [
      {
        storeId: store.id,
        question: 'A mala de bordo cabe no bagageiro de aviões da Azul?',
        answer: 'Sim, modelo de bordo 20 polegadas segue 55x35x25cm exatamente conforme homologado para Azul, Gol e Latam.',
        source: KnowledgeSource.MANUAL
      },
      {
        storeId: store.id,
        question: 'Vocês têm frasqueira combinando na cor terracota?',
        answer: 'Sim! Temos kit viagem mala + frasqueira rígida em policarbonato na cor terracota e rosé gold.',
        source: KnowledgeSource.HUMANO_CHAT
      }
    ]
  });

  // 7. Respostas Rápidas
  await prisma.quickReply.createMany({
    data: [
      {
        storeId: store.id,
        title: 'Medidas Padrão ANAC (10kg)',
        shortcut: '/bordo',
        category: 'medidas',
        content: 'Nossas malas de bordo atendem 100% ao padrão ANAC (55x35x25cm com rodinhas inclusas). Você embarca tranquilo na LATAM, GOL e AZUL sem risco de despacho obrigatório! ✈️'
      },
      {
        storeId: store.id,
        title: 'Garantia e Material Polipropileno',
        shortcut: '/garantia',
        category: 'garantia',
        content: 'Todas as nossas malas em 100% Polipropileno contam com 2 anos de garantia contra trincas e defeitos de fabricação, além de rodinhas duplas 360° em silicone silencioso. ✨'
      },
      {
        storeId: store.id,
        title: 'Condições de Pagamento e Chave Pix',
        shortcut: '/pagamento',
        category: 'pagamento',
        content: 'Parcelamos em até 10x sem juros no cartão ou você ganha 7% de desconto no Pix imediato! Deseja que eu gere o link com o desconto agora? 💳'
      },
      {
        storeId: store.id,
        title: 'Entrega Expressa em São Luís',
        shortcut: '/envio',
        category: 'envio',
        content: 'Fazemos entrega expressa via motoboy no mesmo dia para toda a Grande Ilha (São Luís, São José de Ribamar, Paço do Lumiar e Raposa). Em compras acima de R$ 350 o frete é grátis! 🛵'
      }
    ]
  });

  // 8. Criar Leads e Histórico de Conversas
  const lead1 = await prisma.lead.create({
    data: {
      storeId: store.id,
      name: 'Dra. Camila Vasconcelos',
      phone: '(98) 99123-4455',
      interest: 'Kit Mala de Bordo + Frasqueira Terracota',
      estimatedValue: 689.00,
      stage: LeadStage.INTERVENCAO_HUMANA,
      aiStatus: AIStatus.PAUSED,
      pausedUntil: new Date(Date.now() + 24 * 3600 * 1000),
      urgent: true,
      urgentReason: 'Pediu desconto no Pix para retirar hoje na loja do Calhau',
      tags: ['Alta Intenção', 'Retirada Hoje', 'Pix'],
      assignedToId: sellerUser.id,
    }
  });

  const conv1 = await prisma.conversation.create({
    data: {
      storeId: store.id,
      leadId: lead1.id,
      phone: lead1.phone,
      leadName: lead1.name,
      stage: lead1.stage,
      aiStatus: AIStatus.PAUSED,
      lastMessage: 'Consigo passar aí no Calhau até 18h pra pegar se fechar no Pix?',
    }
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: conv1.id,
        sender: MessageSender.CLIENT,
        text: 'Olá! Vi o anúncio no Insta do conjunto de mala de bordo com frasqueira terracota. Ainda tem disponível?',
      },
      {
        conversationId: conv1.id,
        sender: MessageSender.AI,
        text: 'Olá, Camila! Tudo bem? Sim, temos as últimas unidades do conjunto terracota aqui na nossa loja! Ele acompanha mala de bordo 100% no padrão ANAC + frasqueira rígida combinando. Deseja conferir as fotos com detalhes?',
      },
      {
        conversationId: conv1.id,
        sender: MessageSender.CLIENT,
        text: 'Adorei as fotos! Se eu fechar no Pix hoje, você consegue um desconto e já reservam pra mim?',
      },
      {
        conversationId: conv1.id,
        sender: MessageSender.AGENT,
        text: 'Oi Camila, aqui é a Mariana da Malas SLZ! Consigo sim te dar 7% de desconto no Pix e já separo seu kit na bancada com a etiqueta no seu nome.',
        isLearned: true,
      },
      {
        conversationId: conv1.id,
        sender: MessageSender.CLIENT,
        text: 'Perfeito Mariana! Consigo passar aí no Calhau até 18h pra pegar se fechar no Pix?',
      }
    ]
  });

  // Campanhas e Logs Dev
  await prisma.followUpCampaign.create({
    data: {
      storeId: store.id,
      title: 'Recuperação 24h - Dúvida sobre Mala de Bordo',
      triggerHours: 24,
      targetStage: LeadStage.ATENDIMENTO_IA,
      messageTemplate: 'Olá! Passando para te lembrar que a sua mala de bordo desejada ainda está reservada com frete grátis para São Luís. Posso separar para envio hoje?',
      active: true,
      conversionsCount: 14,
    }
  });

  await prisma.devLog.createMany({
    data: [
      {
        storeId: store.id,
        level: LogLevel.AI_CALL,
        service: ServiceName.OPENAI,
        message: 'Geração de resposta para Dra. Camila (lead-1). Latência: 840ms. Tokens: 312 in / 68 out.',
        tokensIn: 312,
        tokensOut: 68,
        latencyMs: 840,
      },
      {
        storeId: store.id,
        level: LogLevel.INFO,
        service: ServiceName.EVOLUTION_API,
        message: 'Intervenção humana detectada (atendente Mariana). IA pausada automaticamente por 24h.',
      }
    ]
  });

  console.log('🎉 Seed concluído com sucesso total!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
