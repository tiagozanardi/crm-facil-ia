import { Router } from 'express';
import {
  AITone,
  CTAStrategy,
  EmojiIntensity,
  SlangType,
  type AIConfig as PrismaAIConfig,
} from '@prisma/client';
import { prisma } from '../db';
import { getDefaultStore } from '../helpers/tenant';

export const aiConfigRouter = Router();

const TONES: Record<string, AITone> = {
  consultivo: AITone.CONSULTIVO,
  vendedor: AITone.VENDEDOR,
  direto: AITone.DIRETO,
  afetuoso: AITone.AFETUOSO,
};

const EMOJIS: Record<string, EmojiIntensity> = {
  none: EmojiIntensity.NONE,
  moderate: EmojiIntensity.MODERATE,
  expressive: EmojiIntensity.EXPRESSIVE,
};

const SLANGS: Record<string, SlangType> = {
  neutro: SlangType.NEUTRO,
  regional_slz: SlangType.REGIONAL_SLZ,
  descontraido: SlangType.DESCONTRAIDO,
  formal: SlangType.FORMAL,
};

const CTAS: Record<string, CTAStrategy> = {
  link_pagamento: CTAStrategy.LINK_PAGAMENTO,
  direcionar_loja_fisica: CTAStrategy.DIRECIONAR_LOJA_FISICA,
  grupo_vip_whatsapp: CTAStrategy.GRUPO_VIP_WHATSAPP,
  consultor_humano: CTAStrategy.CONSULTOR_HUMANO,
};

function formatAIConfig(config: PrismaAIConfig) {
  return {
    tone: config.tone.toLowerCase(),
    emojiIntensity: config.emojiIntensity.toLowerCase(),
    slangType: config.slangType.toLowerCase(),
    ctaStrategy: config.ctaStrategy.toLowerCase(),
    maxWordsPerReply: config.maxWordsPerReply,
    activeHours: {
      start: config.activeHoursStart,
      end: config.activeHoursEnd,
      respondOffHours: config.respondOffHours,
    },
  };
}

async function ensureAIConfig(storeId: string): Promise<PrismaAIConfig> {
  const existing = await prisma.aIConfig.findUnique({ where: { storeId } });
  if (existing) return existing;

  return prisma.aIConfig.create({ data: { storeId } });
}

// GET /api/ai-config - Configuração de linguagem da IA da loja
aiConfigRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    const config = await ensureAIConfig(store.id);
    res.json(formatAIConfig(config));
  } catch (error: any) {
    console.error('Erro ao buscar configuração da IA:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar configuração da IA' });
  }
});

// PUT /api/ai-config - Atualiza tom, emojis, gírias, CTA e horários
aiConfigRouter.put('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    await ensureAIConfig(store.id);

    const { tone, emojiIntensity, slangType, ctaStrategy, maxWordsPerReply, activeHours } =
      req.body ?? {};

    const data: Record<string, unknown> = {};

    if (tone !== undefined) {
      if (!TONES[tone]) return res.status(400).json({ error: `Tom inválido: ${tone}` });
      data.tone = TONES[tone];
    }
    if (emojiIntensity !== undefined) {
      if (!EMOJIS[emojiIntensity]) {
        return res.status(400).json({ error: `Intensidade de emoji inválida: ${emojiIntensity}` });
      }
      data.emojiIntensity = EMOJIS[emojiIntensity];
    }
    if (slangType !== undefined) {
      if (!SLANGS[slangType]) {
        return res.status(400).json({ error: `Tipo de gíria inválido: ${slangType}` });
      }
      data.slangType = SLANGS[slangType];
    }
    if (ctaStrategy !== undefined) {
      if (!CTAS[ctaStrategy]) {
        return res.status(400).json({ error: `Estratégia de CTA inválida: ${ctaStrategy}` });
      }
      data.ctaStrategy = CTAS[ctaStrategy];
    }
    if (maxWordsPerReply !== undefined) {
      const words = Number(maxWordsPerReply);
      if (!Number.isFinite(words) || words < 20 || words > 200) {
        return res.status(400).json({ error: 'maxWordsPerReply deve estar entre 20 e 200.' });
      }
      data.maxWordsPerReply = Math.round(words);
    }
    if (activeHours && typeof activeHours === 'object') {
      const { start, end, respondOffHours } = activeHours;
      if (typeof start === 'string' && /^\d{2}:\d{2}$/.test(start)) data.activeHoursStart = start;
      if (typeof end === 'string' && /^\d{2}:\d{2}$/.test(end)) data.activeHoursEnd = end;
      if (typeof respondOffHours === 'boolean') data.respondOffHours = respondOffHours;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido informado.' });
    }

    const updated = await prisma.aIConfig.update({
      where: { storeId: store.id },
      data,
    });

    res.json(formatAIConfig(updated));
  } catch (error: any) {
    console.error('Erro ao atualizar configuração da IA:', error);
    res.status(500).json({ error: error?.message || 'Falha ao atualizar configuração da IA' });
  }
});
