import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { productsRouter } from './routes/products';
import { storeRouter } from './routes/store';
import { aiRouter } from './routes/ai';
import { leadsRouter } from './routes/leads';
import { conversationsRouter } from './routes/conversations';
import { aiConfigRouter } from './routes/aiConfig';
import { knowledgeRouter } from './routes/knowledge';

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

// Fallback para rota não encontrada
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado' });
});
