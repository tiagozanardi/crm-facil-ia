import { Router } from 'express';
import { KnowledgeSource } from '@prisma/client';
import { prisma } from '../db';
import { getDefaultStore } from '../helpers/tenant';

export const knowledgeRouter = Router();

function formatKnowledge(item: {
  id: string;
  question: string;
  answer: string;
  source: KnowledgeSource;
  createdAt: Date;
}) {
  return {
    id: item.id,
    question: item.question,
    answer: item.answer,
    source: item.source === KnowledgeSource.MANUAL ? 'manual' : 'humano_chat',
    createdAt: item.createdAt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

// GET /api/knowledge - Base de conhecimento (RAG) da loja
knowledgeRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    const items = await prisma.aIKnowledge.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(items.map(formatKnowledge));
  } catch (error: any) {
    console.error('Erro ao buscar base de conhecimento:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar base de conhecimento' });
  }
});

// POST /api/knowledge - Ensina a IA com uma pergunta/resposta
knowledgeRouter.post('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const { question, answer, source } = req.body ?? {};

    if (!question || typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'Campo "question" é obrigatório.' });
    }
    if (!answer || typeof answer !== 'string' || answer.trim() === '') {
      return res.status(400).json({ error: 'Campo "answer" é obrigatório.' });
    }

    const created = await prisma.aIKnowledge.create({
      data: {
        storeId: store.id,
        question: question.trim().slice(0, 500),
        answer: answer.trim(),
        source: source === 'manual' ? KnowledgeSource.MANUAL : KnowledgeSource.HUMANO_CHAT,
      },
    });

    res.status(201).json(formatKnowledge(created));
  } catch (error: any) {
    console.error('Erro ao ensinar a IA:', error);
    res.status(500).json({ error: error?.message || 'Falha ao salvar conhecimento' });
  }
});

// DELETE /api/knowledge/:id - Remove um conhecimento da base
knowledgeRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.aIKnowledge.delete({ where: { id: req.params.id } });
    res.json({ success: true, id: req.params.id });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Conhecimento não encontrado.' });
    }
    console.error('Erro ao remover conhecimento:', error);
    res.status(500).json({ error: error?.message || 'Falha ao remover conhecimento' });
  }
});
