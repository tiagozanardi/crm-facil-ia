/**
 * Rotas de conexão do WhatsApp (Evolution API) — Fase 11 / Onda 1 / S2.
 *
 * São rotas de **administração da instância** (não do chat):
 *  - `GET    /api/whatsapp/instance`            → status, número conectado, QR em cache e diagnóstico;
 *  - `GET    /api/whatsapp/instance?refresh=1`  → consulta a Evolution e atualiza o cache;
 *  - `POST   /api/whatsapp/instance`            → cria (idempotente) e configura o webhook;
 *  - `POST   /api/whatsapp/instance/connect`    → gera QR novo (proxy: a chave nunca vai ao frontend);
 *  - `POST   /api/whatsapp/instance/logout`     → desconecta o celular sem apagar a instância;
 *  - `POST   /api/whatsapp/instance/restart`    → reinicia a sessão na Evolution.
 *
 * A feature flag `EVOLUTION_ENABLED` **não** bloqueia estas rotas: conectar o número é pré-requisito
 * para ligar o envio depois (S4). Sem `APP_PUBLIC_URL` a instância é criada, mas o webhook não é
 * configurado — a resposta traz `webhookWarning` explicando o que falta.
 *
 * Nada aqui expõe `EVOLUTION_API_KEY`: o QR e o status saem por proxy, já normalizados.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { WhatsAppStatus, type Store, type WhatsAppInstance } from '@prisma/client';
import { prisma } from '../db.js';
import { getDefaultStore } from '../helpers/tenant.js';
import {
  EvolutionError,
  connect,
  createInstance,
  findInstance,
  getEvolutionPublicConfig,
  logout,
  restart,
  setWebhook,
} from '../services/evolution.js';

export const whatsappRouter = Router();

const WEBHOOK_PATH = '/api/webhooks/evolution';
const LOG_SOURCE = 'Conexão WhatsApp';

type StoreLike = Pick<Store, 'id' | 'slug' | 'name'>;

// ------------------------------------------------------------
// Helpers locais
// ------------------------------------------------------------

/** `Malas SLZ` → `malas-slz` (a Evolution não aceita espaço/acento no nome da instância). */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'loja'
  );
}

/** `crm-malas-slz` — 1 instância por loja nesta fase (`EVOLUTION_INSTANCE_PREFIX`). */
function instanceNameFor(store: StoreLike): string {
  const prefix = getEvolutionPublicConfig().instancePrefix;
  return `${prefix}-${slugify(store.slug || store.name)}`;
}

/** Destino do webhook. `null` quando `APP_PUBLIC_URL` não está definida. */
function webhookUrl(): string | null {
  const base = (process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}${WEBHOOK_PATH}` : null;
}

/** Avisos de configuração que a tela deve mostrar (sem expor segredo). */
function webhookWarning(): string | null {
  const base = (process.env.APP_PUBLIC_URL ?? '').trim();
  if (!base) {
    return 'APP_PUBLIC_URL não definida: a instância pode ser criada, mas o webhook não será configurado.';
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) {
    return 'APP_PUBLIC_URL aponta para localhost: a Evolution (na nuvem) não alcança esse endereço.';
  }
  if (!(process.env.EVOLUTION_WEBHOOK_SECRET ?? '').trim()) {
    return 'EVOLUTION_WEBHOOK_SECRET ausente: o webhook seria aceito sem autenticação.';
  }
  return null;
}

function toPrismaStatus(state: string | null): WhatsAppStatus | null {
  switch (state) {
    case 'open':
      return WhatsAppStatus.CONNECTED;
    case 'connecting':
      return WhatsAppStatus.CONNECTING;
    case 'close':
      return WhatsAppStatus.DISCONNECTED;
    default:
      return null;
  }
}

/** `5598988451290:12@s.whatsapp.net` → `5598988451290` */
function parseOwnerJid(ownerJid: string | null): string | null {
  if (!ownerJid) return null;
  const digits = ownerJid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? '';
  return digits.length >= 10 ? digits : null;
}

function serialize(row: WhatsAppInstance | null, store: StoreLike) {
  const evolution = getEvolutionPublicConfig();
  const hookUrl = webhookUrl();

  return {
    id: row?.id ?? null,
    storeId: store.id,
    storeSlug: store.slug,
    instanceName: row?.instanceName ?? instanceNameFor(store),
    status: row?.status ?? WhatsAppStatus.DISCONNECTED,
    connected: row?.status === WhatsAppStatus.CONNECTED,
    phoneNumber: row?.phoneNumber ?? null,
    /** Data URI (`data:image/png;base64,...`) pronto para `<img src>`. */
    qrCode: row?.qrCodeBase64 ?? null,
    qrUpdatedAt: row?.qrUpdatedAt?.toISOString() ?? null,
    lastSeenAt: row?.lastSeenAt?.toISOString() ?? null,
    webhookUrl: hookUrl,
    webhookWarning: webhookWarning(),
    evolution,
  };
}

/**
 * Erros Prisma de indisponibilidade (pooler do Supabase caiu, timeout de conexão): devolve 503
 * com mensagem amigável em vez de 500 — aconteceu de verdade no primeiro teste do S2 (P1001).
 */
const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

function isDatabaseUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code);
}

function sendRouteError(res: Response, error: unknown, fallback: string) {
  if (error instanceof EvolutionError) {
    // `error.message` já vem sanitizada (sem corpo completo, sem telefone/chave).
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      operation: error.operation,
    });
  }

  if (isDatabaseUnavailable(error)) {
    return res.status(503).json({
      error: 'Banco de dados indisponível no momento. Tente novamente em alguns segundos.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

/** Configura o webhook da instância e devolve o resultado (não derruba a criação se falhar). */
async function configureWebhook(
  instanceName: string,
  storeId: string,
): Promise<{ configured: boolean; error?: string }> {
  const url = webhookUrl();
  if (!url) return { configured: false, error: webhookWarning() ?? 'APP_PUBLIC_URL ausente.' };

  const secret = (process.env.EVOLUTION_WEBHOOK_SECRET ?? '').trim() || undefined;

  try {
    await setWebhook(instanceName, url, secret, { storeId, source: LOG_SOURCE });
    return { configured: true };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof EvolutionError ? error.message : 'Falha ao configurar o webhook.',
    };
  }
}

/** Consulta a Evolution e atualiza o cache local (status, número, última atividade). */
async function syncWithEvolution(row: WhatsAppInstance, storeId: string): Promise<WhatsAppInstance> {
  const summary = await findInstance(row.instanceName, { storeId, source: LOG_SOURCE });

  if (!summary) {
    return prisma.whatsAppInstance.update({
      where: { id: row.id },
      data: { status: WhatsAppStatus.DISCONNECTED, qrCodeBase64: null, qrUpdatedAt: null },
    });
  }

  const status = toPrismaStatus(summary.state) ?? row.status;
  const phoneNumber = parseOwnerJid(summary.ownerJid);

  return prisma.whatsAppInstance.update({
    where: { id: row.id },
    data: {
      status,
      ...(status === WhatsAppStatus.CONNECTED && phoneNumber ? { phoneNumber } : {}),
      lastSeenAt: new Date(),
    },
  });
}

// ------------------------------------------------------------
// GET /api/whatsapp/instance
// ------------------------------------------------------------

whatsappRouter.get('/instance', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const row = await prisma.whatsAppInstance.findUnique({ where: { storeId: store.id } });

    if (!row) return res.json(serialize(null, store));

    const wantsRefresh = ['1', 'true', 'yes'].includes(String(req.query.refresh ?? '').toLowerCase());
    if (!wantsRefresh) return res.json(serialize(row, store));

    try {
      const fresh = await syncWithEvolution(row, store.id);
      return res.json(serialize(fresh, store));
    } catch (error) {
      // Status remoto indisponível não invalida o cache local: devolve o que temos + o aviso.
      const message = error instanceof EvolutionError ? error.message : 'Falha ao consultar a Evolution API.';
      return res.json({
        ...serialize(row, store),
        stale: true,
        refreshError: message,
      });
    }
  } catch (error) {
    return sendRouteError(res, error, 'Falha ao consultar a instância do WhatsApp.');
  }
});

// ------------------------------------------------------------
// POST /api/whatsapp/instance — cria (idempotente) + webhook
// ------------------------------------------------------------

whatsappRouter.post('/instance', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const instanceName = instanceNameFor(store);
    const existing = await prisma.whatsAppInstance.findUnique({ where: { storeId: store.id } });

    const context = { storeId: store.id, source: LOG_SOURCE };

    let remote = await findInstance(instanceName, context);
    let qrCode = existing?.qrCodeBase64 ?? null;
    let qrUpdatedAt = existing?.qrUpdatedAt ?? null;
    let created = false;

    if (!remote) {
      try {
        const result = await createInstance(instanceName, { qrcode: true }, context);
        created = true;
        qrCode = result.qrcode?.base64 ?? qrCode;
        qrUpdatedAt = qrCode ? new Date() : qrUpdatedAt;

        // Recém-criada: a Evolution responde `status: "connecting"` e o QR acabou de ser gerado.
        // (A "hash" devolvida é a apikey da instância; não usamos hoje e não gravamos segredo.)
        remote = { ...emptySummary(instanceName), state: result.status ?? 'connecting' };
      } catch (error) {
        // Corrida: outra chamada criou a instância entre o `findInstance` e o `create`.
        if (error instanceof EvolutionError && error.status === 403) {
          remote = await findInstance(instanceName, context);
        }
        if (!remote) throw error;
      }
    }

    const webhook = await configureWebhook(instanceName, store.id);
    const status = toPrismaStatus(remote?.state ?? null) ?? WhatsAppStatus.CONNECTING;
    const phoneNumber = parseOwnerJid(remote?.ownerJid ?? null);

    const row = await prisma.whatsAppInstance.upsert({
      where: { storeId: store.id },
      update: {
        instanceName,
        status,
        lastSeenAt: new Date(),
        ...(qrCode ? { qrCodeBase64: qrCode, qrUpdatedAt: qrUpdatedAt ?? new Date() } : {}),
        ...(phoneNumber && status === WhatsAppStatus.CONNECTED ? { phoneNumber } : {}),
      },
      create: {
        storeId: store.id,
        instanceName,
        status,
        qrCodeBase64: qrCode,
        qrUpdatedAt: qrUpdatedAt ?? (qrCode ? new Date() : null),
        phoneNumber: status === WhatsAppStatus.CONNECTED ? phoneNumber : null,
      },
    });

    return res.status(created ? 201 : 200).json({
      ...serialize(row, store),
      action: created ? 'created' : 'existing',
      webhookConfigured: webhook.configured,
      ...(webhook.error ? { webhookError: webhook.error } : {}),
    });
  } catch (error) {
    return sendRouteError(res, error, 'Falha ao criar a instância do WhatsApp.');
  }
});

/** Resumo vazio para quando já sabemos o estado mas não temos o objeto completo. */
function emptySummary(instanceName: string) {
  return {
    name: instanceName,
    instanceName,
    instanceId: null,
    state: null as string | null,
    ownerJid: null as string | null,
    profileName: null as string | null,
    profilePicUrl: null as string | null,
    raw: null,
  };
}

// ------------------------------------------------------------
// POST /api/whatsapp/instance/connect — QR novo
// ------------------------------------------------------------

whatsappRouter.post('/instance/connect', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const row = await prisma.whatsAppInstance.findUnique({ where: { storeId: store.id } });

    if (!row) {
      return res.status(409).json({
        error: 'Nenhuma instância criada para esta loja. Crie a instância antes de gerar o QR Code.',
        code: 'INSTANCE_NOT_CREATED',
      });
    }

    const context = { storeId: store.id, source: LOG_SOURCE };

    let qr;
    try {
      qr = await connect(row.instanceName, context);
    } catch (error) {
      if (error instanceof EvolutionError && error.status === 404) {
        return res.status(409).json({
          error:
            'A instância não existe mais na Evolution API. Recrie a instância na tela de conexão para gerar um novo QR.',
          code: 'INSTANCE_MISSING',
        });
      }
      throw error;
    }

    if (!qr.base64 && !qr.code) {
      return res.status(502).json({
        error: 'A Evolution API não devolveu um QR Code. Aguarde alguns segundos e tente novamente.',
        code: 'EMPTY_QR',
      });
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: row.id },
      data: {
        status: WhatsAppStatus.CONNECTING,
        qrCodeBase64: qr.base64,
        qrUpdatedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    return res.json({
      ...serialize(updated, store),
      /** Código de pareamento (alternativa ao QR), quando a Evolution devolve. */
      pairingCode: qr.pairingCode ?? null,
    });
  } catch (error) {
    return sendRouteError(res, error, 'Falha ao gerar o QR Code do WhatsApp.');
  }
});

// ------------------------------------------------------------
// POST /api/whatsapp/instance/logout
// ------------------------------------------------------------

whatsappRouter.post('/instance/logout', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    const row = await prisma.whatsAppInstance.findUnique({ where: { storeId: store.id } });

    if (!row) {
      return res.status(409).json({
        error: 'Nenhuma instância criada para esta loja.',
        code: 'INSTANCE_NOT_CREATED',
      });
    }

    try {
      await logout(row.instanceName, { storeId: store.id, source: LOG_SOURCE });
    } catch (error) {
      // Instância já ausente na Evolution: o objetivo (desconectar) já está satisfeito.
      if (!(error instanceof EvolutionError && error.status === 404)) throw error;
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: row.id },
      data: {
        status: WhatsAppStatus.DISCONNECTED,
        qrCodeBase64: null,
        qrUpdatedAt: null,
        phoneNumber: null,
        lastSeenAt: new Date(),
      },
    });

    return res.json(serialize(updated, store));
  } catch (error) {
    return sendRouteError(res, error, 'Falha ao desconectar o WhatsApp.');
  }
});

// ------------------------------------------------------------
// POST /api/whatsapp/instance/restart
// ------------------------------------------------------------

whatsappRouter.post('/instance/restart', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    const row = await prisma.whatsAppInstance.findUnique({ where: { storeId: store.id } });

    if (!row) {
      return res.status(409).json({
        error: 'Nenhuma instância criada para esta loja.',
        code: 'INSTANCE_NOT_CREATED',
      });
    }

    await restart(row.instanceName, { storeId: store.id, source: LOG_SOURCE });

    const updated = await prisma.whatsAppInstance.update({
      where: { id: row.id },
      data: { status: WhatsAppStatus.CONNECTING, qrCodeBase64: null, qrUpdatedAt: null, lastSeenAt: new Date() },
    });

    return res.json(serialize(updated, store));
  } catch (error) {
    return sendRouteError(res, error, 'Falha ao reiniciar a sessão do WhatsApp.');
  }
});
