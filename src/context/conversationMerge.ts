import type { ChatConversation, ChatMessage, Lead } from '../types';

/**
 * Funções puras de merge usadas pelo polling do chat (S5b).
 *
 * Elas existem separadas do `CRMContext` para poderem ser testadas sem React. A regra central:
 * o servidor é a fonte da verdade das conversas, **exceto** por mensagens otimistas que ainda não
 * foram confirmadas (o envio acabou de sair e a API ainda não respondeu). Essas mensagens não podem
 * "piscar" nem duplicar quando o polling chega.
 */

/** Prefixo dos IDs temporários criados por `sendMessage` (antes da resposta da API). */
const OPTIMISTIC_ID_PREFIX = 'msg-';

function isOptimistic(message: ChatMessage): boolean {
  return message.id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/** `sender|text` — usado para reconhecer a versão do servidor de uma mensagem otimista. */
function messageKey(message: ChatMessage): string {
  return `${message.sender}|${message.text}`;
}

/**
 * Mescla as conversas vindas de `GET /api/conversations` no estado local.
 *
 * - Preserva o que é local e ainda não existe no servidor (conversa criada otimisticamente).
 * - Mantém na ponta as mensagens otimistas (`msg-*`) que o servidor ainda não confirmou.
 * - Remove a versão otimista quando a mensagem já chegou pelo servidor (mesmo remetente + texto),
 *   evitando bolha duplicada durante a janela de envio.
 */
export function mergeConversations(
  previous: Record<string, ChatConversation>,
  incoming: ChatConversation[],
): Record<string, ChatConversation> {
  if (incoming.length === 0) return previous;

  const next: Record<string, ChatConversation> = { ...previous };

  for (const conversation of incoming) {
    const local = previous[conversation.leadId];
    if (!local) {
      next[conversation.leadId] = conversation;
      continue;
    }

    const serverIds = new Set(conversation.messages.map((message) => message.id));
    const serverKeys = new Set(conversation.messages.map(messageKey));

    const pending = local.messages.filter(
      (message) =>
        isOptimistic(message) &&
        !serverIds.has(message.id) &&
        !serverKeys.has(messageKey(message)),
    );

    if (pending.length === 0) {
      next[conversation.leadId] = conversation;
      continue;
    }

    const lastPending = pending[pending.length - 1];
    next[conversation.leadId] = {
      ...conversation,
      messages: [...conversation.messages, ...pending],
      lastMessage: lastPending.text,
      lastTime: lastPending.timestamp,
    };
  }

  return next;
}

/**
 * Mantém a lista de leads do chat em sincronia com as conversas.
 *
 * - Cria um lead sintético para contatos novos que chegaram pelo WhatsApp (o webhook cria o Lead no
 *   banco; o frontend ainda não o conhecia nessa sessão).
 * - Espelha `aiStatus`/`pausedUntil`/`stage` quando o backend pausa ou retoma a IA (intervenção
 *   humana pelo celular ou expiração da pausa de 24h).
 * - Nunca rebaixa um lead `disabled` para `paused` (a conversa não carrega esse estado).
 */
export function mergeLeads(previous: Lead[], incoming: ChatConversation[]): Lead[] {
  if (incoming.length === 0) return previous;

  const byId = new Map(previous.map((lead) => [lead.id, lead]));
  /** Contatos novos entram no topo do inbox (é onde o atendente espera vê-los). */
  const added: Lead[] = [];
  let changed = false;

  for (const conversation of incoming) {
    const lead = byId.get(conversation.leadId);

    if (!lead) {
      const synthetic: Lead = {
        id: conversation.leadId,
        name: conversation.leadName,
        phone: conversation.phone,
        interest: '',
        estimatedValue: 0,
        stage: conversation.stage,
        aiStatus: conversation.aiStatus,
        pausedUntil: conversation.pausedUntil,
        lastInteraction: conversation.lastTime,
        urgent: false,
        tags: [],
      };
      byId.set(conversation.leadId, synthetic);
      added.push(synthetic);
      changed = true;
      continue;
    }

    let merged = lead;

    if (lead.aiStatus !== 'disabled' && conversation.aiStatus !== lead.aiStatus) {
      if (conversation.aiStatus === 'paused') {
        merged = { ...merged, aiStatus: 'paused', pausedUntil: conversation.pausedUntil };
      } else if (lead.aiStatus === 'paused') {
        merged = { ...merged, aiStatus: 'active', pausedUntil: undefined };
      }
    } else if (
      lead.aiStatus === 'paused' &&
      conversation.aiStatus === 'paused' &&
      lead.pausedUntil !== conversation.pausedUntil
    ) {
      merged = { ...merged, pausedUntil: conversation.pausedUntil };
    }

    if (merged.stage !== conversation.stage) {
      merged = { ...merged, stage: conversation.stage };
    }

    if (merged !== lead) {
      byId.set(lead.id, merged);
      changed = true;
    }
  }

  if (!changed) return previous;

  // Mantém a ordem atual dos leads já conhecidos (só os novos vão para o topo).
  const updatedExisting = previous.map((lead) => byId.get(lead.id) ?? lead);
  return [...added, ...updatedExisting];
}
