import { Router } from 'express';
import { MessageSender, MessageStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { getDefaultStore } from '../helpers/tenant.js';
import {
  formatMessage,
  formatPausedUntil,
  formatTime,
  toClientAiStatus,
  toClientSender,
  toClientStage,
  toPrismaSender,
} from '../helpers/mappers.js';
import {
  ensureConversationForLead,
  pauseAIForLead,
  resumeExpiredPauses,
} from '../services/leadState.js';
import { isEvolutionEnabled } from '../services/evolution.js';
import { deliverOutboundMessage, type OutboundDelivery } from '../services/whatsappFlow.js';
import {
  assertApiKeyConfigured,
  generateAIReply,
  MissingApiKeyError,
} from '../services/ai.js';

export const conversationsRouter = Router();

type ConversationWithMessages = {
  id: string;
  leadId: string;
  phone: string;
  leadName: string;
  stage: Parameters<typeof toClientStage>[0];
  aiStatus: Parameters<typeof toClientAiStatus>[0];
  pausedUntil: Date | null;
  lastMessage: string | null;
  lastMessageAt: Date;
  messages: Array<{
    id: string;
    sender: MessageSender;
    text: string;
    status: MessageStatus;
    createdAt: Date;
    read: boolean;
    isLearned: boolean;
  }>;
};

function formatConversation(conversation: ConversationWithMessages) {
  return {
    id: conversation.id,
    leadId: conversation.leadId,
    phone: conversation.phone,
    leadName: conversation.leadName,
    stage: toClientStage(conversation.stage),
    aiStatus: toClientAiStatus(conversation.aiStatus) === 'active' ? 'active' : 'paused',
    pausedUntil: formatPausedUntil(conversation.pausedUntil),
    lastMessage: conversation.lastMessage || '',
    lastTime: formatTime(conversation.lastMessageAt),
    messages: conversation.messages.map(formatMessage),
  };
}

// GET /api/conversations - Lista todas as conversas da loja com o histórico
conversationsRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();

    // Pausas de 24h vencidas devolvem o atendimento para a IA automaticamente.
    await resumeExpiredPauses(store.id);

    // Garante que todo lead tenha uma conversa (o seed só cria para alguns).
    const leadsWithoutConversation = await prisma.lead.findMany({
      where: { storeId: store.id, conversation: null },
      select: { id: true },
    });
    for (const lead of leadsWithoutConversation) {
      await ensureConversationForLead(lead.id);
    }

    const conversations = await prisma.conversation.findMany({
      where: { storeId: store.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { lastMessageAt: 'desc' },
    });

    res.json(conversations.map(formatConversation));
  } catch (error: any) {
    console.error('Erro ao buscar conversas:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar conversas' });
  }
});

// GET /api/conversations/:leadId - Conversa de um lead específico
conversationsRouter.get('/:leadId', async (req, res) => {
  try {
    const conversation = await ensureConversationForLead(req.params.leadId);
    const withMessages = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!withMessages) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    res.json(formatConversation(withMessages));
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Erro ao buscar conversa:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar conversa' });
  }
});

// POST /api/conversations/:leadId/messages - Grava mensagem (cliente, IA ou atendente)
// S4: com EVOLUTION_ENABLED=true e número disponível, a mensagem do atendente/IA é enviada
// pelo WhatsApp. A `Message` nasce PENDING e vira SENT (+ externalId) ou FAILED (+ error).
conversationsRouter.post('/:leadId/messages', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { text, sender = 'agent' } = req.body ?? {};

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'Campo "text" é obrigatório.' });
    }

    const conversation = await ensureConversationForLead(leadId);
    const prismaSender = toPrismaSender(sender);
    const cleanText = text.trim();
    const now = new Date();

    const [lead, instance] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId }, select: { phoneE164: true } }),
      prisma.whatsAppInstance.findUnique({ where: { storeId: conversation.storeId } }),
    ]);

    // Mensagem de cliente é registro interno (o cliente não fala pelo CRM): nunca envia.
    const willTrySend =
      prismaSender !== MessageSender.CLIENT && isEvolutionEnabled() && Boolean(lead?.phoneE164);

    const created = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        sender: prismaSender,
        text: cleanText,
        read: prismaSender !== MessageSender.CLIENT,
        delivered: !willTrySend,
        ...(willTrySend ? { status: MessageStatus.PENDING } : {}),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: cleanText, lastMessageAt: now },
    });

    if (prismaSender === MessageSender.CLIENT) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { lastInteraction: now, unreadCount: { increment: 1 } },
      });
    } else {
      await prisma.lead.update({
        where: { id: leadId },
        data: { lastInteraction: now },
      });
    }

    // Regra de ouro do produto: humano respondeu → IA pausa automaticamente.
    let aiPaused = false;
    if (prismaSender === MessageSender.AGENT) {
      const store = await getDefaultStore();
      await pauseAIForLead(leadId, store.interventionPauseHours);
      aiPaused = true;

      // Registro técnico para a Área Dev (intervenção humana detectada).
      prisma.devLog
        .create({
          data: {
            storeId: store.id,
            level: 'INFO',
            service: 'CRM_WEBHOOK',
            message: `Intervenção humana: atendente respondeu ${conversation.leadName}. IA pausada por ${store.interventionPauseHours}h.`,
            metadata: { leadId, conversationId: conversation.id },
          },
        })
        .catch(() => {});
    }

    // Envio real (S4). Sem a flag, nada muda no comportamento de demonstração.
    let delivery: OutboundDelivery | undefined;
    if (willTrySend) {
      delivery = await deliverOutboundMessage({
        storeId: conversation.storeId,
        instance,
        messageId: created.id,
        phoneE164: lead?.phoneE164 ?? null,
        text: cleanText,
        source: prismaSender === MessageSender.AI ? 'Chat do lead (IA)' : 'Chat do lead',
      });
    } else if (isEvolutionEnabled() && prismaSender !== MessageSender.CLIENT) {
      // Flag ligada, mas sem número E.164 no lead: registra o motivo em vez de "fingir" envio.
      delivery = { attempted: false, status: 'SKIPPED', reason: 'no-phone' };
    }

    const stored = await prisma.message.findUnique({ where: { id: created.id } });

    res.status(201).json({
      message: formatMessage(stored ?? created),
      aiPaused,
      sender: toClientSender((stored ?? created).sender),
      ...(delivery ? { delivery } : {}),
    });
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Erro ao gravar mensagem:', error);
    res.status(500).json({ error: error?.message || 'Falha ao gravar mensagem' });
  }
});

// POST /api/conversations/:leadId/ai-reply - Gera e grava a resposta da IA
// Corpo opcional: { message } — se ausente, responde a última mensagem do cliente.
//                { persist: false } — só devolve o texto (sugestão), sem gravar.
conversationsRouter.post('/:leadId/ai-reply', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { message: overrideMessage, persist = true } = req.body ?? {};

    assertApiKeyConfigured();

    const conversation = await ensureConversationForLead(leadId);
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 14,
    });
    const ordered = recentMessages.reverse();

    const lastClientMessage = [...ordered]
      .reverse()
      .find((m) => m.sender === MessageSender.CLIENT);

    const userMessage =
      typeof overrideMessage === 'string' && overrideMessage.trim() !== ''
        ? overrideMessage.trim()
        : lastClientMessage?.text;

    if (!userMessage) {
      return res.status(400).json({
        error: 'Nenhuma mensagem do cliente para responder. Escreva a pergunta do cliente no campo "message".',
      });
    }

    // Histórico multi-turno: tudo, menos a mensagem que será enviada como "user".
    const historySource =
      typeof overrideMessage === 'string' && overrideMessage.trim() !== ''
        ? ordered
        : ordered.filter((m) => m.id !== lastClientMessage?.id);

    const history = historySource.map((m) => ({
      role: (m.sender === MessageSender.CLIENT ? 'user' : 'assistant') as
        | 'user'
        | 'assistant',
      content: m.text,
    }));

    const result = await generateAIReply({
      storeId: conversation.storeId,
      userMessage,
      history,
      source: 'Chat do lead',
    });

    if (!result.response) {
      return res.status(502).json({ error: 'A IA não retornou nenhuma resposta.' });
    }

    // Modo sugestão: devolve o texto sem gravar (usado quando a IA está pausada
    // e o atendente quer apenas revisar uma sugestão antes de enviar).
    if (persist === false) {
      return res.json({
        response: result.response,
        persisted: false,
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      });
    }

    // S4: a resposta da IA também é enviada pelo WhatsApp quando o envio está ligado.
    const [lead, instance] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId }, select: { phoneE164: true } }),
      prisma.whatsAppInstance.findUnique({ where: { storeId: conversation.storeId } }),
    ]);
    const willTrySend = isEvolutionEnabled() && Boolean(lead?.phoneE164);

    const now = new Date();
    const created = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.AI,
        text: result.response,
        read: true,
        delivered: !willTrySend,
        ...(willTrySend ? { status: MessageStatus.PENDING } : {}),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: result.response, lastMessageAt: now },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastInteraction: now },
    });

    let delivery: OutboundDelivery | undefined;
    if (willTrySend) {
      delivery = await deliverOutboundMessage({
        storeId: conversation.storeId,
        instance,
        messageId: created.id,
        phoneE164: lead?.phoneE164 ?? null,
        text: result.response,
        source: 'Resposta da IA no chat',
      });
    } else if (isEvolutionEnabled()) {
      delivery = { attempted: false, status: 'SKIPPED', reason: 'no-phone' };
    }

    const stored = await prisma.message.findUnique({ where: { id: created.id } });

    res.status(201).json({
      response: result.response,
      persisted: true,
      message: formatMessage(stored ?? created),
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
      ...(delivery ? { delivery } : {}),
    });
  } catch (error: any) {
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    if (error?.message === 'Loja não encontrada no banco de dados.') {
      return res.status(503).json({ error: error.message });
    }

    console.error('Erro ao gerar resposta da IA para o chat:', error);
    return res.status(502).json({
      error: 'Falha ao gerar resposta da IA. Verifique a chave OPENAI_API_KEY no .env.',
      details: error?.message,
    });
  }
});
