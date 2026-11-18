import { Router } from 'express';
import { prisma } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    const storeCount = await prisma.store.count();
    res.json({
      status: 'ok',
      service: 'crm-facil-ia-api',
      mode: 'hybrid',
      database: 'connected',
      storesConfigured: storeCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      service: 'crm-facil-ia-api',
      database: 'disconnected',
      error: error?.message || 'Database connection error',
      timestamp: new Date().toISOString(),
    });
  }
});
