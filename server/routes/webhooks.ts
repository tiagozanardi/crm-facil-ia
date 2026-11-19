/**
 * Webhook público da Evolution API — Fase 11 / Onda 1 / S3.
 *
 * `POST /api/webhooks/evolution` recebe os eventos que a Evolution dispara para a URL pública do
 * CRM (`APP_PUBLIC_URL` + `/api/webhooks/evolution`) e os traduz para o banco do CRM:
 *
 *  - `MESSAGES_UPSERT`   → Lead + Conversation + Message (`CLIENT`, ou `AGENT` quando `fromMe`).
 *  - `CONNECTION_UPDATE` → `WhatsAppInstance.status` + `lastSeenAt` (e telefone quando `open`).
 *  - `QRCODE_UPDATED`    → cache do QR (`qrcode.base64`) + status `CONNECTING`.
 *  - `MESSAGES_UPDATE`   → ticks de entrega/leitura em `Message` (casando por `externalId`).
 *
 * Princípios deste módulo (S3):
 *
 * 1. **Autenticação primeiro**: exige `x-evolution-webhook-secret` igual a
 *    `EVOLUTION_WEBHOOK_SECRET` (comparação timing-safe). Sem o segredo configurado no servidor a
 *    rota falha **fechada** (503) em vez de aceitar qualquer POST.
 * 2. **Fail-closed**: se o payload não tiver os campos que sabemos interpretar, o evento é
 *    **descartado com motivo** no `DevLog` — nunca gravamos mensagem sem `externalId` (isso geraria
 *    duplicatas) nem lead com telefone inventado.
 * 3. **Idempotência**: `Message.externalId` é único; reentrega do mesmo evento responde 200 sem
 *    duplicar nada.
 * 4. **Resposta rápida**: a rota sempre responde JSON curto; nada de esperar a IA (a orquestração
 *    automática é a Onda 2 / S6).
 *
 * A feature flag `EVOLUTION_ENABLED` **não** bloqueia o recebimento: ela só vale para o envio (S4).
 * Sem ela, o CRM já registra o que chega, o que é exatamente o objetivo desta fatia.
 *
 * Nada aqui altera o schema (Onda 1 já criou `WhatsAppInstance`, `Message.externalId/status/error`
 * e `Lead.phoneE164`).
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Response } from 'express';
import {
  AIStatus,
  LeadStage,
  MessageSender,
  MessageStatus,
  WhatsAppStatus,
  type Prisma,
  type WhatsAppInstance,
} from '@prisma/client';
import { prisma } from '../db.js';
import { maskPhone } from '../services/evolution.js';
import { ensureConversationForLead, pauseAIForLead } from '../services/leadState.js';

export const webhooksRouter = Router();

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

const WEBHOOK_HEADER = 'x-evolution-webhook-secret';
/** Limite defensivo: mensagens de texto do WhatsApp são bem menores que isso. */
const MAX_TEXT_LENGTH = 8_000;
/** QR em base64 tem ~13 KB; 200 KB é teto de segurança para payload abusivo. */
const MAX_QR_LENGTH = 200_000;
const MAX_LOG_TEXT = 400;
const DEFAULT_PAUSE_HOURS = 24;

/** Mesmos códigos tratados em `whatsapp.ts` (pooler do Supabase indisponível). */
const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

// ------------------------------------------------------------
// Utilidades de payload (tolerantes por design: o contrato ainda não foi
// validado com um payload real da Evolution — ver brief do S3)
// ------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

/** String aparada; `null` quando vazia/ausente (evita gravar mensagem em branco). */
function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** `data` pode vir como objeto (upsert/connection/qr) ou array (messages.update). */
function toItems(data: unknown): JsonRecord[] {
  if (Array.isArray(data)) {
    return data
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null);
  }
  const single = asRecord(data);
  return single ? [single] : [];
}

/** `messages.upsert` (contrato) e `MESSAGES_UPSERT` (alguns clientes) viram a mesma chave. */
function normalizeEventName(raw: string | null): string {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s.\-:/]+/g, '_');
}

/** Compara o segredo em tempo constante (hash antes para não vazar o tamanho). */
function secretsMatch(received: string, expected: string): boolean {
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ------------------------------------------------------------
// Telefone / JID
// ------------------------------------------------------------

type JidKind = 'person' | 'group' | 'broadcast' | 'newsletter' | 'lid' | 'invalid' | 'missing';

const JID_DOMAINS: Record<string, JidKind> = {
  's.whatsapp.net': 'person',
  'g.us': 'group',
  broadcast: 'broadcast',
  newsletter: 'newsletter',
  lid: 'lid',
};

function classifyJid(jid: string): JidKind {
  const value = jid.trim();
  if (!value) return 'missing';
  const domain = value.split('@')[1]?.toLowerCase() ?? '';
  return JID_DOMAINS[domain] ?? 'invalid';
}

/** `5598988451290:12@s.whatsapp.net` → `5598988451290` (só dígitos, com DDI). */
function parsePersonE164(jid: string): string | null {
  const userPart = jid.split('@')[0] ?? '';
  const digits = userPart.split(':')[0]?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  // Celular/fixo brasileiro sem DDI: assume 55 (mesma regra do backfill).
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Já com DDI (13 dígitos no Brasil, 12–15 no geral): mantém.
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

/** `5598988451290` → `(98) 98845-1290` (formato usado no seed e no chat). */
function formatPhoneBR(e164: string): string {
  const digits = (e164 ?? '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 10) return digits ? `+${digits}` : '';

  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const formatted = rest.length >= 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${formatted}`;
}

/** Só o domínio do JID vai para o log — nunca o telefone completo. */
function describeJid(jid: string | null): string {
  if (!jid) return 'missing';
  const domain = jid.split('@')[1];
  return domain ? `*@${domain}` : '*';
}

interface ChatJidInfo {
  kind: JidKind;
  e164: string | null;
  raw: string | null;
}

/**
 * Resolve o JID da conversa. O `remoteJid` pode vir como `@lid` (novo identificador do WhatsApp);
 * nesse caso tentamos os campos alternativos que a Evolution costuma incluir antes de desistir.
 */
function resolveChatJid(item: JsonRecord): ChatJidInfo {
  const key = asRecord(item.key);
  const primary = asString(key?.remoteJid) ?? asString(item.remoteJid);
  const alternates = [
    asString(key?.remoteJidAlt),
    asString(item.remoteJidAlt),
    asString(item.senderPn),
    asString(item.participantPn),
  ].filter((candidate): candidate is string => Boolean(candidate));

  if (primary) {
    const kind = classifyJid(primary);
    if (kind === 'person') return { kind, e164: parsePersonE164(primary), raw: primary };
    if (kind !== 'lid' && kind !== 'invalid') return { kind, e164: null, raw: primary };
  }

  for (const candidate of alternates) {
    if (classifyJid(candidate) === 'person') {
      return { kind: 'person', e164: parsePersonE164(candidate), raw: candidate };
    }
  }

  if (!primary) return { kind: 'missing', e164: null, raw: null };
  return { kind: classifyJid(primary), e164: null, raw: primary };
}

function parseOwnerPhone(item: JsonRecord): string | null {
  const user = asRecord(item.user);
  const candidates = [
    asString(item.wuid),
    asString(item.ownerJid),
    asString(item.user),
    asString(user?.id),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (classifyJid(candidate) !== 'person') continue;
    const e164 = parsePersonE164(candidate);
    if (e164) return e164;
  }
  return null;
}

// ------------------------------------------------------------
// Mensagem: texto e timestamp
// ------------------------------------------------------------

/** Envelopes que embrulham a mensagem real (mensagens efêmeras, "ver uma vez", edição). */
const MESSAGE_WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
] as const;

function unwrapMessage(raw: unknown): JsonRecord | null {
  let message = asRecord(raw);
  for (let depth = 0; message && depth < 4; depth += 1) {
    let nested: JsonRecord | null = null;
    for (const wrapper of MESSAGE_WRAPPERS) {
      const holder = asRecord(message[wrapper]);
      if (!holder) continue;
      nested = asRecord(holder.message) ?? holder;
      break;
    }
    if (!nested) break;
    message = nested;
  }
  return message;
}

/**
 * Só texto no MVP (D5). Aceita `conversation` e `extendedTextMessage.text` — os dois formatos do
 * contrato do S3 — e devolve o tipo recebido quando não há texto, para o `DevLog` explicar o motivo.
 */
function extractText(raw: unknown): { text: string | null; kind: string } {
  const message = unwrapMessage(raw);
  if (!message) return { text: null, kind: 'empty' };

  const conversation = asString(message.conversation);
  if (conversation) return { text: conversation, kind: 'conversation' };

  const extended = asRecord(message.extendedTextMessage);
  const extendedText = asString(extended?.text);
  if (extendedText) return { text: extendedText, kind: 'extendedTextMessage' };

  const kind = Object.keys(message).find((key) => key !== 'messageContextInfo') ?? 'unknown';
  return { text: null, kind };
}

/** `messageTimestamp` vem em segundos; aceita ms por segurança e ignora datas no futuro. */
function messageDate(timestamp: number | null): Date {
  if (!timestamp) return new Date();
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return new Date();
  const now = Date.now();
  if (date.getTime() > now + 5 * 60 * 1000) return new Date(now);
  return date;
}

// ------------------------------------------------------------
// Enums
// ------------------------------------------------------------

function toPrismaWhatsAppStatus(state: string | null): WhatsAppStatus | null {
  switch ((state ?? '').toLowerCase()) {
    case 'open':
      return WhatsAppStatus.CONNECTED;
    case 'connecting':
      return WhatsAppStatus.CONNECTING;
    case 'close':
    case 'closed':
      return WhatsAppStatus.DISCONNECTED;
    default:
      return null;
  }
}

/**
 * Status de mensagem da Evolution/Baileys → enum do CRM.
 * (`SERVER_ACK` = chegou no servidor, `DELIVERY_ACK` = entregue, `PLAYED` = áudio ouvido.)
 */
function mapMessageStatus(raw: string | null): MessageStatus | null {
  switch ((raw ?? '').toUpperCase()) {
    case 'PENDING':
      return MessageStatus.PENDING;
    case 'SERVER_ACK':
      return MessageStatus.SENT;
    case 'DELIVERY_ACK':
    case 'DELIVERED':
      return MessageStatus.DELIVERED;
    case 'READ':
    case 'PLAYED':
      return MessageStatus.READ;
    case 'ERROR':
    case 'FAILED':
      return MessageStatus.FAILED;
    default:
      return null;
  }
}

// ------------------------------------------------------------
// Erros / DevLog
// ------------------------------------------------------------

function isDatabaseUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code);
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

interface WebhookLogInput {
  storeId: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  latencyMs: number;
  metadata: Record<string, unknown>;
}

/**
 * Um evento = um `DevLog` (`service = EVOLUTION_API`). Aqui aguardamos a gravação (uma linha, ~10 ms)
 * porque o log é a principal evidência de que o webhook está saudável na Área Dev — mas falha de log
 * nunca derruba a resposta.
 */
async function logWebhook(input: WebhookLogInput): Promise<void> {
  try {
    await prisma.devLog.create({
      data: {
        storeId: input.storeId,
        level: input.level,
        service: 'EVOLUTION_API',
        message: input.message.slice(0, MAX_LOG_TEXT),
        latencyMs: input.latencyMs,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Log é observabilidade, não caminho crítico.
  }
}

// ------------------------------------------------------------
// Processamento dos eventos
// ------------------------------------------------------------

interface EventOutcome {
  processed: number;
  duplicates: number;
  ignored: string[];
  /** Quantas mensagens `fromMe` pausaram a IA (intervenção humana pelo celular). */
  interventions: number;
  /** Diagnóstico de payload (nomes de campos, nunca conteúdo) para o próximo ajuste. */
  diagnostics: Record<string, unknown>[];
}

function emptyOutcome(): EventOutcome {
  return { processed: 0, duplicates: 0, ignored: [], interventions: 0, diagnostics: [] };
}

interface ClientMessageInput {
  storeId: string;
  phoneE164: string;
  externalId: string;
  text: string;
  pushName: string | null;
  createdAt: Date;
}

interface ClientMessageResult {
  status: 'created' | 'duplicate';
  leadId?: string;
  conversationId?: string;
}

/**
 * Grava um lote `Lead + Conversation + Message(CLIENT)` em transação.
 *
 * O lead é localizado por `(storeId, phoneE164)`; se não existir nasce em `NOVO` com a IA ativa.
 * A mensagem tem `externalId` único — condição de corrida entre entregas vira "duplicada", nunca
 * erro 500.
 */
async function recordClientMessage(
  input: ClientMessageInput,
  attempt = 0,
): Promise<ClientMessageResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Rechecagem dentro da transação: cobre duas entregas simultâneas do mesmo evento.
      const alreadyStored = await tx.message.findUnique({
        where: { externalId: input.externalId },
        select: { id: true },
      });
      if (alreadyStored) return { status: 'duplicate' as const };

      const phoneLabel = formatPhoneBR(input.phoneE164);

      let lead = await tx.lead.findUnique({
        where: { storeId_phoneE164: { storeId: input.storeId, phoneE164: input.phoneE164 } },
      });

      if (lead) {
        lead = await tx.lead.update({
          where: { id: lead.id },
          data: {
            lastInteraction: input.createdAt,
            unreadCount: { increment: 1 },
          },
        });
      } else {
        lead = await tx.lead.create({
          data: {
            storeId: input.storeId,
            name: input.pushName ?? phoneLabel,
            phone: phoneLabel,
            phoneE164: input.phoneE164,
            stage: LeadStage.NOVO,
            aiStatus: AIStatus.ACTIVE,
            lastInteraction: input.createdAt,
            unreadCount: 1,
          },
        });
      }

      const conversation = await tx.conversation.upsert({
        where: { leadId: lead.id },
        update: {
          lastMessage: input.text,
          lastMessageAt: input.createdAt,
        },
        create: {
          storeId: input.storeId,
          leadId: lead.id,
          phone: lead.phone,
          leadName: lead.name,
          stage: lead.stage,
          aiStatus: lead.aiStatus,
          pausedUntil: lead.pausedUntil,
          lastMessage: input.text,
          lastMessageAt: input.createdAt,
        },
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          sender: MessageSender.CLIENT,
          text: input.text,
          externalId: input.externalId,
          status: MessageStatus.SENT,
          delivered: true,
          read: false,
          createdAt: input.createdAt,
        },
      });

      return { status: 'created' as const, leadId: lead.id, conversationId: conversation.id };
    });
  } catch (error) {
    // Corrida no unique de `externalId` (duplicata) ou em `(storeId, phoneE164)` (lead criado em
    // paralelo). Uma segunda tentativa resolve o segundo caso sem mascarar erro de verdade.
    if (isUniqueViolation(error) && attempt === 0) {
      const alreadyStored = await prisma.message.findUnique({
        where: { externalId: input.externalId },
        select: { id: true },
      });
      if (alreadyStored) return { status: 'duplicate' };
      return recordClientMessage(input, attempt + 1);
    }
    throw error;
  }
}

interface AgentMessageResult {
  status: 'recorded' | 'ignored';
  reason?: string;
}

/**
 * Mensagem `fromMe` (humano respondeu pelo celular): grava como `AGENT` e pausa a IA pela mesma
 * regra do chat (`interventionPauseHours`).
 *
 * A mensagem é gravada antes da pausa: perder o registro é pior do que uma pausa que falhou — e a
 * falha da pausa vira `DevLog ERROR` em vez de derrubar o webhook (o evento já está persistido).
 */
async function recordAgentMessage(input: ClientMessageInput): Promise<AgentMessageResult> {
  const lead = await prisma.lead.findUnique({
    where: { storeId_phoneE164: { storeId: input.storeId, phoneE164: input.phoneE164 } },
    select: { id: true },
  });

  // Contato desconhecido: não criamos lead a partir de uma mensagem de saída (evita poluir o funil).
  if (!lead) return { status: 'ignored', reason: 'fromme-unknown-contact' };

  const conversation = await ensureConversationForLead(lead.id);

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.AGENT,
        text: input.text,
        externalId: input.externalId,
        status: MessageStatus.SENT,
        delivered: true,
        read: true,
        createdAt: input.createdAt,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: input.text, lastMessageAt: input.createdAt },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { lastInteraction: input.createdAt },
    }),
  ]);

  const store = await prisma.store.findUnique({
    where: { id: input.storeId },
    select: { interventionPauseHours: true },
  });
  const hours = store?.interventionPauseHours ?? DEFAULT_PAUSE_HOURS;

  try {
    await pauseAIForLead(lead.id, hours);

    // Espelha o log que o chat já grava quando um atendente responde pelo CRM.
    await prisma.devLog.create({
      data: {
        storeId: input.storeId,
        level: 'INFO',
        service: 'CRM_WEBHOOK',
        message: `Intervenção humana pelo WhatsApp: ${conversation.leadName} respondeu pelo celular. IA pausada por ${hours}h.`,
        metadata: {
          leadId: lead.id,
          conversationId: conversation.id,
          externalId: input.externalId,
          origin: 'whatsapp-fromMe',
        },
      },
    });
  } catch (error) {
    await logWebhook({
      storeId: input.storeId,
      level: 'ERROR',
      message: `Webhook Evolution · falha ao pausar a IA após mensagem fromMe: ${
        error instanceof Error ? error.message : String(error)
      }`,
      latencyMs: 0,
      metadata: { leadId: lead.id, externalId: input.externalId },
    });
  }

  return { status: 'recorded' };
}

async function handleMessagesUpsert(
  instance: WhatsAppInstance,
  data: unknown,
): Promise<EventOutcome> {
  const outcome = emptyOutcome();

  for (const item of toItems(data)) {
    try {
      const key = asRecord(item.key) ?? asRecord(asRecord(item.message)?.key);
      const fromMe = key?.fromMe === true;
      const jid = resolveChatJid(item);

      if (jid.kind === 'group') {
        outcome.ignored.push('group');
        continue;
      }
      if (jid.kind === 'broadcast') {
        outcome.ignored.push('broadcast');
        continue;
      }
      if (jid.kind === 'newsletter') {
        outcome.ignored.push('newsletter');
        continue;
      }
      if (jid.kind === 'lid') {
        outcome.ignored.push('lid-jid');
        outcome.diagnostics.push({ reason: 'lid-jid', jid: describeJid(jid.raw) });
        continue;
      }
      if (!jid.e164) {
        outcome.ignored.push('invalid-phone');
        outcome.diagnostics.push({ reason: 'invalid-phone', jid: describeJid(jid.raw) });
        continue;
      }

      // Sem `externalId` não há dedupe: gravar geraria duplicata em cada reentrega. Descarta.
      const externalId = asString(key?.id) ?? asString(item.id);
      if (!externalId) {
        outcome.ignored.push('missing-external-id');
        outcome.diagnostics.push({ reason: 'missing-external-id', fromMe, jid: describeJid(jid.raw) });
        continue;
      }

      const alreadyStored = await prisma.message.findUnique({
        where: { externalId },
        select: { id: true },
      });
      if (alreadyStored) {
        outcome.duplicates += 1;
        continue;
      }

      const { text, kind } = extractText(item.message);
      if (!text) {
        const unwrapped = unwrapMessage(item.message);
        outcome.ignored.push(kind === 'unknown' ? 'no-text' : `unsupported:${kind}`);
        outcome.diagnostics.push({
          reason: 'no-text',
          messageType: asString(item.messageType),
          messageKeys: unwrapped ? Object.keys(unwrapped).slice(0, 8) : [],
          fromMe,
        });
        continue;
      }
      if (text.length > MAX_TEXT_LENGTH) {
        outcome.ignored.push('text-too-long');
        continue;
      }

      const pushName = asString(item.pushName) ?? asString(item.notifyName);
      const baseInput = {
        storeId: instance.storeId,
        phoneE164: jid.e164,
        externalId,
        text,
        pushName,
        createdAt: messageDate(asNumber(item.messageTimestamp)),
      };

      if (fromMe) {
        const result = await recordAgentMessage(baseInput);
        if (result.status === 'ignored') {
          outcome.ignored.push(result.reason ?? 'agent-ignored');
          continue;
        }
        outcome.processed += 1;
        outcome.interventions += 1;
        continue;
      }

      const result = await recordClientMessage(baseInput);
      if (result.status === 'duplicate') {
        outcome.duplicates += 1;
        continue;
      }
      outcome.processed += 1;
    } catch (error) {
      // Banco fora do ar não é "payload estranho": sobe como 503 para a Evolution reentregar.
      if (isDatabaseUnavailable(error)) throw error;

      outcome.ignored.push('processing-error');
      outcome.diagnostics.push({
        reason: 'processing-error',
        error: error instanceof Error ? error.message.slice(0, MAX_LOG_TEXT) : 'erro desconhecido',
      });
    }
  }

  return outcome;
}

async function handleConnectionUpdate(
  instance: WhatsAppInstance,
  data: unknown,
): Promise<EventOutcome> {
  const outcome = emptyOutcome();

  for (const item of toItems(data)) {
    const state = asString(item.state) ?? asString(item.connection);
    const status = toPrismaWhatsAppStatus(state);

    if (!status) {
      outcome.ignored.push('unknown-state');
      outcome.diagnostics.push({ reason: 'unknown-state', keys: Object.keys(item).slice(0, 8) });
      continue;
    }

    const phone = parseOwnerPhone(item);
    const connected = status === WhatsAppStatus.CONNECTED;

    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status,
        lastSeenAt: new Date(),
        // Ao abrir/fechar a sessão o QR em cache deixa de valer.
        ...(connected || status === WhatsAppStatus.DISCONNECTED
          ? { qrCodeBase64: null, qrUpdatedAt: null }
          : {}),
        ...(connected && phone ? { phoneNumber: phone } : {}),
      },
    });

    outcome.processed += 1;
    outcome.diagnostics.push({
      state: state ?? null,
      ...(phone ? { phone: maskPhone(phone) } : {}),
    });
  }

  return outcome;
}

async function handleQrCodeUpdate(
  instance: WhatsAppInstance,
  data: unknown,
): Promise<EventOutcome> {
  const outcome = emptyOutcome();

  for (const item of toItems(data)) {
    const qr = asRecord(item.qrcode) ?? item;
    const base64 = asString(qr.base64);

    if (!base64) {
      outcome.ignored.push('qr-without-base64');
      outcome.diagnostics.push({ reason: 'qr-without-base64', keys: Object.keys(item).slice(0, 8) });
      continue;
    }
    if (base64.length > MAX_QR_LENGTH) {
      outcome.ignored.push('qr-too-large');
      continue;
    }

    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        qrCodeBase64: base64,
        qrUpdatedAt: new Date(),
        // Não rebaixa uma sessão já conectada por causa de um QR atrasado.
        ...(instance.status === WhatsAppStatus.CONNECTED ? {} : { status: WhatsAppStatus.CONNECTING }),
      },
    });

    outcome.processed += 1;
  }

  return outcome;
}

async function handleMessagesUpdate(
  instance: WhatsAppInstance,
  data: unknown,
): Promise<EventOutcome> {
  const outcome = emptyOutcome();

  for (const item of toItems(data)) {
    const key = asRecord(item.key);
    const externalId = asString(key?.id) ?? asString(item.id);
    if (!externalId) {
      outcome.ignored.push('missing-external-id');
      continue;
    }

    const status = mapMessageStatus(asString(item.status));
    if (!status) {
      outcome.ignored.push('unknown-status');
      continue;
    }

    const updated = await prisma.message.updateMany({
      where: { externalId },
      data: {
        status,
        ...(status === MessageStatus.DELIVERED || status === MessageStatus.READ
          ? { delivered: true }
          : {}),
        ...(status === MessageStatus.READ ? { read: true } : {}),
      },
    });

    if (updated.count > 0) outcome.processed += 1;
    else outcome.ignored.push('unknown-message');
  }

  return outcome;
}

/** Despacha o evento; `null` = evento que não tratamos (responde 200 sem gravar nada). */
async function routeEvent(
  instance: WhatsAppInstance,
  event: string,
  data: unknown,
): Promise<EventOutcome | null> {
  switch (event) {
    case 'MESSAGES_UPSERT':
      return handleMessagesUpsert(instance, data);
    case 'MESSAGES_UPDATE':
      return handleMessagesUpdate(instance, data);
    case 'CONNECTION_UPDATE':
      return handleConnectionUpdate(instance, data);
    case 'QRCODE_UPDATED':
      return handleQrCodeUpdate(instance, data);
    default:
      return null;
  }
}

function summarize(event: string, outcome: EventOutcome): string {
  const parts = [`${outcome.processed} processado(s)`];
  if (outcome.duplicates > 0) parts.push(`${outcome.duplicates} duplicado(s)`);
  if (outcome.ignored.length > 0) parts.push(`${outcome.ignored.length} ignorado(s)`);
  if (outcome.interventions > 0) parts.push(`${outcome.interventions} intervenção(ões) humana(s)`);
  return `Webhook Evolution · ${event}: ${parts.join(', ')}.`;
}

function uniqueReasons(outcome: EventOutcome): string[] {
  return [...new Set(outcome.ignored)].slice(0, 10);
}

// ------------------------------------------------------------
// Respostas de erro
// ------------------------------------------------------------

async function sendWebhookError(
  res: Response,
  error: unknown,
  event: string,
  startedAt: number,
  storeId: string | null,
): Promise<Response> {
  const code = (error as { code?: unknown } | null)?.code;
  const databaseUnavailable = typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code);
  const message = error instanceof Error ? error.message : String(error);

  if (storeId) {
    // Aguardado de propósito: erro é raro e o log é a evidência que fica na Área Dev.
    await logWebhook({
      storeId,
      level: 'ERROR',
      message: `Webhook Evolution · ${event} falhou: ${message}`,
      latencyMs: Date.now() - startedAt,
      metadata: {
        event,
        code: typeof code === 'string' ? code : null,
        databaseUnavailable,
      },
    });
  } else {
    console.error(`[webhook] ${event} falhou antes de resolver a loja:`, message);
  }

  if (databaseUnavailable) {
    return res.status(503).json({
      error: 'Banco de dados indisponível no momento. A Evolution pode reentregar o evento.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  return res.status(500).json({
    error: 'Falha ao processar o webhook da Evolution.',
    code: 'WEBHOOK_ERROR',
  });
}

// ------------------------------------------------------------
// POST /api/webhooks/evolution
// ------------------------------------------------------------

webhooksRouter.post('/evolution', async (req, res) => {
  const startedAt = Date.now();
  const expectedSecret = (process.env.EVOLUTION_WEBHOOK_SECRET ?? '').trim();

  // Sem segredo configurado não há como validar: falhar fechado (503) em vez de aceitar tudo.
  if (!expectedSecret) {
    return res.status(503).json({
      error:
        'Webhook não configurado: defina EVOLUTION_WEBHOOK_SECRET para validar os eventos da Evolution.',
      code: 'WEBHOOK_NOT_CONFIGURED',
    });
  }

  const receivedSecret = (req.get(WEBHOOK_HEADER) ?? '').trim();
  if (!receivedSecret || !secretsMatch(receivedSecret, expectedSecret)) {
    return res.status(401).json({
      error: 'Segredo do webhook inválido.',
      code: 'INVALID_WEBHOOK_SECRET',
    });
  }

  const body = asRecord(req.body);
  if (!body) {
    return res.status(400).json({
      error: 'Payload inválido: envie um objeto JSON.',
      code: 'INVALID_PAYLOAD',
    });
  }

  const event = normalizeEventName(asString(body.event) ?? asString(body.type));
  if (!event) {
    return res.status(400).json({
      error: 'Payload inválido: campo "event" ausente.',
      code: 'INVALID_PAYLOAD',
    });
  }

  const instanceName =
    asString(body.instance) ??
    asString(body.instanceName) ??
    asString(asRecord(body.data)?.instance);

  if (!instanceName) {
    // Sem instância não há loja — responde 200 para não gerar tempestade de retentativas.
    return res.status(200).json({ ok: true, event, ignored: ['missing-instance'] });
  }

  let instance: WhatsAppInstance | null;
  try {
    instance = await prisma.whatsAppInstance.findUnique({ where: { instanceName } });
  } catch (error) {
    return sendWebhookError(res, error, event, startedAt, null);
  }

  if (!instance) {
    console.warn(`[webhook] evento ${event} de instância desconhecida: ${instanceName}`);
    return res.status(200).json({ ok: true, event, ignored: ['unknown-instance'] });
  }

  try {
    const data = body.data ?? body;
    const outcome = await routeEvent(instance, event, data);

    if (!outcome) {
      return res.status(200).json({ ok: true, event, ignored: ['unsupported-event'] });
    }

    await logWebhook({
      storeId: instance.storeId,
      level: outcome.processed > 0 || outcome.duplicates > 0 ? 'INFO' : 'WARN',
      message: summarize(event, outcome),
      latencyMs: Date.now() - startedAt,
      metadata: {
        event,
        instance: instance.instanceName,
        processed: outcome.processed,
        duplicates: outcome.duplicates,
        ignored: uniqueReasons(outcome),
        ...(outcome.interventions > 0 ? { interventions: outcome.interventions } : {}),
        ...(outcome.diagnostics.length > 0 ? { diagnostics: outcome.diagnostics.slice(0, 3) } : {}),
      },
    });

    return res.status(200).json({
      ok: true,
      event,
      instance: instance.instanceName,
      processed: outcome.processed,
      duplicates: outcome.duplicates,
      ignored: uniqueReasons(outcome),
      ...(outcome.interventions > 0 ? { interventions: outcome.interventions } : {}),
    });
  } catch (error) {
    return sendWebhookError(res, error, event, startedAt, instance.storeId);
  }
});

/**
 * `GET` existe só para conferir, pelo navegador/curl, que a rota subiu no deploy.
 * A Evolution usa exclusivamente `POST`.
 */
webhooksRouter.get('/evolution', (_req, res) => {
  res.status(405).json({
    error: 'Use POST para enviar eventos da Evolution API.',
    code: 'METHOD_NOT_ALLOWED',
    secretConfigured: Boolean((process.env.EVOLUTION_WEBHOOK_SECRET ?? '').trim()),
  });
});
