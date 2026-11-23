/**
 * Envio real para o WhatsApp (Fase 11 / Onda 1 / S4) e auto-resposta do Modo Teste (Onda 1.5).
 *
 * Este módulo é o único lugar que **envia mensagens** pela Evolution API:
 *
 *  - `deliverOutboundMessage`: grava o resultado do envio na `Message` (SENT + `externalId`, ou
 *    FAILED + `error`) e cobre o caso de a instância estar desconectada. Antes de enviar confere
 *    o estado real da conexão (`connectionState`): o S1 verificou que `sendText` numa instância
 *    desconectada **não falha rápido** — fica esperando e estoura o timeout do cliente.
 *  - `maybeAutoReplyToTestNumber`: gera a resposta da IA e envia, **somente** para números do
 *    modo teste. Relê a última mensagem depois de um debounce (mensagens picadas geram uma única
 *    resposta) e respeita a pausa de intervenção humana.
 *  - `tryAdoptOutboundEcho`: resolve a corrida do eco. O `MESSAGES_UPSERT` de `fromMe` pode chegar
 *    **antes** de o envio guardar o `externalId`; nesse caso o webhook adota a mensagem `PENDING`
 *    recente (mesmo texto) em vez de criar um `AGENT` duplicado e pausar a IA por 24h.
 *
 * Nada aqui altera o schema nem guarda conteúdo de mensagem no `DevLog`.
 */

import {
  AIStatus,
  MessageSender,
  MessageStatus,
  WhatsAppStatus,
  type Prisma,
  type WhatsAppInstance,
} from '@prisma/client';
import { prisma } from '../db.js';
import { assertApiKeyConfigured, generateAIReply, MissingApiKeyError } from './ai.js';
import {
  connectionState,
  isEvolutionEnabled,
  maskPhone,
  sendText,
} from './evolution.js';
import { resumeAIForLead } from './leadState.js';

/** Limite de texto aceito pelo WhatsApp (o modelo já responde muito abaixo disso). */
const MAX_MESSAGE_TEXT = 4_000;
const MAX_ERROR_TEXT = 400;
/** Janela para casar o eco `fromMe` com uma mensagem `PENDING` recém-enviada pelo CRM. */
const ECHO_WINDOW_MS = 3 * 60_000;
/** Debounce máximo dentro do webhook (Vercel): o S6/Onda 2 deve mover isso para uma fila. */
const MAX_DEBOUNCE_MS = 2_000;
/**
 * A checagem ao vivo da Evolution custa ~1–4 s. Enquanto o banco diz `CONNECTED` e o último
 * evento de conexão é recente, confiamos no estado do banco (o webhook atualiza `lastSeenAt` em
 * `CONNECTION_UPDATE`). Sem isso, o webhook ficaria lento demais para o limite da Vercel.
 */
const TRUST_DB_STATE_MS = 2 * 60_000;
const HISTORY_LIMIT = 14;

export interface OutboundDelivery {
  /** `false` quando o envio nem foi tentado (flag desligada, sem número, sem conexão...). */
  attempted: boolean;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  /** Motivo do SKIPPED (ex.: `sending-disabled`, `whatsapp-connecting`, `no-phone`). */
  reason?: string;
  externalId?: string | null;
  error?: string;
}

export type FlowLogLevel = 'INFO' | 'WARN' | 'ERROR';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_TEXT);
}

/** Uma linha por decisão do fluxo. Nunca derruba o envio (observabilidade, não caminho crítico). */
async function logFlow(
  storeId: string,
  level: FlowLogLevel,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.devLog.create({
      data: {
        storeId,
        level,
        service: 'CRM_WEBHOOK',
        message: message.slice(0, MAX_ERROR_TEXT),
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Log técnico não pode derrubar o atendimento.
  }
}

// ------------------------------------------------------------
// Conexão
// ------------------------------------------------------------

/**
 * Confere se dá para enviar agora. A checagem é **ao vivo** quando o banco diz `CONNECTED`,
 * para não pagar o timeout de 15s do `sendText` numa sessão que caiu.
 */
async function ensureConnected(
  instance: WhatsAppInstance | null,
  storeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!instance) return { ok: false, reason: 'no-instance' };
  if (instance.status !== WhatsAppStatus.CONNECTED) {
    return { ok: false, reason: `whatsapp-${instance.status.toLowerCase()}` };
  }

  // Estado do banco recente (atualizado por `CONNECTION_UPDATE`) é confiável o bastante.
  const lastSeen = instance.lastSeenAt?.getTime() ?? 0;
  if (lastSeen > 0 && Date.now() - lastSeen < TRUST_DB_STATE_MS) {
    return { ok: true };
  }

  try {
    const { state } = await connectionState(instance.instanceName, {
      storeId,
      source: 'Envio WhatsApp',
    });
    if (state === 'open') return { ok: true };

    // Sincroniza o banco com o estado real; a tela de conexão também se beneficia.
    await prisma.whatsAppInstance
      .updateMany({
        where: { id: instance.id },
        data: {
          status:
            state === 'connecting' ? WhatsAppStatus.CONNECTING : WhatsAppStatus.DISCONNECTED,
          lastSeenAt: new Date(),
        },
      })
      .catch(() => {});

    return { ok: false, reason: `evolution-${state}` };
  } catch (error) {
    // Evolution fora do ar: falhar rápido em vez de esperar o timeout do `sendText`.
    await logFlow(storeId, 'WARN', 'Envio cancelado: não foi possível confirmar a conexão com a Evolution.', {
      reason: 'evolution-unreachable',
      error: errorText(error),
    });
    return { ok: false, reason: 'evolution-unreachable' };
  }
}

// ------------------------------------------------------------
// Marcações na Message
// ------------------------------------------------------------

async function markSent(messageId: string | undefined, externalId: string | null): Promise<void> {
  if (!messageId) return;

  try {
    if (externalId) {
      // Só grava o `externalId` se o eco do webhook ainda não o tiver adotado (evita P2002).
      await prisma.message.updateMany({
        where: { id: messageId, externalId: null },
        data: { status: MessageStatus.SENT, delivered: true, externalId },
      });
    }
    // Cobre também o caso em que o eco já marcou SENT: fica idempotente.
    await prisma.message.updateMany({
      where: { id: messageId, status: MessageStatus.PENDING },
      data: { status: MessageStatus.SENT, delivered: true },
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === 'P2002') {
      // O eco virou uma linha separada (texto diferente, por exemplo): não há o que corrigir aqui.
      await prisma.message
        .updateMany({
          where: { id: messageId },
          data: { status: MessageStatus.SENT, delivered: true },
        })
        .catch(() => {});
      return;
    }
    // Falha de banco não pode desfazer um envio que já saiu: a mensagem foi entregue de verdade.
    console.error('[whatsappFlow] falha ao marcar mensagem como SENT:', error);
  }
}

async function markFailed(messageId: string | undefined, error: string): Promise<void> {
  if (!messageId) return;
  await prisma.message
    .updateMany({
      where: { id: messageId },
      data: { status: MessageStatus.FAILED, delivered: false, error: error.slice(0, MAX_ERROR_TEXT) },
    })
    .catch(() => {});
}

// ------------------------------------------------------------
// Envio (usado pelo chat e pela auto-resposta)
// ------------------------------------------------------------

export interface DeliverMessageInput {
  storeId: string;
  instance: WhatsAppInstance | null;
  /** Quando informado, o status/externalId/erro são gravados nesta `Message`. */
  messageId?: string;
  phoneE164: string | null;
  text: string;
  /** Origem para o `DevLog` (ex.: "Chat do lead", "Resposta automática (modo teste)"). */
  source: string;
  /** `true` quando o chamador já confirmou a conexão (evita uma segunda checagem ao vivo). */
  verifiedConnection?: boolean;
}

/**
 * Envia um texto já gravado no banco. Nunca lança: o chamador decide o que fazer com o FAILED.
 * Com `EVOLUTION_ENABLED` desligada mantém o comportamento de demo (nada sai, nada falha).
 */
export async function deliverOutboundMessage(
  input: DeliverMessageInput,
): Promise<OutboundDelivery> {
  if (!isEvolutionEnabled()) {
    return { attempted: false, status: 'SKIPPED', reason: 'sending-disabled' };
  }

  if (!input.phoneE164) {
    return { attempted: false, status: 'SKIPPED', reason: 'no-phone' };
  }

  const text = (input.text ?? '').trim().slice(0, MAX_MESSAGE_TEXT);
  if (!text) {
    return { attempted: false, status: 'SKIPPED', reason: 'empty-text' };
  }

  const instance = input.instance;
  if (!instance) {
    return { attempted: false, status: 'SKIPPED', reason: 'no-instance' };
  }

  const connection = input.verifiedConnection
    ? ({ ok: true } as const)
    : await ensureConnected(instance, input.storeId);
  if (!connection.ok) {
    return { attempted: false, status: 'SKIPPED', reason: connection.reason };
  }

  try {
    const result = await sendText(instance.instanceName, input.phoneE164, text, {
      storeId: input.storeId,
      source: input.source,
    });
    await markSent(input.messageId, result.externalId);
    return { attempted: true, status: 'SENT', externalId: result.externalId };
  } catch (error) {
    const message = errorText(error);
    await markFailed(input.messageId, message);
    return { attempted: true, status: 'FAILED', error: message };
  }
}

// ------------------------------------------------------------
// Corrida do eco (`fromMe` antes do externalId)
// ------------------------------------------------------------

/**
 * O webhook recebeu um `fromMe` com o mesmo texto de uma mensagem `PENDING` recente do CRM.
 * Adota a linha (grava o `externalId`) e devolve `matched: true` para o webhook **não** criar um
 * `AGENT` duplicado nem pausar a IA.
 */
export async function tryAdoptOutboundEcho(input: {
  conversationId: string;
  externalId: string;
  text: string;
}): Promise<{ matched: boolean; messageId?: string }> {
  const candidate = await prisma.message.findFirst({
    where: {
      conversationId: input.conversationId,
      externalId: null,
      status: MessageStatus.PENDING,
      sender: { in: [MessageSender.AI, MessageSender.AGENT] },
      text: input.text,
      createdAt: { gte: new Date(Date.now() - ECHO_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!candidate) return { matched: false };

  try {
    await prisma.message.updateMany({
      where: { id: candidate.id, externalId: null },
      data: {
        externalId: input.externalId,
        status: MessageStatus.SENT,
        delivered: true,
        read: true,
      },
    });
  } catch (error) {
    // Concorrência: o envio gravou o externalId primeiro. Já está resolvido, não duplica.
    if ((error as { code?: unknown }).code !== 'P2002') throw error;
  }

  return { matched: true, messageId: candidate.id };
}

// ------------------------------------------------------------
// Auto-resposta do Modo Teste
// ------------------------------------------------------------

export interface AutoReplyInput {
  storeId: string;
  phoneE164: string;
  leadId: string;
  conversationId: string;
  /** Mensagem do cliente que disparou a resposta (usada na checagem de "última mensagem"). */
  triggerMessageId: string;
  userMessage: string;
}

export interface AutoReplyOutcome {
  attempted: boolean;
  sent: boolean;
  skippedReason?: string;
  messageId?: string;
  tokensUsed?: number;
  latencyMs: number;
}

/**
 * Responde automaticamente uma mensagem de cliente **do modo teste**.
 *
 * Sequência: valida pausa/estado → debounce (mensagens picadas) → relê a última mensagem →
 * confere a conexão ao vivo → gera com a IA → grava `Message(AI, PENDING)` → envia → marca SENT
 * (ou FAILED) + `externalId`.
 */
export async function maybeAutoReplyToTestNumber(
  input: AutoReplyInput,
): Promise<AutoReplyOutcome> {
  const startedAt = Date.now();

  const finish = async (
    outcome: Omit<AutoReplyOutcome, 'latencyMs'>,
    level: FlowLogLevel,
    message: string,
  ): Promise<AutoReplyOutcome> => {
    const full: AutoReplyOutcome = { ...outcome, latencyMs: Date.now() - startedAt };
    await logFlow(input.storeId, level, message, {
      origin: 'test-mode-auto-reply',
      phone: maskPhone(input.phoneE164),
      reason: full.skippedReason ?? null,
      sent: full.sent,
      messageId: full.messageId ?? null,
      triggerMessageId: input.triggerMessageId,
      latencyMs: full.latencyMs,
      ...(full.tokensUsed ? { tokensUsed: full.tokensUsed } : {}),
    });
    return full;
  };

  const skipped = (reason: string, level: FlowLogLevel = 'WARN') =>
    finish(
      { attempted: false, sent: false, skippedReason: reason },
      level,
      `Modo teste · auto-resposta não enviada para ${maskPhone(input.phoneE164)} (${reason}).`,
    );

  // 1) O envio precisa estar ligado de verdade.
  if (!isEvolutionEnabled()) return skipped('sending-disabled');

  // 2) Estado da IA do lead (pausa de intervenção humana vence sozinha).
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { aiStatus: true, pausedUntil: true },
  });
  if (!lead) return skipped('lead-not-found');

  if (lead.aiStatus === AIStatus.DISABLED) return skipped('ai-disabled');

  if (lead.aiStatus === AIStatus.PAUSED) {
    const stillPaused = lead.pausedUntil ? lead.pausedUntil.getTime() > Date.now() : true;
    if (stillPaused) return skipped('ai-paused');
    // Pausa vencida: devolve para a IA (mesma regra da tela de conversas) e segue.
    await resumeAIForLead(input.leadId);
  }

  // 3) Só envia com a instância conectada. Checagem barata no banco; a definitiva é ao vivo.
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { storeId: input.storeId },
  });
  if (!instance || instance.status !== WhatsAppStatus.CONNECTED) {
    return skipped(`whatsapp-${(instance?.status ?? 'missing').toLowerCase()}`);
  }

  // 4) Debounce: espera um instante para juntar mensagens picadas (capado pelo limite do webhook).
  const aiConfig = await prisma.aIConfig.findFirst({
    where: { storeId: input.storeId },
    select: { replyDelaySeconds: true },
  });
  const configuredDelay = (aiConfig?.replyDelaySeconds ?? 0) * 1_000;
  const debounceMs = Math.min(Math.max(configuredDelay, 0), MAX_DEBOUNCE_MS);
  if (debounceMs > 0) await sleep(debounceMs);

  // 5) Se chegou mensagem mais nova, a resposta dela tratará o assunto (evita 3 respostas).
  const latest = await prisma.message.findFirst({
    where: { conversationId: input.conversationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (latest?.id !== input.triggerMessageId) return skipped('superseded', 'INFO');

  // 6) Sem chave da OpenAI não adianta nem tentar.
  try {
    assertApiKeyConfigured();
  } catch (error) {
    if (error instanceof MissingApiKeyError) return skipped('missing-api-key');
    throw error;
  }

  // 7) Checagem ao vivo (pode ter caído entre a mensagem e agora).
  const connection = await ensureConnected(instance, input.storeId);
  if (!connection.ok) return skipped(connection.reason);

  // 8) Histórico multi-turno (mesmo formato usado pelo chat).
  const recent = await prisma.message.findMany({
    where: { conversationId: input.conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT + 1,
  });
  const history = recent
    .reverse()
    .filter((message) => message.id !== input.triggerMessageId)
    .filter((message) => message.text.trim() !== '')
    .map((message) => ({
      role: (message.sender === MessageSender.CLIENT ? 'user' : 'assistant') as
        | 'user'
        | 'assistant',
      content: message.text,
    }));

  // 9) Geração.
  let generated: Awaited<ReturnType<typeof generateAIReply>>;
  try {
    generated = await generateAIReply({
      storeId: input.storeId,
      userMessage: input.userMessage,
      history,
      source: 'WhatsApp (modo teste)',
    });
  } catch (error) {
    return finish(
      { attempted: false, sent: false, skippedReason: 'ai-error' },
      'ERROR',
      `Modo teste · falha ao gerar a resposta automática: ${errorText(error)}`,
    );
  }

  const text = (generated.response ?? '').trim().slice(0, MAX_MESSAGE_TEXT);
  if (!text) {
    return finish(
      { attempted: false, sent: false, skippedReason: 'empty-response', tokensUsed: generated.tokensUsed },
      'WARN',
      'Modo teste · a IA não retornou texto para a resposta automática.',
    );
  }

  // 10) Grava PENDING **antes** de enviar: o eco do `fromMe` pode chegar antes do `sendText`.
  const now = new Date();
  const created = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      sender: MessageSender.AI,
      text,
      status: MessageStatus.PENDING,
      delivered: false,
      read: true,
    },
  });

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessage: text, lastMessageAt: now },
    }),
    prisma.lead.update({
      where: { id: input.leadId },
      data: { lastInteraction: now },
    }),
  ]);

  // 11) Envio real.
  const delivery = await deliverOutboundMessage({
    storeId: input.storeId,
    instance,
    messageId: created.id,
    phoneE164: input.phoneE164,
    text,
    source: 'Resposta automática (modo teste)',
    verifiedConnection: true,
  });

  if (delivery.status === 'SENT') {
    return finish(
      { attempted: true, sent: true, messageId: created.id, tokensUsed: generated.tokensUsed },
      'INFO',
      `Modo teste · IA respondeu automaticamente para ${maskPhone(input.phoneE164)}.`,
    );
  }

  return finish(
    {
      attempted: delivery.attempted,
      sent: false,
      skippedReason: delivery.reason ?? 'send-failed',
      messageId: created.id,
      tokensUsed: generated.tokensUsed,
    },
    delivery.attempted ? 'ERROR' : 'WARN',
    delivery.attempted
      ? `Modo teste · falha ao enviar a resposta automática para ${maskPhone(input.phoneE164)} (${delivery.reason}).`
      : `Modo teste · resposta gerada mas não enviada para ${maskPhone(input.phoneE164)} (${delivery.reason}).`,
  );
}
