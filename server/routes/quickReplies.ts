import { Router } from 'express';
import { prisma } from '../db';
import { getDefaultStore } from '../helpers/tenant';

export const quickRepliesRouter = Router();

const ALLOWED_CATEGORIES = new Set([
  'medidas',
  'precos',
  'envio',
  'garantia',
  'pagamento',
  'geral',
]);

function formatQuickReply(reply: {
  id: string;
  title: string;
  shortcut: string;
  category: string;
  content: string;
}) {
  return {
    id: reply.id,
    title: reply.title,
    shortcut: reply.shortcut,
    category: reply.category,
    content: reply.content,
  };
}

function normalizeShortcut(shortcut: string): string {
  const clean = shortcut.trim().toLowerCase().replace(/\s+/g, '-');
  if (!clean) return '';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

// GET /api/quick-replies - Lista as respostas rápidas da loja
quickRepliesRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    const replies = await prisma.quickReply.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json(replies.map(formatQuickReply));
  } catch (error: any) {
    console.error('Erro ao buscar respostas rápidas:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar respostas rápidas' });
  }
});

// POST /api/quick-replies - Cadastra uma resposta rápida
quickRepliesRouter.post('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const { title, shortcut, content, category } = req.body ?? {};

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Campo "title" é obrigatório.' });
    }
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Campo "content" é obrigatório.' });
    }

    const normalizedShortcut = normalizeShortcut(
      typeof shortcut === 'string' && shortcut.trim() !== ''
        ? shortcut
        : title,
    );
    if (!normalizedShortcut) {
      return res.status(400).json({ error: 'Não foi possível gerar um atalho válido.' });
    }

    const duplicate = await prisma.quickReply.findFirst({
      where: { storeId: store.id, shortcut: normalizedShortcut },
    });
    if (duplicate) {
      return res.status(409).json({
        error: `O atalho ${normalizedShortcut} já está em uso por "${duplicate.title}".`,
      });
    }

    const normalizedCategory =
      typeof category === 'string' && ALLOWED_CATEGORIES.has(category)
        ? category
        : 'geral';

    const created = await prisma.quickReply
      .create({
        data: {
          storeId: store.id,
          title: title.trim().slice(0, 120),
          shortcut: normalizedShortcut,
          category: normalizedCategory,
          content: content.trim(),
        },
      })
      .catch((error: any) => {
        // A unique composta (storeId, shortcut) é a última linha de defesa
        // contra duas requisições simultâneas criando o mesmo atalho.
        if (error?.code === 'P2002') {
          throw Object.assign(
            new Error(`O atalho ${normalizedShortcut} já está em uso.`),
            { statusCode: 409 },
          );
        }
        throw error;
      });

    res.status(201).json(formatQuickReply(created));
  } catch (error: any) {
    if (error?.statusCode === 409) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Erro ao criar resposta rápida:', error);
    res.status(500).json({ error: error?.message || 'Falha ao criar resposta rápida' });
  }
});

// DELETE /api/quick-replies/:id - Remove uma resposta rápida
quickRepliesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.quickReply.delete({ where: { id: req.params.id } });
    res.json({ success: true, id: req.params.id });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Resposta rápida não encontrada.' });
    }
    console.error('Erro ao remover resposta rápida:', error);
    res.status(500).json({ error: error?.message || 'Falha ao remover resposta rápida' });
  }
});
