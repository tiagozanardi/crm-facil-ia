import 'dotenv/config';
import {
  PrismaClient,
  LeadStage,
  AIStatus,
  MessageSender,
} from '@prisma/client';

/**
 * Seed complementar e IDEMPOTENTE de leads + conversas de demonstração.
 * Diferente do seed principal (que apaga e recria tudo), este script apenas
 * adiciona os leads que ainda não existem pelo telefone. Pode rodar à vontade.
 *
 * Uso: npm run seed:leads
 */
const prisma = new PrismaClient();

type DemoMessage = {
  sender: 'client' | 'ai' | 'agent';
  text: string;
  minutesAgo: number;
  isLearned?: boolean;
  read?: boolean;
};

type DemoLead = {
  name: string;
  phone: string;
  interest: string;
  estimatedValue: number;
  stage: LeadStage;
  aiStatus: AIStatus;
  lastInteractionMinutesAgo: number;
  urgent: boolean;
  urgentReason?: string;
  unreadCount: number;
  tags: string[];
  messages: DemoMessage[];
};

const minutes = (n: number) => new Date(Date.now() - n * 60 * 1000);

const demoLeads: DemoLead[] = [
  {
    name: 'Rodrigo Sampaio',
    phone: '(98) 98450-8812',
    interest: 'Mala Grande 28kg para Viagem Internacional',
    estimatedValue: 840,
    stage: LeadStage.EM_NEGOCIACAO,
    aiStatus: AIStatus.ACTIVE,
    lastInteractionMinutesAgo: 25,
    urgent: true,
    urgentReason: 'Embarque em 48h, precisa confirmar se tem pronta entrega cor preta',
    unreadCount: 1,
    tags: ['Urgência Viagem', 'Mala Grande'],
    messages: [
      {
        sender: 'client',
        text: 'Bom dia! Preciso de uma mala grande resistente de 28kg para viagem internacional.',
        minutesAgo: 30,
      },
      {
        sender: 'ai',
        text: 'Bom dia, Rodrigo! Para viagens internacionais recomendamos muito a linha Explorer em Polipropileno ultrarresistente com cadeado TSA embutido. Ela suporta até 32kg com folga e rodinhas duplas. Tenho na cor Preta e Grafite. Qual prefere?',
        minutesAgo: 29,
      },
      {
        sender: 'client',
        text: 'Tenho viagem depois de amanhã para Portugal, tem mala G pronta entrega?',
        minutesAgo: 25,
        read: false,
      },
    ],
  },
  {
    name: 'Beatriz Menezes',
    phone: '(98) 98711-2090',
    interest: 'Mala de Bordo Rose Gold + Capa Protetora',
    estimatedValue: 499,
    stage: LeadStage.ATENDIMENTO_IA,
    aiStatus: AIStatus.ACTIVE,
    lastInteractionMinutesAgo: 60,
    urgent: false,
    unreadCount: 0,
    tags: ['Bordo', 'Acessórios'],
    messages: [
      {
        sender: 'client',
        text: 'Oiie! A mala de bordo rose gold ainda está disponível? Cabe na cabine da Gol?',
        minutesAgo: 66,
      },
      {
        sender: 'ai',
        text: 'Oi, Beatriz! Sim, temos a Mala de Bordo 10kg Explorer na cor Rose Gold pronta entrega! Ela segue o padrão ANAC (55x35x25cm) e embarca na cabine da Gol sem despacho. Quer que eu separe uma para você? ✨',
        minutesAgo: 64,
      },
      {
        sender: 'client',
        text: 'Quero sim! Vocês têm capa protetora combinando?',
        minutesAgo: 60,
      },
    ],
  },
  {
    name: 'Eng. Marcelo Albuquerque',
    phone: '(98) 99204-7711',
    interest: 'Mochila Antifurto Executiva com USB',
    estimatedValue: 320,
    stage: LeadStage.FECHADO,
    aiStatus: AIStatus.PAUSED,
    lastInteractionMinutesAgo: 720,
    urgent: false,
    unreadCount: 0,
    tags: ['Venda Fechada', 'Mochila'],
    messages: [
      {
        sender: 'client',
        text: 'Boa tarde, a mochila executiva com USB ainda tem? Preciso para viagem de trabalho.',
        minutesAgo: 730,
      },
      {
        sender: 'agent',
        text: 'Boa tarde, Marcelo! Temos sim, em Preto Carbono e Cinza Chumbo. Como você vai viajar, posso já separar com o desconto no Pix de 7% e entregar hoje por motoboy.',
        minutesAgo: 726,
        isLearned: true,
      },
      {
        sender: 'client',
        text: 'Fechado, pode separar a preta! Manda o Pix.',
        minutesAgo: 720,
      },
    ],
  },
  {
    name: 'Juliana Portela',
    phone: '(98) 98822-6633',
    interest: 'Kit Organizadores de Bagagem 6 peças',
    estimatedValue: 129,
    stage: LeadStage.NOVO,
    aiStatus: AIStatus.ACTIVE,
    lastInteractionMinutesAgo: 5,
    urgent: false,
    unreadCount: 1,
    tags: ['Lead Novo', 'Instagram Ads'],
    messages: [
      {
        sender: 'client',
        text: 'Oi! Vi no Instagram o kit de organizadores de bagagem. Quanto custa?',
        minutesAgo: 5,
        read: false,
      },
    ],
  },
];

const senderMap: Record<DemoMessage['sender'], MessageSender> = {
  client: MessageSender.CLIENT,
  ai: MessageSender.AI,
  agent: MessageSender.AGENT,
};

async function main() {
  const store = await prisma.store.findFirst({ where: { slug: 'malas-slz' } });
  if (!store) {
    throw new Error('Loja "malas-slz" não encontrada. Execute o seed principal antes.');
  }

  for (const demo of demoLeads) {
    const existing = await prisma.lead.findFirst({
      where: { storeId: store.id, phone: demo.phone },
    });

    if (existing) {
      console.log(`↷ Já existe, mantendo: ${demo.name}`);
      continue;
    }

    const lastInteraction = minutes(demo.lastInteractionMinutesAgo);
    const lastMessage = demo.messages[demo.messages.length - 1];

    const lead = await prisma.lead.create({
      data: {
        storeId: store.id,
        name: demo.name,
        phone: demo.phone,
        interest: demo.interest,
        estimatedValue: demo.estimatedValue,
        stage: demo.stage,
        aiStatus: demo.aiStatus,
        lastInteraction,
        urgent: demo.urgent,
        urgentReason: demo.urgentReason ?? null,
        unreadCount: demo.unreadCount,
        tags: demo.tags,
      },
    });

    const conversation = await prisma.conversation.create({
      data: {
        storeId: store.id,
        leadId: lead.id,
        phone: lead.phone,
        leadName: lead.name,
        stage: lead.stage,
        aiStatus: lead.aiStatus,
        lastMessage: lastMessage.text,
        lastMessageAt: lastInteraction,
      },
    });

    for (const message of demo.messages) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: senderMap[message.sender],
          text: message.text,
          createdAt: minutes(message.minutesAgo),
          read: message.read ?? message.sender !== 'client',
          delivered: true,
          isLearned: message.isLearned ?? false,
        },
      });
    }

    console.log(`✅ Lead criado: ${demo.name} (${demo.messages.length} mensagens)`);
  }

  // Garante conversa para leads antigos que ainda não têm uma.
  const leadsWithoutConversation = await prisma.lead.findMany({
    where: { storeId: store.id, conversation: null },
  });
  for (const lead of leadsWithoutConversation) {
    await prisma.conversation.create({
      data: {
        storeId: lead.storeId,
        leadId: lead.id,
        phone: lead.phone,
        leadName: lead.name,
        stage: lead.stage,
        aiStatus: lead.aiStatus,
        pausedUntil: lead.pausedUntil,
      },
    });
    console.log(`✅ Conversa criada para o lead existente: ${lead.name}`);
  }

  const total = await prisma.lead.count({ where: { storeId: store.id } });
  console.log(`\n📊 Total de leads na loja ${store.name}: ${total}`);
}

main()
  .catch((error) => {
    console.error('❌ Erro no seed de leads:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
