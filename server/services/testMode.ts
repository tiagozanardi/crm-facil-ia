/**
 * Modo Teste por loja (Fase 11 / Onda 1.5).
 *
 * Objetivo: permitir testar a Evolution + IA com um número próprio **sem risco** de a IA
 * conversar com contatos reais. Quando o modo teste está ligado:
 *
 *  1. o webhook **descarta completamente** qualquer contato que não esteja em `testModeNumbers`
 *     (sem Lead, Conversation, Message nem DevLog — nada é gravado);
 *  2. a IA só responde automaticamente para os números da lista (ver `whatsappFlow.ts`).
 *
 * A configuração vive em `Store.testModeEnabled` / `Store.testModeNumbers` (multi-tenant: cada
 * loja tem a sua lista). Números são normalizados em E.164 só com dígitos (`5598988451290`).
 *
 * Este módulo não envia nada; é só leitura/normalização da configuração.
 */

import { prisma } from '../db.js';

/** Teto de números por loja: o modo teste não é uma lista de transmissão. */
export const MAX_TEST_MODE_NUMBERS = 10;

export interface TestModeConfig {
  enabled: boolean;
  numbers: string[];
}

/**
 * Normaliza um telefone para E.164 só com dígitos.
 *
 * - Aceita `+55 (98) 98845-1290`, `5598988451290`, `98988451290` etc.
 * - 10/11 dígitos (DDD + número, sem DDI) recebem o `55` (mesma regra do webhook/backfill).
 * - 12–15 dígitos já são tratados como E.164.
 * - Qualquer outro tamanho ou caractere fora de `+ - ( ) . espaço` é inválido.
 *
 * Retorna `null` quando não é um telefone utilizável.
 */
export function normalizeTestNumber(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;

  const value = String(raw).trim();
  if (!value) return null;
  // Evita "números" que na verdade são lixo de planilha (letras, @, emoji...).
  if (!/^[\d\s()+\-.\u00A0]+$/.test(value)) return null;

  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

export interface NormalizeNumbersResult {
  numbers: string[];
  /** Valores que não puderam ser interpretados (o chamador devolve 400 com eles). */
  invalid: string[];
  /** `true` quando passou do teto de `MAX_TEST_MODE_NUMBERS`. */
  tooMany: boolean;
}

/**
 * Normaliza a lista recebida da API: aceita array de strings, remove duplicatas (mesmo número
 * digitado de formas diferentes) e devolve os inválidos para a rota explicar o erro.
 */
export function normalizeTestNumbers(raw: unknown): NormalizeNumbersResult {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const numbers: string[] = [];
  const invalid: string[] = [];

  for (const item of list) {
    const normalized = normalizeTestNumber(item);
    if (!normalized) {
      const label = typeof item === 'string' || typeof item === 'number' ? String(item).trim() : '';
      if (label) invalid.push(label.slice(0, 40));
      continue;
    }
    if (!numbers.includes(normalized)) numbers.push(normalized);
  }

  return { numbers, invalid, tooMany: numbers.length > MAX_TEST_MODE_NUMBERS };
}

/** Compara sem depender do formato salvo (sempre E.164 só com dígitos). */
export function isTestModeNumber(config: TestModeConfig, phoneE164: string | null): boolean {
  if (!phoneE164) return false;
  const digits = phoneE164.replace(/\D/g, '');
  return config.numbers.some((number) => number.replace(/\D/g, '') === digits);
}

/** Lê a configuração do banco (sempre a fonte da verdade; sem cache entre eventos). */
export async function getTestModeConfig(storeId: string): Promise<TestModeConfig> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { testModeEnabled: true, testModeNumbers: true },
  });

  return {
    enabled: store?.testModeEnabled === true,
    numbers: Array.isArray(store?.testModeNumbers) ? store.testModeNumbers : [],
  };
}

/**
 * Decide se o contato pode entrar no CRM / receber IA.
 *
 * Quando o modo teste está desligado, **tudo** é permitido (comportamento normal). Quando está
 * ligado, só os números da lista passam.
 */
export async function resolveTestModeAccess(
  storeId: string,
  phoneE164: string | null,
): Promise<{ testMode: TestModeConfig; allowed: boolean }> {
  const testMode = await getTestModeConfig(storeId);
  if (!testMode.enabled) return { testMode, allowed: true };
  return { testMode, allowed: isTestModeNumber(testMode, phoneE164) };
}
