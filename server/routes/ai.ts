import { Router } from 'express';
import {
  assertApiKeyConfigured,
  generateAIReply,
  MissingApiKeyError,
} from '../services/ai';
import { getDefaultStore } from '../helpers/tenant';

export const aiRouter = Router();

// POST /api/ai/generate
// Corpo esperado: { message: string, conversationHistory?: Array<{role, content}> }
// Retorna: { response, model, tokensUsed, latencyMs }
aiRouter.post('/generate', async (req, res) => {
  const { message, conversationHistory = [] } = req.body ?? {};

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }

  try {
    assertApiKeyConfigured();

    const store = await getDefaultStore();

    const result = await generateAIReply({
      storeId: store.id,
      userMessage: message,
      history: Array.isArray(conversationHistory) ? conversationHistory : [],
      source: 'Playground IA',
    });

    return res.json(result);
  } catch (error: any) {
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    if (error?.code === 'P2025' || error?.message === 'Loja não encontrada no banco de dados.') {
      return res.status(503).json({ error: 'Loja não encontrada no banco de dados.' });
    }

    console.error('Erro ao chamar OpenAI:', error);
    return res.status(502).json({
      error: 'Falha ao gerar resposta da IA. Verifique sua chave de API no .env.',
      details: error?.message,
    });
  }
});
