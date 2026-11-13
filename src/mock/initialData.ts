import { Lead, ChatConversation, QuickReply, AIConfig, StoreSettings, FollowUpCampaign, DevLogItem, AIKnowledgeItem } from '../types';

export const initialStoreSettings: StoreSettings = {
  name: 'Malas SLZ',
  segment: 'Malas de Viagem & Acessórios',
  whatsappNumber: '+55 98 98845-1290',
  address: 'Av. dos Holandeses, 100 - Calhau, São Luís - MA',
  logoUrl: '/logo-malas-slz.jpg',
  interventionPauseHours: 24,
  vipGroupLink: 'https://chat.whatsapp.com/ExemploGrupoVipMalasSLZ',
  theme: {
    primaryColor: '#B3471A', // Terracota nobre
    accentColor: '#D97706',  // Caramelo couro
    surfaceColor: '#FAF8F5', // Off-white arquitetônico
  }
};

export const initialAIConfig: AIConfig = {
  tone: 'consultivo', // Consultivo & Elegante
  emojiIntensity: 'moderate',
  slangType: 'descontraido',
  ctaStrategy: 'grupo_vip_whatsapp',
  maxWordsPerReply: 55,
  activeHours: {
    start: '08:00',
    end: '22:00',
    respondOffHours: true
  }
};

export const initialQuickReplies: QuickReply[] = [
  {
    id: 'qr-1',
    title: 'Medidas Padrão ANAC (10kg)',
    shortcut: '/bordo',
    category: 'medidas',
    content: 'Nossas malas de bordo atendem 100% ao padrão ANAC (55x35x25cm com rodinhas inclusas). Você embarca tranquilo na LATAM, GOL e AZUL sem risco de despacho obrigatório! ✈️'
  },
  {
    id: 'qr-2',
    title: 'Garantia e Material Polipropileno',
    shortcut: '/garantia',
    category: 'garantia',
    content: 'Todas as nossas malas em 100% Polipropileno contam com 2 anos de garantia contra trincas e defeitos de fabricação, além de rodinhas duplas 360° em silicone silencioso. ✨'
  },
  {
    id: 'qr-3',
    title: 'Condições de Pagamento e Chave Pix',
    shortcut: '/pagamento',
    category: 'pagamento',
    content: 'Parcelamos em até 10x sem juros no cartão ou você ganha 7% de desconto no Pix imediato! Deseja que eu gere o link com o desconto agora? 💳'
  },
  {
    id: 'qr-4',
    title: 'Entrega Expressa em São Luís',
    shortcut: '/envio',
    category: 'envio',
    content: 'Fazemos entrega expressa via motoboy no mesmo dia para toda a Grande Ilha (São Luís, São José de Ribamar, Paço do Lumiar e Raposa). Em compras acima de R$ 350 o frete é grátis! 🛵'
  },
  {
    id: 'qr-5',
    title: 'Convite Grupo VIP de Descontos',
    shortcut: '/grupovip',
    category: 'precos',
    content: 'Temos um grupo exclusivo no WhatsApp onde soltamos cupons de 15% a 20% e queima de mostruário semanalmente. Você pode entrar por este link seguro: https://chat.whatsapp.com/MalasSLZ-VIP 🎒'
  }
];

export const initialKnowledge: AIKnowledgeItem[] = [
  {
    id: 'k-1',
    question: 'A mala de bordo cabe no bagageiro de aviões da Azul?',
    answer: 'Sim, modelo de bordo 20 polegadas segue 55x35x25cm exatamente conforme homologado para Azul, Gol e Latam.',
    createdAt: '2026-11-10 14:20',
    source: 'manual'
  },
  {
    id: 'k-2',
    question: 'Vocês têm frasqueira combinando na cor terracota?',
    answer: 'Sim! Temos kit viagem mala + frasqueira rígida em policarbonato na cor terracota e rosé gold.',
    createdAt: '2026-11-12 18:45',
    source: 'humano_chat'
  }
];

export const initialLeads: Lead[] = [
  {
    id: 'lead-1',
    name: 'Dra. Camila Vasconcelos',
    phone: '(98) 99123-4455',
    interest: 'Kit Mala de Bordo + Frasqueira Terracota',
    estimatedValue: 689.00,
    stage: 'intervencao_humana',
    aiStatus: 'paused',
    pausedUntil: '2026-11-14 10:30',
    lastInteraction: '10 min atrás',
    urgent: true,
    urgentReason: 'Pediu desconto para pagamento via Pix e quer retirar hoje na loja',
    unreadCount: 2,
    tags: ['Alta Intenção', 'Retirada Hoje', 'Pix']
  },
  {
    id: 'lead-2',
    name: 'Rodrigo Sampaio',
    phone: '(98) 98450-8812',
    interest: 'Mala Grande 28kg para Viagem Internacional',
    estimatedValue: 840.00,
    stage: 'em_negociacao',
    aiStatus: 'active',
    lastInteraction: '25 min atrás',
    urgent: true,
    urgentReason: 'Embarque em 48h, precisa confirmar se tem pronta entrega cor preta',
    unreadCount: 1,
    tags: ['Urgência Viagem', 'Mala Grande']
  },
  {
    id: 'lead-3',
    name: 'Beatriz Menezes',
    phone: '(98) 98711-2090',
    interest: 'Mala de Bordo Rose Gold + Capa Protetora',
    estimatedValue: 499.00,
    stage: 'atendimento_ia',
    aiStatus: 'active',
    lastInteraction: '1 hora atrás',
    urgent: false,
    tags: ['Bordo', 'Acessórios']
  },
  {
    id: 'lead-4',
    name: 'Eng. Marcelo Albuquerque',
    phone: '(98) 99204-7711',
    interest: 'Mochila Antifurto Executiva com USB',
    estimatedValue: 320.00,
    stage: 'fechado',
    aiStatus: 'paused',
    lastInteraction: 'Hoje 08:30',
    urgent: false,
    tags: ['Venda Fechada', 'Mochila']
  },
  {
    id: 'lead-5',
    name: 'Juliana Portela',
    phone: '(98) 98822-6633',
    interest: 'Kit Organizadores de Bagagem 6 peças',
    estimatedValue: 129.00,
    stage: 'novo',
    aiStatus: 'active',
    lastInteraction: '5 min atrás',
    urgent: false,
    unreadCount: 1,
    tags: ['Lead Novo', 'Instagram Ads']
  }
];

export const initialConversations: Record<string, ChatConversation> = {
  'lead-1': {
    id: 'conv-1',
    leadId: 'lead-1',
    phone: '(98) 99123-4455',
    leadName: 'Dra. Camila Vasconcelos',
    stage: 'intervencao_humana',
    aiStatus: 'paused',
    pausedUntil: '2026-11-14 10:30',
    lastMessage: 'Consigo passar aí no Calhau até 18h pra pegar se fechar no Pix?',
    lastTime: '09:28',
    messages: [
      {
        id: 'm-1',
        sender: 'client',
        text: 'Olá! Vi o anúncio no Insta do conjunto de mala de bordo com frasqueira terracota. Ainda tem disponível?',
        timestamp: '09:15',
        read: true
      },
      {
        id: 'm-2',
        sender: 'ai',
        text: 'Olá, Camila! Tudo bem? Sim, temos as últimas unidades do conjunto terracota aqui na nossa loja! Ele acompanha mala de bordo 100% no padrão ANAC + frasqueira rígida combinando. Deseja conferir as fotos com detalhes?',
        timestamp: '09:16',
        read: true
      },
      {
        id: 'm-3',
        sender: 'client',
        text: 'Adorei as fotos! Se eu fechar no Pix hoje, você consegue um desconto e já reservam pra mim?',
        timestamp: '09:25',
        read: true
      },
      {
        id: 'm-4',
        sender: 'agent',
        text: 'Oi Camila, aqui é a Mariana da Malas SLZ! Consigo sim te dar 7% de desconto no Pix e já separo seu kit na bancada com a etiqueta no seu nome.',
        timestamp: '09:27',
        delivered: true,
        read: true,
        isLearned: true
      },
      {
        id: 'm-5',
        sender: 'client',
        text: 'Perfeito Mariana! Consigo passar aí no Calhau até 18h pra pegar se fechar no Pix?',
        timestamp: '09:28',
        read: false
      }
    ]
  },
  'lead-2': {
    id: 'conv-2',
    leadId: 'lead-2',
    phone: '(98) 98450-8812',
    leadName: 'Rodrigo Sampaio',
    stage: 'em_negociacao',
    aiStatus: 'active',
    lastMessage: 'Tenho viagem depois de amanhã para Portugal, tem mala G pronta?',
    lastTime: '09:10',
    messages: [
      {
        id: 'm-21',
        sender: 'client',
        text: 'Bom dia! Preciso de uma mala grande resistente de 28kg para viagem internacional.',
        timestamp: '09:05',
        read: true
      },
      {
        id: 'm-22',
        sender: 'ai',
        text: 'Bom dia, Rodrigo! Para viagens internacionais recomendamos muito a linha Explorer em Polipropileno ultrarresistente com cadeado TSA embutido. Ela suporta até 32kg com folga e rodinhas duplas. Tenho na cor Preta e Grafite. Qual prefere?',
        timestamp: '09:06',
        read: true
      },
      {
        id: 'm-23',
        sender: 'client',
        text: 'Tenho viagem depois de amanhã para Portugal, tem mala G pronta entrega?',
        timestamp: '09:10',
        read: true
      }
    ]
  }
};

export const initialCampaigns: FollowUpCampaign[] = [
  {
    id: 'camp-1',
    title: 'Recuperação 24h - Dúvida sobre Mala de Bordo',
    triggerHours: 24,
    targetStage: 'atendimento_ia',
    messageTemplate: 'Olá! Passando para te lembrar que a sua mala de bordo desejada ainda está reservada com frete grátis para São Luís. Posso separar para envio hoje?',
    active: true,
    conversionsCount: 14
  },
  {
    id: 'camp-2',
    title: 'Reaquecimento 48h - Orçamento sem Resposta',
    triggerHours: 48,
    targetStage: 'em_negociacao',
    messageTemplate: 'Oi! Conseguimos liberar uma condição especial com 10x sem juros ou brinde exclusivo de capa protetora. Vamos fechar?',
    active: true,
    conversionsCount: 8
  }
];

export const initialDevLogs: DevLogItem[] = [
  {
    id: 'log-1',
    timestamp: '2026-11-13 09:28:15',
    level: 'ai_call',
    service: 'OpenAI',
    message: 'Geração de resposta para Dra. Camila (lead-1). Modelo: gpt-4o-mini. Latência: 840ms. Tokens: 312 in / 68 out.',
    storeId: 'malas-slz'
  },
  {
    id: 'log-2',
    timestamp: '2026-11-13 09:27:00',
    level: 'info',
    service: 'Evolution_API',
    message: 'Intervenção humana detectada (atendente Mariana). IA pausada automaticamente por 24h para o número (98) 99123-4455.',
    storeId: 'malas-slz'
  },
  {
    id: 'log-3',
    timestamp: '2026-11-13 09:15:32',
    level: 'info',
    service: 'Evolution_API',
    message: 'Webhook recebido: Mensagem de entrada via WhatsApp Instance malas-slz-01.',
    storeId: 'malas-slz'
  },
  {
    id: 'log-4',
    timestamp: '2026-11-13 08:45:10',
    level: 'warn',
    service: 'Evolution_API',
    message: 'Retry 1/3: Instância do WhatsApp reportou bateria baixa no aparelho pareado (12%). Alerta emitido ao lojista.',
    storeId: 'malas-slz'
  }
];
