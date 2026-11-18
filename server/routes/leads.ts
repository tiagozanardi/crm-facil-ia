import { Router } from 'express';
import { prisma } from '../db.js';
import { getDefaultStore } from '../helpers/tenant.js';
import { formatLead, toClientStage, toPrismaStage } from '../helpers/mappers.js';
import { pauseAIForLead, resumeAIForLead, resumeExpiredPauses } from '../services/leadState.js';

export const leadsRouter = Router();

const LEAD_INCLUDE = {
  conversation: { select: { lastMessage: true, lastMessageAt: true } },
} as const;

// GET /api/leads - Lista o pipeline com estágio, IA e última mensagem
leadsRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();

    // Pausas de 24h vencidas devolvem o atendimento para a IA automaticamente.
    await resumeExpiredPauses(store.id);

    const leads = await prisma.lead.findMany({
      where: { storeId: store.id },
      include: LEAD_INCLUDE,
      orderBy: { lastInteraction: 'desc' },
    });

    res.json(leads.map(formatLead));
  } catch (error: any) {
    console.error('Erro ao buscar leads:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar leads' });
  }
});

// PATCH /api/leads/:id/stage - Move o lead no funil
leadsRouter.patch('/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body ?? {};

    if (!stage || typeof stage !== 'string') {
      return res.status(400).json({ error: 'Campo "stage" é obrigatório.' });
    }

    const prismaStage = toPrismaStage(stage);

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        stage: prismaStage,
        lastInteraction: new Date(),
      },
      include: LEAD_INCLUDE,
    });

    // Mantém a conversa sincronizada com o funil.
    await prisma.conversation.updateMany({
      where: { leadId: id },
      data: { stage: prismaStage },
    });

    res.json(formatLead(updated));
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }
    console.error('Erro ao atualizar estágio do lead:', error);
    res.status(500).json({ error: error?.message || 'Falha ao atualizar estágio' });
  }
});

// PATCH /api/leads/:id/ai-status - Pausa (intervenção humana) ou retoma a IA
leadsRouter.patch('/:id/ai-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, hours } = req.body ?? {};

    if (status !== 'active' && status !== 'paused') {
      return res.status(400).json({ error: 'Campo "status" deve ser "active" ou "paused".' });
    }

    if (status === 'paused') {
      const store = await getDefaultStore();
      const pauseHours = Number(hours) > 0 ? Number(hours) : store.interventionPauseHours;
      await pauseAIForLead(id, pauseHours);
    } else {
      await resumeAIForLead(id);
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: LEAD_INCLUDE,
    });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    res.json(formatLead(lead));
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Erro ao alterar status da IA:', error);
    res.status(500).json({ error: error?.message || 'Falha ao alterar status da IA' });
  }
});

// PATCH /api/leads/:id/urgency - Marca/desmarca lead como urgente
leadsRouter.patch('/:id/urgency', async (req, res) => {
  try {
    const { id } = req.params;
    const { urgent, urgentReason } = req.body ?? {};

    if (typeof urgent !== 'boolean') {
      return res.status(400).json({ error: 'Campo "urgent" deve ser booleano.' });
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        urgent,
        urgentReason: urgent ? urgentReason || null : null,
      },
      include: LEAD_INCLUDE,
    });

    res.json(formatLead(updated));
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }
    console.error('Erro ao atualizar urgência do lead:', error);
    res.status(500).json({ error: error?.message || 'Falha ao atualizar urgência' });
  }
});

// PATCH /api/leads/:id - Atualiza dados básicos do lead (nome, interesse, valor)
leadsRouter.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, interest, estimatedValue, tags } = req.body ?? {};

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (interest !== undefined) data.interest = interest;
    if (estimatedValue !== undefined) data.estimatedValue = Number(estimatedValue);
    if (tags !== undefined && Array.isArray(tags)) data.tags = tags;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido informado.' });
    }

    const updated = await prisma.lead.update({
      where: { id },
      data,
      include: LEAD_INCLUDE,
    });

    res.json({ ...formatLead(updated), stage: toClientStage(updated.stage) });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Lead não encontrado.' });
    }
    console.error('Erro ao atualizar lead:', error);
    res.status(500).json({ error: error?.message || 'Falha ao atualizar lead' });
  }
});
