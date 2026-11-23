import { AIStatus, LeadStage, MessageSender, MessageStatus } from '@prisma/client';

// ------------------------------------------------------------
// Mapeamento entre os enums do Prisma (UPPER_SNAKE) e os
// valores em português usados no frontend (lower_snake).
// ------------------------------------------------------------

const STAGE_TO_PRISMA: Record<string, LeadStage> = {
  novo: LeadStage.NOVO,
  atendimento_ia: LeadStage.ATENDIMENTO_IA,
  intervencao_humana: LeadStage.INTERVENCAO_HUMANA,
  em_negociacao: LeadStage.EM_NEGOCIACAO,
  fechado: LeadStage.FECHADO,
  perdido: LeadStage.PERDIDO,
};

const STAGE_TO_CLIENT: Record<LeadStage, string> = {
  NOVO: 'novo',
  ATENDIMENTO_IA: 'atendimento_ia',
  INTERVENCAO_HUMANA: 'intervencao_humana',
  EM_NEGOCIACAO: 'em_negociacao',
  FECHADO: 'fechado',
  PERDIDO: 'perdido',
};

export function toPrismaStage(stage?: string | null): LeadStage {
  if (!stage) return LeadStage.NOVO;
  return STAGE_TO_PRISMA[stage.toLowerCase()] ?? LeadStage.NOVO;
}

export function toClientStage(stage: LeadStage): string {
  return STAGE_TO_CLIENT[stage] ?? 'novo';
}

export function toClientAiStatus(status: AIStatus): 'active' | 'paused' | 'disabled' {
  if (status === AIStatus.PAUSED) return 'paused';
  if (status === AIStatus.DISABLED) return 'disabled';
  return 'active';
}

export function toPrismaSender(sender?: string): MessageSender {
  const normalized = (sender || 'agent').toLowerCase();
  if (normalized === 'client') return MessageSender.CLIENT;
  if (normalized === 'ai') return MessageSender.AI;
  return MessageSender.AGENT;
}

export function toClientSender(sender: MessageSender): 'client' | 'ai' | 'agent' {
  if (sender === MessageSender.CLIENT) return 'client';
  if (sender === MessageSender.AI) return 'ai';
  return 'agent';
}

/** Formata datas do banco no padrão visual usado no chat (HH:mm). */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "10 min atrás", "2 h atrás", "Ontem 09:15" — usado na lista de contatos. */
export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min atrás`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} h atrás`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Ontem ${formatTime(d)}`;
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** "hoje 20:18", "amanhã 09:00" — usado para exibir até quando a IA está pausada. */
export function formatPausedUntil(date: Date | string | null | undefined): string | undefined {
  if (!date) return undefined;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return undefined;

  if (d.getTime() <= Date.now()) return 'expirado';

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return `hoje ${formatTime(d)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `amanhã ${formatTime(d)}`;

  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${formatTime(d)}`;
}

type LeadWithConversation = {
  id: string;
  name: string;
  phone: string;
  interest: string | null;
  estimatedValue: unknown;
  stage: LeadStage;
  aiStatus: AIStatus;
  pausedUntil: Date | null;
  lastInteraction: Date;
  urgent: boolean;
  urgentReason: string | null;
  unreadCount: number;
  tags: string[];
  conversation?: { lastMessage: string | null; lastMessageAt: Date } | null;
};

/** Serializa um Lead do Prisma no formato consumido pelo frontend. */
export function formatLead(lead: LeadWithConversation) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    interest: lead.interest || '',
    estimatedValue: Number(lead.estimatedValue ?? 0),
    stage: toClientStage(lead.stage),
    aiStatus: toClientAiStatus(lead.aiStatus),
    pausedUntil: formatPausedUntil(lead.pausedUntil),
    lastInteraction: formatRelative(
      lead.conversation?.lastMessageAt ?? lead.lastInteraction,
    ),
    urgent: lead.urgent,
    urgentReason: lead.urgentReason || undefined,
    unreadCount: lead.unreadCount,
    tags: lead.tags,
    lastMessage: lead.conversation?.lastMessage || lead.interest || '',
  };
}

type MessageRow = {
  id: string;
  sender: MessageSender;
  text: string;
  status: MessageStatus;
  createdAt: Date;
  read: boolean;
  isLearned: boolean;
};

/** Serializa uma Message do Prisma no formato consumido pelo chat. */
export function formatMessage(message: MessageRow) {
  return {
    id: message.id,
    sender: toClientSender(message.sender),
    text: message.text,
    status: message.status,
    timestamp: formatTime(message.createdAt),
    sentAt: message.createdAt.toISOString(),
    read: message.read,
    isLearned: message.isLearned,
  };
}
