import { Router } from 'express';
import { LogLevel, ServiceName } from '@prisma/client';
import { prisma } from '../db';
import { getDefaultStore } from '../helpers/tenant';
import { assertApiKeyConfigured, generateDevDiagnosis, MissingApiKeyError } from '../services/ai';

export const devLogsRouter = Router();

// ------------------------------------------------------------
// Mapeamento entre os enums do Prisma e os valores do frontend
// ------------------------------------------------------------
const LEVEL_TO_CLIENT: Record<LogLevel, 'info' | 'warn' | 'error' | 'ai_call'> = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  AI_CALL: 'ai_call',
};

const LEVEL_FROM_QUERY: Record<string, LogLevel> = {
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  ai_call: LogLevel.AI_CALL,
};

const SERVICE_TO_CLIENT: Record<ServiceName, string> = {
  EVOLUTION_API: 'Evolution_API',
  OPENAI: 'OpenAI',
  GEMINI: 'Gemini',
  CRM_WEBHOOK: 'CRM_Webhook',
  TOKEN_BILLING: 'Token_Billing',
};

const SERVICE_FROM_QUERY: Record<string, ServiceName> = {
  Evolution_API: ServiceName.EVOLUTION_API,
  OpenAI: ServiceName.OPENAI,
  Gemini: ServiceName.GEMINI,
  CRM_Webhook: ServiceName.CRM_WEBHOOK,
  Token_Billing: ServiceName.TOKEN_BILLING,
};

// Preço aproximado do gpt-4o-mini (USD por 1M de tokens).
const COST_PER_INPUT_TOKEN = 0.15 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 0.6 / 1_000_000;

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function formatDevLog(log: {
  id: string;
  storeId: string;
  level: LogLevel;
  service: ServiceName;
  message: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    id: log.id,
    timestamp: formatTimestamp(log.createdAt),
    level: LEVEL_TO_CLIENT[log.level],
    service: SERVICE_TO_CLIENT[log.service],
    message: log.message,
    details: log.metadata ?? undefined,
    storeId: log.storeId,
    tokensIn: log.tokensIn ?? 0,
    tokensOut: log.tokensOut ?? 0,
    latencyMs: log.latencyMs ?? 0,
  };
}

// GET /api/dev-logs - Lista logs técnicos + métricas de consumo
// Query params opcionais: level, service, search, limit
devLogsRouter.get('/', async (req, res) => {
  try {
    const store = await getDefaultStore();

    const levelParam = typeof req.query.level === 'string' ? req.query.level : '';
    const serviceParam = typeof req.query.service === 'string' ? req.query.service : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.round(limitParam), 1), 200)
      : 100;

    const where: Record<string, unknown> = { storeId: store.id };
    if (levelParam && LEVEL_FROM_QUERY[levelParam]) {
      where.level = LEVEL_FROM_QUERY[levelParam];
    }
    if (serviceParam && SERVICE_FROM_QUERY[serviceParam]) {
      where.service = SERVICE_FROM_QUERY[serviceParam];
    }
    if (search) {
      where.message = { contains: search, mode: 'insensitive' };
    }

    const [logs, total, aggregation, since] = await Promise.all([
      prisma.devLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.devLog.count({ where }),
      prisma.devLog.findMany({
        where: { storeId: store.id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
        select: { level: true, service: true, tokensIn: true, tokensOut: true, latencyMs: true },
      }),
      prisma.devLog.findFirst({
        where: { storeId: store.id },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const tokensIn = aggregation.reduce((acc, log) => acc + (log.tokensIn ?? 0), 0);
    const tokensOut = aggregation.reduce((acc, log) => acc + (log.tokensOut ?? 0), 0);
    const aiCalls = aggregation.filter((log) => log.level === LogLevel.AI_CALL).length;
    const errors = aggregation.filter((log) => log.level === LogLevel.ERROR).length;
    const warnings = aggregation.filter((log) => log.level === LogLevel.WARN).length;

    const latencySamples = aggregation
      .map((log) => log.latencyMs ?? 0)
      .filter((value) => value > 0);
    const avgLatencyMs = latencySamples.length
      ? Math.round(latencySamples.reduce((acc, value) => acc + value, 0) / latencySamples.length)
      : 0;

    const byService: Record<string, number> = {};
    for (const log of aggregation) {
      const name = SERVICE_TO_CLIENT[log.service];
      byService[name] = (byService[name] ?? 0) + 1;
    }

    res.json({
      logs: logs.map(formatDevLog),
      total,
      returned: logs.length,
      summary: {
        windowDays: 30,
        tokensIn,
        tokensOut,
        tokensTotal: tokensIn + tokensOut,
        estimatedCostUsd:
          tokensIn * COST_PER_INPUT_TOKEN + tokensOut * COST_PER_OUTPUT_TOKEN,
        aiCalls,
        errors,
        warnings,
        events: aggregation.length,
        avgLatencyMs,
        byService,
        firstLogAt: since?.createdAt ?? null,
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar logs técnicos:', error);
    res.status(500).json({ error: error?.message || 'Falha ao buscar logs técnicos' });
  }
});

// POST /api/dev-logs/:id/diagnose - Diagnóstico do log via OpenAI (Agente Dev)
devLogsRouter.post('/:id/diagnose', async (req, res) => {
  try {
    assertApiKeyConfigured();

    const log = await prisma.devLog.findUnique({ where: { id: req.params.id } });
    if (!log) {
      return res.status(404).json({ error: 'Log não encontrado.' });
    }

    const store = await prisma.store.findUnique({
      where: { id: log.storeId },
      select: { name: true },
    });

    const result = await generateDevDiagnosis({
      service: SERVICE_TO_CLIENT[log.service],
      level: LEVEL_TO_CLIENT[log.level],
      message: log.message,
      metadata: log.metadata,
      tokensIn: log.tokensIn,
      tokensOut: log.tokensOut,
      latencyMs: log.latencyMs,
      storeName: store?.name,
      storeId: log.storeId,
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof MissingApiKeyError) {
      return res.status(503).json({ error: error.message });
    }
    console.error('Erro ao diagnosticar log:', error);
    res.status(502).json({
      error: 'Falha ao gerar diagnóstico com a IA. Verifique a chave OPENAI_API_KEY.',
      details: error?.message,
    });
  }
});
