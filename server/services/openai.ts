import OpenAI from 'openai';

// Singleton do cliente OpenAI
let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
      throw new Error('OPENAI_API_KEY não configurada no .env');
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ----------------------------------------------------------------
// Tipos de contexto para montar o system prompt
// ----------------------------------------------------------------
export interface ProductContext {
  name: string;
  category: string;
  price: number;
  pixPrice?: number | null;
  stock: number;
  dimensions?: string | null;
  colors: string[];
  description?: string | null;
}

export interface QuickReplyContext {
  title: string;
  shortcut: string;
  content: string;
}

export interface AIConfigContext {
  tone: string;           // consultivo | vendedor | direto | afetuoso
  emojiIntensity: string; // none | moderate | expressive
  slangType: string;      // neutro | regional_slz | descontraido | formal
  ctaStrategy: string;    // link_pagamento | direcionar_loja_fisica | grupo_vip_whatsapp | consultor_humano
  maxWordsPerReply: number;
  vipGroupLink?: string;
}

export interface StoreContext {
  name: string;
  whatsappNumber: string;
  address?: string;
}

// ----------------------------------------------------------------
// Monta o System Prompt completo a partir das configs da loja
// ----------------------------------------------------------------
export function buildSystemPrompt(
  store: StoreContext,
  aiConfig: AIConfigContext,
  products: ProductContext[],
  quickReplies: QuickReplyContext[],
  knowledgeChunks: string[] = [],
): string {
  // 1. Tom de voz
  const toneInstructions: Record<string, string> = {
    consultivo: 'Seu tom é consultivo e elegante. Você tira dúvidas com profundidade técnica, transmite segurança e valoriza o produto sem pressão.',
    vendedor: 'Seu tom é de vendedor ativo. Você destaca descontos, cria urgência leve e foca em fechar. Use expressões como "super condição", "semana especial", "últimas unidades".',
    direto: 'Seu tom é direto e objetivo. Respostas curtas e precisas, sem rodeios. Vá direto ao ponto.',
    afetuoso: 'Seu tom é afetuoso e acolhedor. Você é super empático, caloroso e cuidadoso. O cliente deve sentir que está sendo atendido por uma amiga de confiança.',
  };

  // 2. Emojis
  const emojiInstructions: Record<string, string> = {
    none: 'Não use emojis em nenhuma hipótese. Mantenha o estilo estritamente textual.',
    moderate: 'Use apenas 1 ou 2 emojis estratégicos e relevantes no final da mensagem. Nunca exagere.',
    expressive: 'Use emojis com entusiasmo e naturalidade, entre 3 e 5 por mensagem, de forma que anime e humanize a conversa.',
  };

  // 3. Regionalismo
  const slangInstructions: Record<string, string> = {
    regional_slz: 'Use expressões e gírias típicas de São Luís do Maranhão quando natural, como "mermã", "sô", "arretado". Seja autêntico e regional.',
    descontraido: 'Use linguagem moderna e descontraída, com gírias neutras como "top", "incrível", "fechou", "bora".',
    neutro: 'Use português neutro e cuidadoso, sem gírias regionais. Adequado para qualquer público brasileiro.',
    formal: 'Use linguagem formal e profissional. Senhor/Senhora, sem contrações informais.',
  };

  // 4. CTA
  const ctaInstructions: Record<string, string> = {
    grupo_vip_whatsapp: `Ao final de toda resposta, convide o cliente a entrar no Grupo VIP do WhatsApp da loja, onde há promoções exclusivas. ${store.name ? `Link do grupo: (disponível ao solicitar)` : ''}`,
    link_pagamento: 'Ao final, ofereça gerar um link de pagamento via Pix com 7% de desconto. Use frases como "Posso já separar na bancada e gerar o link Pix com desconto?"',
    direcionar_loja_fisica: `Ao final, convide o cliente para visitar a loja física${store.address ? ` em: ${store.address}` : ''}.`,
    consultor_humano: 'Ao final, ofereça conectar o cliente com uma consultora humana para fechar com atenção personalizada.',
  };

  // 5. Catálogo formatado
  const catalogText = products.length > 0
    ? products.map((p) => {
        const pixInfo = p.pixPrice ? ` | Pix: R$${Number(p.pixPrice).toFixed(2)}` : '';
        const stockInfo = p.stock > 0 ? `${p.stock} em estoque` : '⚠️ SEM ESTOQUE';
        const colorsInfo = p.colors.length > 0 ? ` | Cores: ${p.colors.join(', ')}` : '';
        const dimInfo = p.dimensions ? ` | Medidas: ${p.dimensions}` : '';
        const desc = p.description ? ` | ${p.description}` : '';
        return `• ${p.name}: R$${Number(p.price).toFixed(2)}${pixInfo} | ${stockInfo}${colorsInfo}${dimInfo}${desc}`;
      }).join('\n')
    : 'Catálogo não disponível no momento.';

  // 6. Respostas rápidas
  const quickRepliesText = quickReplies.length > 0
    ? quickReplies.map((qr) => `  ${qr.shortcut} "${qr.title}": ${qr.content}`).join('\n')
    : 'Nenhuma resposta rápida cadastrada.';

  // 7. Base de conhecimento (RAG chunks)
  const knowledgeText = knowledgeChunks.length > 0
    ? knowledgeChunks.map((chunk, i) => `  [${i + 1}] ${chunk}`).join('\n')
    : 'Base de conhecimento vazia.';

  return `Você é a atendente virtual da loja "${store.name}", especializada em malas de viagem, mochilas e acessórios.
Você responde clientes via WhatsApp de forma natural e humana.

## REGRAS ABSOLUTAS
- Responda SEMPRE em português brasileiro.
- Seja concisa. Máximo de ${aiConfig.maxWordsPerReply} palavras por resposta.
- NUNCA mencione que é uma IA, robô ou sistema. Você é a atendente da loja.
- NUNCA invente produtos, preços ou informações que não estejam no catálogo abaixo.
- Se o produto não estiver no catálogo, diga honestamente que não temos aquele item e ofereça o mais próximo disponível.
- Se o estoque for 0, NÃO ofereça o produto. Informe que está esgotado e ofereça uma alternativa.

## SEU TOM DE VOZ
${toneInstructions[aiConfig.tone] || toneInstructions.consultivo}

## USO DE EMOJIS
${emojiInstructions[aiConfig.emojiIntensity] || emojiInstructions.moderate}

## LINGUAGEM E REGIONALISMO
${slangInstructions[aiConfig.slangType] || slangInstructions.neutro}

## ESTRATÉGIA DE CTA (CHAMADA PARA AÇÃO)
${ctaInstructions[aiConfig.ctaStrategy] || ctaInstructions.consultor_humano}

## CATÁLOGO DE PRODUTOS DISPONÍVEIS (use APENAS estes)
${catalogText}

## RESPOSTAS RÁPIDAS CADASTRADAS (use quando relevante)
${quickRepliesText}

## BASE DE CONHECIMENTO DA LOJA
${knowledgeText}

## INFORMAÇÕES DA LOJA
- Nome: ${store.name}
- WhatsApp: ${store.whatsappNumber}
${store.address ? `- Endereço: ${store.address}` : ''}`;
}
