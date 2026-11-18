import type OpenAI from 'openai';
import { prisma } from '../db.js';
import { getOpenAIClient, buildSystemPrompt, OPENAI_MODEL } from './openai.js';

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateReplyInput {
  storeId: string;
  userMessage: string;
  history?: ChatHistoryEntry[];
  /** Origem da chamada, usada só no log técnico (ex.: "Chat do lead", "Playground IA"). */
  source?: string;
}

export interface GenerateReplyResult {
  response: string;
  model: string;
  tokensUsed: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

/** Erro de chave de API ausente — o chamador deve devolver 503, não 502. */
export class MissingApiKeyError extends Error {
  constructor(message = 'OPENAI_API_KEY não configurada no .env') {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

function normalizeHistory(history: ChatHistoryEntry[] = []): ChatHistoryEntry[] {
  const valid = history.filter(
    (entry) =>
      entry &&
      (entry.role === 'user' || entry.role === 'assistant') &&
      typeof entry.content === 'string' &&
      entry.content.trim() !== '',
  );
  // Últimas 10 mensagens: mantém o contexto sem estourar a janela de tokens.
  return valid.slice(-10);
}

/**
 * Monta o system prompt a partir do banco (loja + catálogo + configs da IA +
 * respostas rápidas + base de conhecimento), chama a OpenAI e registra o
 * DevLog com tokens e latência.
 */
export async function generateAIReply({
  storeId,
  userMessage,
  history = [],
  source = 'Chat',
}: GenerateReplyInput): Promise<GenerateReplyResult> {
  const openai: OpenAI = getOpenAIClient();

  const [store, products, quickReplies, aiConfig, knowledgeItems] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.product.findMany({
      where: { storeId, active: true, stock: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quickReply.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.aIConfig.findFirst({ where: { storeId } }),
    prisma.aIKnowledge.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  if (!store) {
    throw new Error('Loja não encontrada no banco de dados.');
  }

  const configContext = {
    tone: aiConfig?.tone?.toLowerCase() || 'consultivo',
    emojiIntensity: aiConfig?.emojiIntensity?.toLowerCase() || 'moderate',
    slangType: aiConfig?.slangType?.toLowerCase() || 'neutro',
    ctaStrategy: aiConfig?.ctaStrategy?.toLowerCase() || 'consultor_humano',
    maxWordsPerReply: aiConfig?.maxWordsPerReply || 55,
    vipGroupLink: store.vipGroupLink || undefined,
  };

  const systemPrompt = buildSystemPrompt(
    {
      name: store.name,
      whatsappNumber: store.whatsappNumber,
      address: store.address || undefined,
    },
    configContext,
    products.map((p) => ({
      name: p.name,
      category: p.category.toLowerCase(),
      price: Number(p.price),
      pixPrice: p.pixPrice ? Number(p.pixPrice) : null,
      stock: p.stock,
      dimensions: p.dimensions || null,
      colors: p.colors,
      description: p.description || null,
    })),
    quickReplies.map((qr) => ({
      title: qr.title,
      shortcut: qr.shortcut,
      content: qr.content,
    })),
    knowledgeItems.map((k) => `P: ${k.question} | R: ${k.answer}`),
  );

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...normalizeHistory(history),
    { role: 'user', content: userMessage.trim() },
  ];

  const startTime = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const latencyMs = Date.now() - startTime;
    const responseText = completion.choices[0]?.message?.content?.trim() || '';
    const tokensIn = completion.usage?.prompt_tokens || 0;
    const tokensOut = completion.usage?.completion_tokens || 0;

    // Log técnico assíncrono: nunca deve derrubar a resposta ao lojista.
    prisma.devLog
      .create({
        data: {
          storeId: store.id,
          level: 'AI_CALL',
          service: 'OPENAI',
          message: `${source}: "${userMessage.substring(0, 60)}..."`,
          tokensIn,
          tokensOut,
          latencyMs,
          metadata: {
            model: OPENAI_MODEL,
            source,
            tone: configContext.tone,
            emojiIntensity: configContext.emojiIntensity,
            finishReason: completion.choices[0]?.finish_reason,
          },
        },
      })
      .catch(() => {});

    return {
      response: responseText,
      model: OPENAI_MODEL,
      tokensUsed: tokensIn + tokensOut,
      tokensIn,
      tokensOut,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;

    prisma.devLog
      .create({
        data: {
          storeId: store.id,
          level: 'ERROR',
          service: 'OPENAI',
          message: `Erro na geração IA (${source}): ${err?.message || 'erro desconhecido'}`,
          latencyMs,
          metadata: { error: err?.message, model: OPENAI_MODEL, source },
        },
      })
      .catch(() => {});

    throw err;
  }
}

/** Lança MissingApiKeyError quando a chave não está configurada. */
export function assertApiKeyConfigured(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_AQUI' || apiKey.startsWith('sk-...')) {
    throw new MissingApiKeyError();
  }
}

export interface DevDiagnosisInput {
  service: string;
  level: string;
  message: string;
  metadata?: unknown;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  storeName?: string;
  storeId: string;
}

export interface DevDiagnosisResult {
  diagnosis: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
}

/**
 * Agente Dev: analisa um DevLog técnico e devolve causa raiz + ações.
 * Usa um prompt de engenheiro sênior (diferente do prompt de atendimento).
 */
export async function generateDevDiagnosis(input: DevDiagnosisInput): Promise<DevDiagnosisResult> {
  const openai = getOpenAIClient();

  const metadataText = input.metadata
    ? JSON.stringify(input.metadata, null, 2).slice(0, 1200)
    : 'Sem metadados adicionais.';

  const systemPrompt = `Você é um engenheiro de software sênior especializado em CRM multi-tenant, WhatsApp (Evolution API), OpenAI, Node.js/Express, Prisma e PostgreSQL.
Sua tarefa é diagnosticar um log técnico de produção de forma objetiva.

Responda SEMPRE em português brasileiro, neste formato, sem introdução:
- **Causa Raiz:** (1 a 2 frases, a explicação técnica mais provável)
- **Impacto:** (o que o lojista/cliente final sente)
- **Severidade:** (Baixa | Média | Alta)
- **Ação Recomendada:** (até 3 passos numerados e concretos)

Seja específico e curto (máximo 180 palavras). Se os dados não permitirem concluir, diga exatamente qual informação falta investigar.`;

  const userPrompt = `Log técnico para analisar:
- Loja: ${input.storeName ?? 'desconhecida'} (${input.storeId})
- Serviço: ${input.service}
- Nível: ${input.level}
- Mensagem: ${input.message}
- Tokens entrada/saída: ${input.tokensIn ?? 0} / ${input.tokensOut ?? 0}
- Latência: ${input.latencyMs ?? 0}ms
- Metadados: ${metadataText}`;

  const startTime = Date.now();

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 400,
  });

  const latencyMs = Date.now() - startTime;
  const diagnosis = completion.choices[0]?.message?.content?.trim() || '';
  const tokensIn = completion.usage?.prompt_tokens || 0;
  const tokensOut = completion.usage?.completion_tokens || 0;

  prisma.devLog
    .create({
      data: {
        storeId: input.storeId,
        level: 'AI_CALL',
        service: 'OPENAI',
        message: `Diagnóstico Dev IA executado sobre um log de ${input.service}.`,
        tokensIn,
        tokensOut,
        latencyMs,
        metadata: { source: 'dev-diagnosis', model: OPENAI_MODEL },
      },
    })
    .catch(() => {});

  return { diagnosis, model: OPENAI_MODEL, tokensUsed: tokensIn + tokensOut, latencyMs };
}
