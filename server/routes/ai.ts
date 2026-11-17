import { Router } from 'express';
import { getOpenAIClient, buildSystemPrompt, OPENAI_MODEL } from '../services/openai';
import { prisma } from '../db';
import { getDefaultStore } from '../helpers/tenant';

export const aiRouter = Router();

// POST /api/ai/generate
// Corpo esperado: { message: string, conversationHistory?: Array<{role, content}> }
// Retorna: { response: string, model: string, tokensUsed: number }
aiRouter.post('/generate', async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  let store: Awaited<ReturnType<typeof getDefaultStore>>;
  try {
    store = await getDefaultStore();
  } catch (err: any) {
    return res.status(503).json({ error: 'Loja não encontrada no banco de dados.' });
  }

  // Buscar dados de contexto em paralelo
  const [products, quickReplies, aiConfig, knowledgeItems] = await Promise.all([
    prisma.product.findMany({
      where: { storeId: store.id, active: true, stock: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quickReply.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.aIConfig.findFirst({ where: { storeId: store.id } }),
    prisma.aIKnowledge.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 20, // Limita para não estourar context window
    }),
  ]);

  const configContext = {
    tone: aiConfig?.tone?.toLowerCase() || 'consultivo',
    emojiIntensity: aiConfig?.emojiIntensity?.toLowerCase() || 'moderate',
    slangType: aiConfig?.slangType?.toLowerCase() || 'neutro',
    ctaStrategy: aiConfig?.ctaStrategy?.toLowerCase() || 'consultor_humano',
    maxWordsPerReply: aiConfig?.maxWordsPerReply || 55,
    vipGroupLink: store.vipGroupLink || undefined,
  };

  const systemPrompt = buildSystemPrompt(
    {
      name: store.name,
      whatsappNumber: store.whatsappNumber,
      address: store.address || undefined,
    },
    configContext,
    products.map((p) => ({
      name: p.name,
      category: p.category.toLowerCase(),
      price: Number(p.price),
      pixPrice: p.pixPrice ? Number(p.pixPrice) : null,
      stock: p.stock,
      dimensions: p.dimensions || null,
      colors: p.colors,
      description: p.description || null,
    })),
    quickReplies.map((qr) => ({
      title: qr.title,
      shortcut: qr.shortcut,
      content: qr.content,
    })),
    knowledgeItems.map((k) => `P: ${k.question} | R: ${k.answer}`),
  );

  // Monta histórico da conversa para contexto multi-turno
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10), // Últimas 10 mensagens para não estourar tokens
    { role: 'user', content: message.trim() },
  ];

  let openai: ReturnType<typeof getOpenAIClient>;
  try {
    openai = getOpenAIClient();
  } catch (err: any) {
    return res.status(503).json({ error: err.message });
  }

  const startTime = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const latencyMs = Date.now() - startTime;
    const responseText = completion.choices[0]?.message?.content?.trim() || '';
    const tokensIn = completion.usage?.prompt_tokens || 0;
    const tokensOut = completion.usage?.completion_tokens || 0;

    // Registrar log técnico no banco (assíncrono, não bloqueia a resposta)
    prisma.devLog.create({
      data: {
        storeId: store.id,
        level: 'AI_CALL',
        service: 'OPENAI',
        message: `Playground IA: "${message.substring(0, 60)}..."`,
        tokensIn,
        tokensOut,
        latencyMs,
        metadata: {
          model: OPENAI_MODEL,
          tone: configContext.tone,
          emojiIntensity: configContext.emojiIntensity,
          finishReason: completion.choices[0]?.finish_reason,
        },
      },
    }).catch(() => {}); // Silencia erro de log para não impactar a resposta

    return res.json({
      response: responseText,
      model: OPENAI_MODEL,
      tokensUsed: tokensIn + tokensOut,
      latencyMs,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;

    // Registrar erro no banco
    prisma.devLog.create({
      data: {
        storeId: store.id,
        level: 'ERROR',
        service: 'OPENAI',
        message: `Erro na geração IA: ${err.message}`,
        latencyMs,
        metadata: { error: err.message, model: OPENAI_MODEL },
      },
    }).catch(() => {});

    console.error('Erro ao chamar OpenAI:', err);
    return res.status(502).json({
      error: 'Falha ao gerar resposta da IA. Verifique sua chave de API no .env.',
      details: err.message,
    });
  }
});

// Importação necessária dentro do arquivo para uso do tipo
import OpenAI from 'openai';
