import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { productsRouter } from './routes/products.js';
import { storeRouter } from './routes/store.js';
import { aiRouter } from './routes/ai.js';
import { leadsRouter } from './routes/leads.js';
import { conversationsRouter } from './routes/conversations.js';
import { aiConfigRouter } from './routes/aiConfig.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { quickRepliesRouter } from './routes/quickReplies.js';
import { devLogsRouter } from './routes/devLogs.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { webhooksRouter } from './routes/webhooks.js';

export const app = express();

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Rotas da API
app.use('/api/health', healthRouter);
app.use('/api/products', productsRouter);
app.use('/api/store', storeRouter);
app.use('/api/ai', aiRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/ai-config', aiConfigRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/quick-replies', quickRepliesRouter);
app.use('/api/dev-logs', devLogsRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/webhooks', webhooksRouter);

// Fallback para rota não encontrada
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado' });
});
