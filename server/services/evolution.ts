/**
 * Cliente HTTP da Evolution API (WhatsApp real) — Fase 11 / Onda 1 / S1.
 *
 * Responsabilidades:
 *  - ler a configuração do ambiente (URL/chave/prefixo/timeout) e falhar cedo com erro tipado;
 *  - falar com a Evolution API **v2.3.7** (header `apikey`) com timeout e erros tipados;
 *  - registrar cada chamada na Área Dev (`DevLog` com `service = EVOLUTION_API`), mascarando telefone
 *    e nunca registrando o conteúdo da mensagem.
 *
 * Contrato da v2.3.7 conferido no código-fonte oficial (tag `2.3.7`):
 *  - `POST   /instance/create`                  (`{ instanceName, integration, qrcode, number?, webhook? }`)
 *  - `GET    /instance/connect/{name}`          (QR: `base64`, `code`, `pairingCode`)
 *  - `GET    /instance/connectionState/{name}`  (`{ instance: { instanceName, state } }`, state = open|close|connecting)
 *  - `GET    /instance/fetchInstances`
 *  - `POST   /instance/restart/{name}`
 *  - `DELETE /instance/logout/{name}` | `DELETE /instance/delete/{name}`
 *  - `POST   /webhook/set/{name}`               (`{ webhook: { enabled, url, byEvents, base64, events, headers } }`)
 *  - `GET    /webhook/find/{name}`              (devolve o webhook **direto**, sem envelope `webhook`)
 *  - `POST   /message/sendText/{name}`          (`{ number, text }` — texto **plano**)
 *
 * Pegadinha verificada na API real (2026-11-18): a documentação OpenAPI da 2.3.7 diz
 * `textMessage: { text }`, mas o validador do servidor exige `text` plano
 * (`400 instance requires property "text"`). O corpo abaixo já usa o formato que funciona.
 *
 * Este módulo **não** grava no banco de dados do CRM (exceto `DevLog`) e **não** altera o schema.
 * As regras de negócio (criar lead, dedupe, pausa da IA) ficam nas ondas seguintes.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ERROR_TEXT = 400;

/**
 * Eventos assinados por instância (Onda 1).
 *
 * `SEND_MESSAGE`/`MESSAGES_UPSERT` também chegam para mensagens enviadas pelo próprio CRM. Aqui
 * deixamos `SEND_MESSAGE` de fora de propósito: o eco de um envio feito pelo CRM poderia ser
 * interpretado como "humano respondeu pelo celular" e pausar a IA por 24h. A dedupe por
 * `externalId` (S3) cobre o `MESSAGES_UPSERT` do próprio CRM.
 */
export const EVOLUTION_WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
] as const;

export type EvolutionWebhookEvent = (typeof EVOLUTION_WEBHOOK_EVENTS)[number];

export type EvolutionConnectionState = 'open' | 'close' | 'connecting' | 'unknown';

export type EvolutionErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP';

// ------------------------------------------------------------
// Erros tipados
// ------------------------------------------------------------

/**
 * Erro único do cliente. `status` já sai no formato HTTP que as rotas devem devolver:
 * 503 = não configurado, 504 = timeout, 502 = rede, demais = status devolvido pela Evolution.
 */
export class EvolutionError extends Error {
  readonly code: EvolutionErrorCode;
  readonly status: number;
  /** Corpo da resposta (ou o motivo da falha de rede). Útil na rota; não vai para o `DevLog`. */
  readonly body: unknown;
  readonly operation: string;

  constructor(
    message: string,
    options: {
      code: EvolutionErrorCode;
      status: number;
      operation: string;
      body?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'EvolutionError';
    this.code = options.code;
    this.status = options.status;
    this.body = options.body ?? null;
    this.operation = options.operation;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /** Versão mascarada/curta para logs e para o JSON de erro da API. */
  get safeMessage(): string {
    return `${this.operation}: ${this.message}`.slice(0, MAX_ERROR_TEXT);
  }
}

/** Configuração ausente/inválida → 503 (mesmo padrão do `MissingApiKeyError` da OpenAI). */
export class EvolutionNotConfiguredError extends EvolutionError {
  constructor(missing: string, detail?: string) {
    super(
      `Evolution API não configurada: ${missing}${detail ? ` (${detail})` : ''}.`,
      { code: 'NOT_CONFIGURED', status: 503, operation: 'config' },
    );
    this.name = 'EvolutionNotConfiguredError';
  }
}

// ------------------------------------------------------------
// Configuração
// ------------------------------------------------------------

export interface EvolutionConfig {
  /** URL base sem barra final. */
  url: string;
  apiKey: string;
  /** Prefixo dos nomes de instância (padrão `crm` → `crm-malas-slz`). */
  instancePrefix: string;
  timeoutMs: number;
}

/** Feature flag mestre: sem ela as rotas mantêm o comportamento de demo. */
export function isEvolutionEnabled(): boolean {
  return String(process.env.EVOLUTION_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Lê e valida a configuração. Lança `EvolutionNotConfiguredError` (503) quando faltar URL ou chave.
 * O `EVOLUTION_ENABLED` **não** é checado aqui: a flag é decisão da rota (`isEvolutionEnabled`),
 * para que o cliente continue testável com a flag desligada.
 */
export function getEvolutionConfig(): EvolutionConfig {
  const rawUrl = (process.env.EVOLUTION_API_URL ?? '').trim();
  const apiKey = (process.env.EVOLUTION_API_KEY ?? '').trim();

  if (!rawUrl) throw new EvolutionNotConfiguredError('EVOLUTION_API_URL');
  if (!apiKey) throw new EvolutionNotConfiguredError('EVOLUTION_API_KEY');

  const url = rawUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    throw new EvolutionNotConfiguredError('EVOLUTION_API_URL', 'deve começar com https://');
  }

  const parsedTimeout = Number(process.env.EVOLUTION_TIMEOUT_MS ?? '');
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout >= 1_000
      ? Math.min(parsedTimeout, 60_000)
      : DEFAULT_TIMEOUT_MS;

  return {
    url,
    apiKey,
    instancePrefix: (process.env.EVOLUTION_INSTANCE_PREFIX ?? 'crm').trim() || 'crm',
    timeoutMs,
  };
}

/** Garante a configuração e devolve o que as rotas precisam (sem expor a chave). */
export function assertEvolutionConfigured(): EvolutionConfig {
  return getEvolutionConfig();
}

/** Diagnóstico para a tela de conexão/Área Dev: nunca devolve a chave. */
export function getEvolutionPublicConfig() {
  const url = (process.env.EVOLUTION_API_URL ?? '').trim().replace(/\/+$/, '');
  return {
    enabled: isEvolutionEnabled(),
    url: url || null,
    instancePrefix: (process.env.EVOLUTION_INSTANCE_PREFIX ?? 'crm').trim() || 'crm',
    hasApiKey: Boolean((process.env.EVOLUTION_API_KEY ?? '').trim()),
    hasWebhookSecret: Boolean((process.env.EVOLUTION_WEBHOOK_SECRET ?? '').trim()),
    appPublicUrl: (process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '') || null,
  };
}

// ------------------------------------------------------------
// Helpers de telefone (privacidade + formato da Evolution)
// ------------------------------------------------------------

/**
 * Normaliza para o formato que a Evolution espera (só dígitos, com DDI).
 * Telefones brasileiros sem DDI (10/11 dígitos) recebem o `55`.
 */
export function toEvolutionNumber(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** `5598988451290` → `5598*****1290`. Usado em `DevLog` e mensagens de erro. */
export function maskPhone(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return '***';
  return `${digits.slice(0, 4)}*****${digits.slice(-4)}`;
}

// ------------------------------------------------------------
// DevLog
// ------------------------------------------------------------

export interface EvolutionLogContext {
  /** Sem loja não há `DevLog` (a tabela exige `storeId`) — o chamador deve passar sempre que souber. */
  storeId?: string;
  /** Origem da chamada, só para leitura humana no log (ex.: "Chat do lead"). */
  source?: string;
}

interface LogInput {
  level: 'INFO' | 'ERROR';
  message: string;
  latencyMs: number;
  context?: EvolutionLogContext;
  metadata: Record<string, unknown>;
}

/** Nunca deve derrubar a chamada: falha de log é engolida de propósito. */
function logEvolution({ level, message, latencyMs, context, metadata }: LogInput): void {
  const storeId = context?.storeId;
  if (!storeId) return;

  void prisma.devLog
    .create({
      data: {
        storeId,
        level,
        service: 'EVOLUTION_API',
        message: message.slice(0, MAX_ERROR_TEXT),
        latencyMs,
        metadata: metadata as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}

// ------------------------------------------------------------
// Núcleo HTTP
// ------------------------------------------------------------

interface EvolutionRequestInput {
  method: 'GET' | 'POST' | 'DELETE';
  /** Caminho começando com `/` (ex.: `/instance/connect/crm-malas-slz`). */
  path: string;
  operation: string;
  body?: unknown;
  context?: EvolutionLogContext;
  timeoutMs?: number;
  /** Dados extras para o `DevLog` — nunca telefone completo nem conteúdo de mensagem. */
  logMetadata?: Record<string, unknown>;
  /** Leituras chamadas em polling (`connectionState`) não poluem a Área Dev com sucesso. */
  silentSuccess?: boolean;
}

function isAbortOrTimeout(error: unknown): boolean {
  const err = error as { name?: string; cause?: { name?: string } } | undefined;
  return (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    err?.cause?.name === 'TimeoutError' ||
    err?.cause?.name === 'AbortError'
  );
}

function describeCause(error: unknown): string {
  if (!error) return 'erro desconhecido';
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    const causeText =
      cause instanceof Error ? ` (${cause.message})` : typeof cause === 'string' ? ` (${cause})` : '';
    return `${error.message}${causeText}`.slice(0, MAX_ERROR_TEXT);
  }
  return String(error).slice(0, MAX_ERROR_TEXT);
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A Evolution v2 devolve erros em formatos diferentes conforme a camada que falha:
 * `{ status, error: "Bad Request", response: { message: [["..."]] } }` (mais específico),
 * `{ message: [...] }` ou `{ message: "..." }`. Preferimos sempre o mais detalhado.
 */
function extractApiMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === 'string') return body.trim().slice(0, MAX_ERROR_TEXT) || null;

  const candidates: unknown[] = [
    (body as { response?: { message?: unknown } }).response?.message,
    (body as { message?: unknown }).message,
    (body as { error?: unknown }).error,
  ];

  for (const candidate of candidates) {
    const text = flattenMessage(candidate);
    if (text) return text.slice(0, MAX_ERROR_TEXT);
  }

  return null;
}

/** Achata `["a"]`, `[["a"],"b"]` e `{ message: "a" }` num texto único. */
function flattenMessage(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map((item) => flattenMessage(item)).filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(' | ') : null;
  }
  if (value && typeof value === 'object') {
    const nested = (value as { message?: unknown }).message;
    if (nested !== undefined) return flattenMessage(nested);
  }
  return null;
}

async function evolutionRequest<T>(input: EvolutionRequestInput): Promise<T> {
  const config = getEvolutionConfig();
  const { method, path, operation, context } = input;
  const url = `${config.url}${path}`;
  const timeoutMs = input.timeoutMs ?? config.timeoutMs;
  const startedAt = Date.now();
  const baseMetadata: Record<string, unknown> = {
    operation,
    method,
    path,
    ...(context?.source ? { source: context.source } : {}),
    ...(input.logMetadata ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const timedOut = isAbortOrTimeout(error);
    const evolutionError = new EvolutionError(
      timedOut
        ? `Tempo esgotado após ${timeoutMs}ms.`
        : `Falha de rede: ${describeCause(error)}`,
      {
        code: timedOut ? 'TIMEOUT' : 'NETWORK',
        status: timedOut ? 504 : 502,
        operation,
        cause: error,
      },
    );

    logEvolution({
      level: 'ERROR',
      message: `Evolution API · ${operation} falhou (${timedOut ? 'timeout' : 'rede'}): ${evolutionError.message}`,
      latencyMs,
      context,
      metadata: { ...baseMetadata, code: evolutionError.code },
    });

    throw evolutionError;
  }

  const latencyMs = Date.now() - startedAt;
  const rawText = await response.text().catch(() => '');
  const parsed = parseJson(rawText);

  if (!response.ok) {
    const apiMessage = extractApiMessage(parsed) ?? extractApiMessage(rawText);
    const evolutionError = new EvolutionError(
      `Evolution API respondeu HTTP ${response.status}${apiMessage ? `: ${apiMessage}` : '.'}`,
      {
        code: 'HTTP',
        status: response.status,
        operation,
        body: parsed ?? rawText,
      },
    );

    logEvolution({
      level: 'ERROR',
      message: `Evolution API · ${operation} falhou: ${evolutionError.message}`,
      latencyMs,
      context,
      metadata: { ...baseMetadata, statusCode: response.status, code: evolutionError.code },
    });

    throw evolutionError;
  }

  if (!input.silentSuccess) {
    logEvolution({
      level: 'INFO',
      message: `Evolution API · ${operation} concluído (HTTP ${response.status}) em ${latencyMs}ms.`,
      latencyMs,
      context,
      metadata: { ...baseMetadata, statusCode: response.status },
    });
  }

  return (parsed ?? {}) as T;
}

// ------------------------------------------------------------
// Tipos de resposta (subconjunto útil da API)
// ------------------------------------------------------------

export interface EvolutionQrCode {
  base64: string | null;
  code: string | null;
  pairingCode: string | null;
  count: number;
}

export interface EvolutionInstanceSummary {
  name: string | null;
  instanceName: string | null;
  instanceId: string | null;
  state: string | null;
  ownerJid: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  raw: unknown;
}

export interface CreateInstanceOptions {
  qrcode?: boolean;
  /** Já com DDI; é normalizado por `toEvolutionNumber`. */
  number?: string;
  integration?: 'WHATSAPP-BAILEYS';
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface CreateInstanceResult {
  instanceName: string;
  instanceId: string | null;
  /** Chave específica da instância (`hash` na resposta), quando a Evolution devolve. */
  apiKey: string | null;
  status: string | null;
  qrcode: EvolutionQrCode | null;
  /** `true` quando a URL de webhook foi passada e configurada com sucesso. */
  webhookConfigured: boolean;
  raw: unknown;
}

export interface ConnectionStateResult {
  instanceName: string;
  state: EvolutionConnectionState;
  raw: unknown;
}

export interface SendTextResult {
  /** `key.id` do WhatsApp — usado no dedupe da Onda 1. */
  externalId: string | null;
  status: string | null;
  raw: unknown;
}

export interface WebhookConfigInput {
  url: string;
  secret?: string;
  events?: readonly string[];
  byEvents?: boolean;
  base64?: boolean;
}

/**
 * O `GET /webhook/find/{name}` da 2.3.7 devolve o webhook **direto** (sem envelope), enquanto o
 * `POST /webhook/set` devolve o mesmo objeto. Normalizamos os dois para este formato.
 */
export interface EvolutionWebhookConfig {
  enabled: boolean;
  url: string | null;
  events: string[];
  byEvents: boolean;
  base64: boolean;
  headers: Record<string, string> | null;
  raw: unknown;
}

// ------------------------------------------------------------
// Normalizadores
// ------------------------------------------------------------

function normalizeQrCode(raw: unknown): EvolutionQrCode | null {
  if (!raw || typeof raw !== 'object') return null;
  const qr = raw as { base64?: unknown; code?: unknown; pairingCode?: unknown; count?: unknown };
  const base64 = typeof qr.base64 === 'string' ? qr.base64 : null;
  const code = typeof qr.code === 'string' ? qr.code : null;
  const pairingCode = typeof qr.pairingCode === 'string' ? qr.pairingCode : null;
  const count = typeof qr.count === 'number' ? qr.count : 0;

  if (!base64 && !code && !pairingCode) return null;
  return { base64, code, pairingCode, count };
}

function normalizeState(raw: unknown): EvolutionConnectionState {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'open') return 'open';
  if (value === 'close' || value === 'closed') return 'close';
  if (value === 'connecting') return 'connecting';
  return 'unknown';
}

function normalizeWebhook(raw: unknown): EvolutionWebhookConfig | null {
  if (!raw || typeof raw !== 'object') return null;

  // A 2.3.7 devolve o webhook direto; aceitamos também um envelope `{ webhook: ... }` por segurança.
  const candidate = (raw as { webhook?: unknown }).webhook;
  const webhook = (candidate && typeof candidate === 'object' ? candidate : raw) as Record<string, unknown>;

  if (!('enabled' in webhook) && !('url' in webhook)) return null;

  const headers =
    webhook.headers && typeof webhook.headers === 'object'
      ? Object.fromEntries(
          Object.entries(webhook.headers as Record<string, unknown>)
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => [key, value as string]),
        )
      : null;

  return {
    enabled: webhook.enabled === true,
    url: typeof webhook.url === 'string' ? webhook.url : null,
    events: Array.isArray(webhook.events)
      ? webhook.events.filter((event): event is string => typeof event === 'string')
      : [],
    byEvents: webhook.byEvents === true || webhook.webhookByEvents === true,
    base64: webhook.base64 === true || webhook.webhookBase64 === true,
    headers,
    raw,
  };
}

function assertInstanceName(name: string): string {
  const clean = (name ?? '').trim();
  if (!clean) {
    throw new EvolutionError('Nome da instância é obrigatório.', {
      code: 'INVALID_INPUT',
      status: 400,
      operation: 'instanceName',
    });
  }
  // A Evolution usa o nome em rota e no JID; nada de espaço, barra ou acento.
  if (!/^[A-Za-z0-9._-]+$/.test(clean)) {
    throw new EvolutionError(
      `Nome de instância inválido: "${clean}". Use apenas letras, números, ponto, hífen e underline.`,
      { code: 'INVALID_INPUT', status: 400, operation: 'instanceName' },
    );
  }
  return clean;
}

/** Corpo do `POST /webhook/set/{name}` (formato v2: tudo dentro de `webhook`). */
export function buildWebhookPayload(input: WebhookConfigInput) {
  const url = (input.url ?? '').trim();
  if (!url) {
    throw new EvolutionError('URL do webhook é obrigatória.', {
      code: 'INVALID_INPUT',
      status: 400,
      operation: 'setWebhook',
    });
  }

  const secret = (input.secret ?? '').trim();
  const events = input.events ?? EVOLUTION_WEBHOOK_EVENTS;

  return {
    webhook: {
      enabled: true,
      url,
      byEvents: input.byEvents ?? false,
      base64: input.base64 ?? false,
      events: [...events],
      // Cabeçalho secreto enviado pela própria Evolution em cada evento.
      ...(secret ? { headers: { 'x-evolution-webhook-secret': secret } } : {}),
    },
  };
}

// ------------------------------------------------------------
// Instância
// ------------------------------------------------------------

export async function createInstance(
  name: string,
  options: CreateInstanceOptions = {},
  context?: EvolutionLogContext,
): Promise<CreateInstanceResult> {
  const instanceName = assertInstanceName(name);

  const body: Record<string, unknown> = {
    instanceName,
    integration: options.integration ?? 'WHATSAPP-BAILEYS',
    qrcode: options.qrcode ?? true,
  };

  if (options.number) {
    const number = toEvolutionNumber(options.number);
    if (number) body.number = number;
  }

  const raw = await evolutionRequest<{
    instance?: { instanceName?: string; instanceId?: string; status?: string };
    hash?: string | { apikey?: string };
    qrcode?: unknown;
  }>({
    method: 'POST',
    path: '/instance/create',
    operation: 'createInstance',
    body,
    context,
    logMetadata: { instance: instanceName },
  });

  // O webhook é configurado em chamada separada: `create` com `webhook` no corpo não é validado
  // de forma confiável na 2.3.7 (e `setWebhook` é o mesmo caminho usado para reconfigurar).
  let webhookConfigured = false;
  if (options.webhookUrl) {
    await setWebhook(instanceName, options.webhookUrl, options.webhookSecret, context);
    webhookConfigured = true;
  }

  const apiKey =
    typeof raw.hash === 'string' ? raw.hash : typeof raw.hash?.apikey === 'string' ? raw.hash.apikey : null;

  return {
    instanceName: raw.instance?.instanceName ?? instanceName,
    instanceId: raw.instance?.instanceId ?? null,
    apiKey,
    status: raw.instance?.status ?? null,
    qrcode: normalizeQrCode(raw.qrcode),
    webhookConfigured,
    raw,
  };
}

/** QR Code novo (`GET /instance/connect/{name}`). TTL do QR na Evolution é curto (~40s). */
export async function connect(
  name: string,
  context?: EvolutionLogContext,
): Promise<EvolutionQrCode & { raw: unknown }> {
  const instanceName = assertInstanceName(name);

  const raw = await evolutionRequest<{
    base64?: unknown;
    code?: unknown;
    pairingCode?: unknown;
    count?: unknown;
  }>({
    method: 'GET',
    path: `/instance/connect/${encodeURIComponent(instanceName)}`,
    operation: 'connect',
    context,
    logMetadata: { instance: instanceName },
  });

  const qr = normalizeQrCode(raw);
  return {
    base64: qr?.base64 ?? null,
    code: qr?.code ?? null,
    pairingCode: qr?.pairingCode ?? null,
    count: qr?.count ?? 0,
    raw,
  };
}

export async function connectionState(
  name: string,
  context?: EvolutionLogContext,
): Promise<ConnectionStateResult> {
  const instanceName = assertInstanceName(name);

  const raw = await evolutionRequest<{ instance?: { instanceName?: string; state?: unknown } }>({
    method: 'GET',
    path: `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    operation: 'connectionState',
    context,
    logMetadata: { instance: instanceName },
    // Chamada de leitura (polling da tela de conexão): não registra sucesso.
    silentSuccess: true,
  });

  return {
    instanceName: raw.instance?.instanceName ?? instanceName,
    state: normalizeState(raw.instance?.state),
    raw,
  };
}

export async function fetchInstances(
  context?: EvolutionLogContext,
): Promise<EvolutionInstanceSummary[]> {
  const raw = await evolutionRequest<unknown>({
    method: 'GET',
    path: '/instance/fetchInstances',
    operation: 'fetchInstances',
    context,
    silentSuccess: true,
  });

  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const instance = (item ?? {}) as Record<string, unknown>;
    const asString = (value: unknown) => (typeof value === 'string' ? value : null);
    return {
      name: asString(instance.name),
      instanceName: asString(instance.instanceName),
      instanceId: asString(instance.instanceId),
      state: asString(instance.connectionStatus) ?? asString(instance.state),
      ownerJid: asString(instance.ownerJid),
      profileName: asString(instance.profileName),
      profilePicUrl: asString(instance.profilePicUrl),
      raw: item,
    };
  });
}

/** Procura a instância pelo nome (aceita `name` ou `instanceName` na resposta da Evolution). */
export async function findInstance(
  name: string,
  context?: EvolutionLogContext,
): Promise<EvolutionInstanceSummary | null> {
  const instanceName = assertInstanceName(name);
  const instances = await fetchInstances(context);
  return (
    instances.find(
      (instance) => instance.name === instanceName || instance.instanceName === instanceName,
    ) ?? null
  );
}

export async function restart(name: string, context?: EvolutionLogContext): Promise<unknown> {
  const instanceName = assertInstanceName(name);
  return evolutionRequest<unknown>({
    method: 'POST',
    path: `/instance/restart/${encodeURIComponent(instanceName)}`,
    operation: 'restart',
    context,
    logMetadata: { instance: instanceName },
  });
}

/** Desconecta o celular sem apagar a instância (dá para reconectar por QR). */
export async function logout(name: string, context?: EvolutionLogContext): Promise<unknown> {
  const instanceName = assertInstanceName(name);
  return evolutionRequest<unknown>({
    method: 'DELETE',
    path: `/instance/logout/${encodeURIComponent(instanceName)}`,
    operation: 'logout',
    context,
    logMetadata: { instance: instanceName },
  });
}

/** Remove a instância na Evolution (irreversível: exige novo QR para voltar). */
export async function deleteInstance(name: string, context?: EvolutionLogContext): Promise<unknown> {
  const instanceName = assertInstanceName(name);
  return evolutionRequest<unknown>({
    method: 'DELETE',
    path: `/instance/delete/${encodeURIComponent(instanceName)}`,
    operation: 'deleteInstance',
    context,
    logMetadata: { instance: instanceName },
  });
}

// ------------------------------------------------------------
// Webhook
// ------------------------------------------------------------

export async function setWebhook(
  name: string,
  url: string,
  secret?: string,
  context?: EvolutionLogContext,
): Promise<EvolutionWebhookConfig | null> {
  const instanceName = assertInstanceName(name);

  const raw = await evolutionRequest<unknown>({
    method: 'POST',
    path: `/webhook/set/${encodeURIComponent(instanceName)}`,
    operation: 'setWebhook',
    body: buildWebhookPayload({ url, secret }),
    context,
    logMetadata: { instance: instanceName },
  });

  return normalizeWebhook(raw);
}

export async function getWebhook(
  name: string,
  context?: EvolutionLogContext,
): Promise<EvolutionWebhookConfig | null> {
  const instanceName = assertInstanceName(name);
  const raw = await evolutionRequest<unknown>({
    method: 'GET',
    path: `/webhook/find/${encodeURIComponent(instanceName)}`,
    operation: 'getWebhook',
    context,
    logMetadata: { instance: instanceName },
    silentSuccess: true,
  });

  return normalizeWebhook(raw);
}

// ------------------------------------------------------------
// Envio de mensagem
// ------------------------------------------------------------

/**
 * Envia texto. Formato exigido pela v2.3.7: `{ number, text }` — texto **plano**.
 * (A OpenAPI oficial mostra `textMessage: { text }`, mas o validador real rejeita:
 * `400 instance requires property "text"`.)
 * O `number` sai mascarado no log; o texto **nunca** é registrado, só o tamanho.
 */
export async function sendText(
  name: string,
  number: string,
  text: string,
  context?: EvolutionLogContext,
): Promise<SendTextResult> {
  const instanceName = assertInstanceName(name);
  const normalizedNumber = toEvolutionNumber(number);
  const cleanText = (text ?? '').trim();

  if (!normalizedNumber) {
    throw new EvolutionError('Número do destinatário é obrigatório.', {
      code: 'INVALID_INPUT',
      status: 400,
      operation: 'sendText',
    });
  }
  if (!cleanText) {
    throw new EvolutionError('Texto da mensagem é obrigatório.', {
      code: 'INVALID_INPUT',
      status: 400,
      operation: 'sendText',
    });
  }

  const raw = await evolutionRequest<{ key?: { id?: unknown }; status?: unknown }>({
    method: 'POST',
    path: `/message/sendText/${encodeURIComponent(instanceName)}`,
    operation: 'sendText',
    body: {
      number: normalizedNumber,
      text: cleanText,
    },
    context,
    logMetadata: {
      instance: instanceName,
      number: maskPhone(normalizedNumber),
      textLength: cleanText.length,
    },
  });

  return {
    externalId: typeof raw.key?.id === 'string' ? raw.key.id : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    raw,
  };
}
