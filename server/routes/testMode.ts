/**
 * Rotas do Modo Teste (Fase 11 / Onda 1.5): `GET` e `PUT /api/test-mode`.
 *
 * A configuração é por loja (multi-tenant) e vive em `Store.testModeEnabled` / `testModeNumbers`.
 * O webhook e a auto-resposta leem a mesma fonte, então salvar aqui muda o comportamento na hora
 * (sem redeploy, sem variável de ambiente).
 */

import { Router } from 'express';
import { prisma } from '../db.js';
import { getDefaultStore } from '../helpers/tenant.js';
import {
  MAX_TEST_MODE_NUMBERS,
  normalizeTestNumbers,
  type TestModeConfig,
} from '../services/testMode.js';

export const testModeRouter = Router();

/** Mesmos códigos de pooler tratados nas outras rotas (503 em vez de 500). */
const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

function toPayload(config: TestModeConfig) {
  return {
    enabled: config.enabled,
    numbers: config.numbers,
    maxNumbers: MAX_TEST_MODE_NUMBERS,
  };
}

function isDatabaseUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code);
}

// GET /api/test-mode - configuração atual da loja
testModeRouter.get('/', async (_req, res) => {
  try {
    const store = await getDefaultStore();
    return res.json(
      toPayload({
        enabled: store.testModeEnabled === true,
        numbers: Array.isArray(store.testModeNumbers) ? store.testModeNumbers : [],
      }),
    );
  } catch (error: any) {
    if (isDatabaseUnavailable(error)) {
      return res.status(503).json({
        error: 'Banco de dados indisponível no momento. Tente novamente em instantes.',
        code: 'DATABASE_UNAVAILABLE',
      });
    }
    console.error('Erro ao buscar o modo teste:', error);
    return res.status(500).json({ error: error?.message || 'Falha ao buscar o modo teste' });
  }
});

// PUT /api/test-mode - liga/desliga e substitui a lista de números
testModeRouter.put('/', async (req, res) => {
  try {
    const store = await getDefaultStore();
    const { enabled, numbers } = req.body ?? {};

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Campo "enabled" deve ser booleano (true/false).',
        code: 'INVALID_BODY',
      });
    }

    const currentNumbers = Array.isArray(store.testModeNumbers) ? store.testModeNumbers : [];
    const wantsList = numbers !== undefined;
    if (wantsList && !Array.isArray(numbers)) {
      return res.status(400).json({
        error: 'Campo "numbers" deve ser uma lista de telefones.',
        code: 'INVALID_BODY',
      });
    }

    const normalized = wantsList
      ? normalizeTestNumbers(numbers)
      : { numbers: currentNumbers, invalid: [], tooMany: false };

    if (normalized.invalid.length > 0) {
      return res.status(400).json({
        error: `Número inválido: ${normalized.invalid.join(', ')}. Use DDD + número, por exemplo +55 98 98845-1290.`,
        code: 'INVALID_PHONE',
        invalid: normalized.invalid,
      });
    }

    if (normalized.tooMany) {
      return res.status(400).json({
        error: `O modo teste aceita no máximo ${MAX_TEST_MODE_NUMBERS} números.`,
        code: 'TOO_MANY_NUMBERS',
        maxNumbers: MAX_TEST_MODE_NUMBERS,
      });
    }

    const nextEnabled = enabled === undefined ? store.testModeEnabled : enabled;
    const nextNumbers = wantsList ? normalized.numbers : currentNumbers;

    // Ligar sem número bloquearia todas as mensagens — provavelmente é engano, não intenção.
    if (nextEnabled && nextNumbers.length === 0) {
      return res.status(400).json({
        error:
          'Cadastre pelo menos um número de teste antes de ligar o modo teste. Sem números, todas as mensagens seriam descartadas.',
        code: 'NO_TEST_NUMBERS',
      });
    }

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        ...(enabled !== undefined ? { testModeEnabled: enabled } : {}),
        ...(wantsList ? { testModeNumbers: normalized.numbers } : {}),
      },
      select: { testModeEnabled: true, testModeNumbers: true },
    });

    return res.json(
      toPayload({
        enabled: updated.testModeEnabled === true,
        numbers: Array.isArray(updated.testModeNumbers) ? updated.testModeNumbers : [],
      }),
    );
  } catch (error: any) {
    if (isDatabaseUnavailable(error)) {
      return res.status(503).json({
        error: 'Banco de dados indisponível no momento. Tente novamente em instantes.',
        code: 'DATABASE_UNAVAILABLE',
      });
    }
    console.error('Erro ao salvar o modo teste:', error);
    return res.status(500).json({ error: error?.message || 'Falha ao salvar o modo teste' });
  }
});
