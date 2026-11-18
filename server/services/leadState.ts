import { AIStatus, LeadStage } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * Pausa a IA de um lead espelhando o estado em Lead e Conversation.
 * Regra de negócio: quando um humano responde, a IA fica em silêncio pelo
 * período de intervenção (padrão 24h) e o lead vai para INTERVENCAO_HUMANA.
 */
export async function pauseAIForLead(leadId: string, hours: number): Promise<void> {
  const pausedUntil = new Date(Date.now() + hours * 3600 * 1000);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stage: true },
  });
  if (!lead) throw Object.assign(new Error('Lead não encontrado'), { statusCode: 404 });

  // Não sobrescreve o estágio final de uma venda já fechada/perdida.
  const keepStage = lead.stage === LeadStage.FECHADO || lead.stage === LeadStage.PERDIDO;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        aiStatus: AIStatus.PAUSED,
        pausedUntil,
        stage: keepStage ? undefined : LeadStage.INTERVENCAO_HUMANA,
      },
    }),
    prisma.conversation.updateMany({
      where: { leadId },
      data: {
        aiStatus: AIStatus.PAUSED,
        pausedUntil,
        stage: keepStage ? undefined : LeadStage.INTERVENCAO_HUMANA,
      },
    }),
  ]);
}

/** Devolve o atendimento para a IA e limpa a pausa. */
export async function resumeAIForLead(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stage: true },
  });
  if (!lead) throw Object.assign(new Error('Lead não encontrado'), { statusCode: 404 });

  const keepStage = lead.stage === LeadStage.FECHADO || lead.stage === LeadStage.PERDIDO;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        aiStatus: AIStatus.ACTIVE,
        pausedUntil: null,
        stage: keepStage ? undefined : LeadStage.ATENDIMENTO_IA,
      },
    }),
    prisma.conversation.updateMany({
      where: { leadId },
      data: {
        aiStatus: AIStatus.ACTIVE,
        pausedUntil: null,
        stage: keepStage ? undefined : LeadStage.ATENDIMENTO_IA,
      },
    }),
  ]);
}

/**
 * Retoma automaticamente a IA dos leads cuja pausa por intervenção humana já
 * expirou (pausedUntil no passado). Retorna quantos leads voltaram para a IA.
 */
export async function resumeExpiredPauses(storeId: string): Promise<number> {
  const expired = await prisma.lead.findMany({
    where: {
      storeId,
      aiStatus: AIStatus.PAUSED,
      pausedUntil: { lt: new Date() },
    },
    select: { id: true },
  });

  for (const lead of expired) {
    await resumeAIForLead(lead.id);
  }

  return expired.length;
}

/**
 * Garante que o lead tenha uma Conversation (o seed só cria para alguns leads).
 * Cria a conversa vazia herdando os dados do lead quando necessário.
 */export async function ensureConversationForLead(leadId: string) {
  const existing = await prisma.conversation.findUnique({ where: { leadId } });
  if (existing) return existing;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw Object.assign(new Error('Lead não encontrado'), { statusCode: 404 });

  return prisma.conversation.create({
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
}
