import {
  Product,
  StoreSettings,
  Lead,
  ChatConversation,
  ChatMessage,
  LeadStage,
  AIConfig,
  AIKnowledgeItem,
  QuickReply,
  DevLogItem,
  DevLogSummary,
} from '../types';

const API_BASE = '/api';

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIGenerateResult {
  response: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
}

export interface AIReplyResult {
  response: string;
  persisted: boolean;
  message?: ChatMessage;
  model: string;
  tokensUsed: number;
  latencyMs: number;
}

export interface SendMessageResult {
  message: ChatMessage;
  aiPaused: boolean;
  sender: 'client' | 'ai' | 'agent';
}

/** Erro de API com mensagem já amigável para exibir no toast do lojista. */
export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || `Falha na requisição (HTTP ${res.status}).`;
  } catch {
    return `Falha na requisição (HTTP ${res.status}).`;
  }
}

export const apiService = {
  // Health check
  async checkHealth(): Promise<{ status: string; database?: string } | null> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // Produtos
  async getProducts(): Promise<Product[] | null> {
    try {
      const res = await fetch(`${API_BASE}/products`);
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.warn('Backend offline ou inacessível. Usando fallback local:', error);
      return null;
    }
  },

  async createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateStock(id: string, delta: number): Promise<Product | null> {
    try {
      const res = await fetch(`${API_BASE}/products/${id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Loja & Configurações de Identidade
  async getStoreSettings(): Promise<StoreSettings | null> {
    try {
      const res = await fetch(`${API_BASE}/store`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings | null> {
    try {
      const res = await fetch(`${API_BASE}/store`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // IA: Geração de resposta via OpenAI
  async generateAIResponse(
    message: string,
    conversationHistory: ChatHistoryEntry[] = [],
  ): Promise<AIGenerateResult | null> {
    try {
      const res = await fetch(`${API_BASE}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationHistory }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Erro da API de IA:', err);
        return null;
      }
      return await res.json();
    } catch (error) {
      console.warn('Backend de IA offline ou inacessível:', error);
      return null;
    }
  },

  // ----------------------------------------------------------------
  // Leads & Pipeline
  // ----------------------------------------------------------------
  async getLeads(): Promise<Lead[] | null> {
    try {
      const res = await fetch(`${API_BASE}/leads`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateLeadStage(leadId: string, stage: LeadStage): Promise<Lead | null> {
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
      return await res.json();
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      console.warn('Falha ao sincronizar estágio do lead:', error);
      return null;
    }
  },

  async setLeadAIStatus(
    leadId: string,
    status: 'active' | 'paused',
    hours?: number,
  ): Promise<Lead | null> {
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/ai-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, hours }),
      });
      if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
      return await res.json();
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      console.warn('Falha ao sincronizar status da IA:', error);
      return null;
    }
  },

  async setLeadUrgency(
    leadId: string,
    urgent: boolean,
    urgentReason?: string,
  ): Promise<Lead | null> {
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/urgency`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urgent, urgentReason }),
      });
      if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
      return await res.json();
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      console.warn('Falha ao sincronizar urgência do lead:', error);
      return null;
    }
  },

  // ----------------------------------------------------------------
  // Conversas & Mensagens
  // ----------------------------------------------------------------
  async getConversations(): Promise<ChatConversation[] | null> {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async sendLeadMessage(
    leadId: string,
    text: string,
    sender: 'client' | 'ai' | 'agent',
  ): Promise<SendMessageResult> {
    const res = await fetch(`${API_BASE}/conversations/${leadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sender }),
    });
    if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
    return await res.json();
  },

  // Gera a resposta da IA com o histórico real da conversa e persiste no banco.
  // Com persist=false devolve apenas o texto (sugestão), sem gravar mensagem.
  async generateAIReplyForLead(
    leadId: string,
    options: { message?: string; persist?: boolean } = {},
  ): Promise<AIReplyResult> {
    const { message, persist = true } = options;
    const res = await fetch(`${API_BASE}/conversations/${leadId}/ai-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(message ? { message } : {}), persist }),
    });
    if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
    return await res.json();
  },

  // ----------------------------------------------------------------
  // Configuração da Linguagem da IA
  // ----------------------------------------------------------------
  async getAIConfig(): Promise<AIConfig | null> {
    try {
      const res = await fetch(`${API_BASE}/ai-config`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async updateAIConfig(config: Partial<AIConfig>): Promise<AIConfig | null> {
    try {
      const res = await fetch(`${API_BASE}/ai-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.warn('Falha ao salvar configuração da IA:', error);
      return null;
    }
  },

  // ----------------------------------------------------------------
  // Base de Conhecimento (RAG / "Ensinar IA")
  // ----------------------------------------------------------------
  async getKnowledge(): Promise<AIKnowledgeItem[] | null> {
    try {
      const res = await fetch(`${API_BASE}/knowledge`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async addKnowledge(item: {
    question: string;
    answer: string;
    source?: 'humano_chat' | 'manual';
  }): Promise<AIKnowledgeItem | null> {
    try {
      const res = await fetch(`${API_BASE}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.warn('Falha ao salvar conhecimento da IA:', error);
      return null;
    }
  },

  async deleteKnowledge(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/knowledge/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ----------------------------------------------------------------
  // Respostas Rápidas
  // ----------------------------------------------------------------
  async getQuickReplies(): Promise<QuickReply[] | null> {
    try {
      const res = await fetch(`${API_BASE}/quick-replies`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async createQuickReply(reply: Omit<QuickReply, 'id'>): Promise<QuickReply> {
    const res = await fetch(`${API_BASE}/quick-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply),
    });
    if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
    return await res.json();
  },

  async deleteQuickReply(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/quick-replies/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ----------------------------------------------------------------
  // Área Dev: logs técnicos e diagnóstico por IA
  // ----------------------------------------------------------------
  async getDevLogs(params: {
    level?: string;
    service?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<DevLogsResponse | null> {
    try {
      const query = new URLSearchParams();
      if (params.level) query.set('level', params.level);
      if (params.service) query.set('service', params.service);
      if (params.search) query.set('search', params.search);
      if (params.limit) query.set('limit', String(params.limit));

      const suffix = query.toString() ? `?${query.toString()}` : '';
      const res = await fetch(`${API_BASE}/dev-logs${suffix}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async diagnoseDevLog(
    id: string,
  ): Promise<{ diagnosis: string; model: string; tokensUsed: number; latencyMs: number }> {
    const res = await fetch(`${API_BASE}/dev-logs/${id}/diagnose`, { method: 'POST' });
    if (!res.ok) throw new ApiRequestError(await parseError(res), res.status);
    return await res.json();
  },
};

export interface DevLogsResponse {
  logs: DevLogItem[];
  total: number;
  returned: number;
  summary: DevLogSummary;
}
