import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { 
  Lead, 
  LeadStage, 
  ChatConversation, 
  ChatMessage, 
  QuickReply, 
  AIConfig, 
  StoreSettings, 
  FollowUpCampaign, 
  DevLogItem, 
  AIKnowledgeItem,
  DevLogSummary,
  Product 
} from '../types';
import { 
  initialLeads, 
  initialConversations, 
  initialQuickReplies, 
  initialAIConfig, 
  initialStoreSettings, 
  initialCampaigns, 
  initialDevLogs,
  initialKnowledge,
  initialProducts 
} from '../mock/initialData';
import { apiService } from '../services/api';
import type {
  ConnectWhatsAppInstanceResult,
  CreateWhatsAppInstanceResult,
  DevLogsResponse,
  WhatsAppInstance,
} from '../services/api';

/** QR da Evolution expira em ~40s; preparar um novo com folga aos 30s. */
const WHATSAPP_QR_RENEW_MS = 30_000;

export type ViewType = 
  | 'dashboard' 
  | 'funnel' 
  | 'kanban' 
  | 'chats' 
  | 'products'
  | 'ai_config' 
  | 'follow_up' 
  | 'post_sale' 
  | 'settings' 
  | 'dev_admin';

interface CRMContextType {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  leads: Lead[];
  updateLeadStage: (id: string, stage: LeadStage) => void;
  toggleLeadUrgency: (id: string) => void;
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  updateProductStock: (id: string, delta: number) => void;
  conversations: Record<string, ChatConversation>;
  selectedChatLeadId: string | null;
  setSelectedChatLeadId: (id: string | null) => void;
  sendMessage: (leadId: string, text: string, sender: 'client' | 'ai' | 'agent') => void;
  generateAIReplyForLead: (
    leadId: string,
    options?: { persist?: boolean },
  ) => Promise<{
    response: string;
    persisted: boolean;
    tokensUsed: number;
    latencyMs: number;
    model: string;
  }>;
  pauseAIForLead: (leadId: string, hours?: number) => void;
  resumeAIForLead: (leadId: string) => void;
  teachAIFromMessage: (text: string, referenceQuestion?: string) => void;
  quickReplies: QuickReply[];
  addQuickReply: (reply: Omit<QuickReply, 'id'>) => void;
  removeQuickReply: (id: string) => void;
  aiConfig: AIConfig;
  updateAIConfig: (config: Partial<AIConfig>) => void;
  aiKnowledge: AIKnowledgeItem[];
  removeKnowledge: (id: string) => void;
  storeSettings: StoreSettings;
  updateStoreSettings: (settings: Partial<StoreSettings>) => void;
  campaigns: FollowUpCampaign[];
  toggleCampaign: (id: string) => void;
  devLogs: DevLogItem[];
  devLogSummary: DevLogSummary | null;
  refreshDevLogs: (filters?: {
    level?: string;
    service?: string;
    search?: string;
    limit?: number;
  }) => Promise<DevLogsResponse | null>;
  devMode: boolean;
  setDevMode: (active: boolean) => void;
  addNotification: (msg: string) => void;
  notification: string | null;

  // Conexão WhatsApp (Fase 11 / Onda 1 / S5a) — estado compartilhado entre Header e Settings
  /** `null` enquanto a primeira consulta não terminou. */
  whatsapp: WhatsAppInstance | null;
  whatsappLoading: boolean;
  whatsappError: string | null;
  /** `true` enquanto a instância/QR está sendo preparado em background (sem clique). */
  whatsappProvisioning: boolean;
  /**
   * Consulta o status da instância. `refresh: true` só na abertura da tela/botão
   * "Atualizar" (nunca no polling de 5s). `silent` evita toast em falha de background.
   */
  refreshWhatsApp: (options?: {
    refresh?: boolean;
    silent?: boolean;
  }) => Promise<WhatsAppInstance | null>;
  createWhatsApp: () => Promise<CreateWhatsAppInstanceResult>;
  connectWhatsApp: () => Promise<ConnectWhatsAppInstanceResult>;
  logoutWhatsApp: () => Promise<WhatsAppInstance>;
  restartWhatsApp: () => Promise<WhatsAppInstance>;
  /**
   * Cria a instância (idempotente) e garante um QR fresco. É o mesmo caminho usado
   * pelo pré-provisionamento automático e pelo botão "Criar conexão".
   */
  provisionWhatsApp: () => Promise<WhatsAppInstance>;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [conversations, setConversations] = useState<Record<string, ChatConversation>>(initialConversations);
  const [selectedChatLeadId, setSelectedChatLeadId] = useState<string | null>('lead-1');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(initialQuickReplies);
  const [aiConfig, setAIConfig] = useState<AIConfig>(initialAIConfig);
  const [aiKnowledge, setAiKnowledge] = useState<AIKnowledgeItem[]>(initialKnowledge);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(initialStoreSettings);
  const [campaigns, setCampaigns] = useState<FollowUpCampaign[]>(initialCampaigns);
  const [devLogs, setDevLogs] = useState<DevLogItem[]>(initialDevLogs);
  const [devLogSummary, setDevLogSummary] = useState<DevLogSummary | null>(null);
  const [devMode, setDevMode] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Conexão WhatsApp: estado compartilhado (Header + card de Configurações).
  const [whatsapp, setWhatsapp] = useState<WhatsAppInstance | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappProvisioning, setWhatsappProvisioning] = useState(false);
  const whatsappProvisionRef = useRef<Promise<WhatsAppInstance> | null>(null);
  const autoProvisionStartedRef = useRef(false);
  /** Evita dois GETs simultâneos do status (polling + abertura da tela/botão). */
  const whatsappRequestRef = useRef<{
    refresh: boolean;
    promise: Promise<WhatsAppInstance>;
  } | null>(null);
  /** Invalida respostas antigas depois de uma ação (create/connect/logout/restart). */
  const whatsappRequestIdRef = useRef(0);
  const notificationTimerRef = useRef<number | null>(null);

  // Apply dynamic CSS brand variables when storeSettings.theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-brand-500', storeSettings.theme.primaryColor);
    root.style.setProperty('--color-accent', storeSettings.theme.accentColor);
  }, [storeSettings.theme]);

  // Carregar dados reais do backend (PostgreSQL) com fallback resiliente
  useEffect(() => {
    let isMounted = true;

    async function loadBackendData() {
      try {
        const [
          backendProducts,
          backendStore,
          backendLeads,
          backendConversations,
          backendAIConfig,
          backendKnowledge,
          backendQuickReplies,
          backendDevLogs,
        ] = await Promise.all([
          apiService.getProducts(),
          apiService.getStoreSettings(),
          apiService.getLeads(),
          apiService.getConversations(),
          apiService.getAIConfig(),
          apiService.getKnowledge(),
          apiService.getQuickReplies(),
          apiService.getDevLogs({ limit: 50 }),
        ]);

        if (!isMounted) return;

        if (backendProducts && backendProducts.length > 0) {
          setProducts(backendProducts);
        }
        if (backendStore) {
          setStoreSettings(backendStore);
        }
        if (backendLeads && backendLeads.length > 0) {
          setLeads(backendLeads);
          setSelectedChatLeadId((prev) =>
            prev && backendLeads.some((l) => l.id === prev) ? prev : backendLeads[0].id,
          );
        }
        if (backendConversations && backendConversations.length > 0) {
          const byLead: Record<string, ChatConversation> = {};
          for (const conv of backendConversations) {
            byLead[conv.leadId] = conv;
          }
          setConversations(byLead);
        }
        if (backendAIConfig) {
          setAIConfig(backendAIConfig);
        }
        if (backendKnowledge) {
          setAiKnowledge(backendKnowledge);
        }
        if (backendQuickReplies && backendQuickReplies.length > 0) {
          setQuickReplies(backendQuickReplies);
        }
        if (backendDevLogs) {
          setDevLogs(backendDevLogs.logs);
          setDevLogSummary(backendDevLogs.summary);
        }
      } catch (err) {
        console.warn('Backend offline ou inacessível. Usando mock inicial:', err);
      }
    }

    loadBackendData();
    return () => {
      isMounted = false;
    };
  }, []);

  const addNotification = useCallback((msg: string) => {
    setNotification(msg);
    if (notificationTimerRef.current !== null) {
      window.clearTimeout(notificationTimerRef.current);
    }
    notificationTimerRef.current = window.setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => () => {
    if (notificationTimerRef.current !== null) {
      window.clearTimeout(notificationTimerRef.current);
    }
  }, []);

  // ----------------------------------------------------------------
  // Conexão WhatsApp — funções compartilhadas
  // ----------------------------------------------------------------

  const refreshWhatsApp = useCallback(async (options: {
    refresh?: boolean;
    silent?: boolean;
  } = {}): Promise<WhatsAppInstance | null> => {
    const { refresh = false, silent = false } = options;
    setWhatsappLoading(true);

    // Reaproveita uma consulta em andamento: o polling e a abertura da tela não disparam
    // dois GETs concorrentes. Uma consulta simples nunca "engole" um refresh explícito.
    const current = whatsappRequestRef.current;
    const entry =
      current && (current.refresh || !refresh)
        ? current
        : { refresh, promise: apiService.getWhatsAppInstance({ refresh }) };
    whatsappRequestRef.current = entry;
    const pending = entry.promise;
    const requestId = ++whatsappRequestIdRef.current;

    try {
      const data = await pending;
      // Uma ação (create/connect/...) pode ter chegado antes: não sobrescreve o estado novo.
      if (requestId === whatsappRequestIdRef.current) {
        setWhatsapp(data);
        setWhatsappError(null);
      }
      return data;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível consultar a conexão do WhatsApp.';
      if (requestId === whatsappRequestIdRef.current) {
        setWhatsappError(message);
        if (!silent) addNotification(`⚠️ ${message}`);
      }
      return null;
    } finally {
      if (whatsappRequestRef.current?.promise === pending) {
        whatsappRequestRef.current = null;
      }
      setWhatsappLoading(false);
    }
  }, [addNotification]);

  /** Aplica o retorno de uma ação e invalida qualquer GET que tenha saído antes dela. */
  const applyWhatsAppAction = useCallback((data: WhatsAppInstance) => {
    whatsappRequestIdRef.current += 1;
    whatsappRequestRef.current = null;
    setWhatsapp(data);
    setWhatsappError(null);
  }, []);

  const createWhatsApp = useCallback(async (): Promise<CreateWhatsAppInstanceResult> => {
    const data = await apiService.createWhatsAppInstance();
    applyWhatsAppAction(data);
    return data;
  }, [applyWhatsAppAction]);

  const connectWhatsApp = useCallback(async (): Promise<ConnectWhatsAppInstanceResult> => {
    const data = await apiService.connectWhatsAppInstance();
    applyWhatsAppAction(data);
    return data;
  }, [applyWhatsAppAction]);

  const logoutWhatsApp = useCallback(async (): Promise<WhatsAppInstance> => {
    const data = await apiService.logoutWhatsAppInstance();
    applyWhatsAppAction(data);
    return data;
  }, [applyWhatsAppAction]);

  const restartWhatsApp = useCallback(async (): Promise<WhatsAppInstance> => {
    const data = await apiService.restartWhatsAppInstance();
    applyWhatsAppAction(data);
    return data;
  }, [applyWhatsAppAction]);

  /**
   * Cria a instância e garante um QR utilizável. O `POST /instance` já devolve o QR
   * de uma instância recém-criada; só pedimos `/connect` quando ele falta ou venceu.
   * Chamadas concorrentes compartilham a mesma promise (o botão e o auto-preparo).
   */
  const provisionWhatsApp = useCallback(async (): Promise<WhatsAppInstance> => {
    if (whatsappProvisionRef.current) return whatsappProvisionRef.current;

    const promise = (async () => {
      setWhatsappError(null);
      setWhatsappProvisioning(true);
      try {
        const created = await createWhatsApp();

        const updatedAt = created.qrUpdatedAt ? new Date(created.qrUpdatedAt).getTime() : 0;
        const age = updatedAt ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
        if (
          created.status !== 'CONNECTED' &&
          (!created.qrCode || age > WHATSAPP_QR_RENEW_MS)
        ) {
          return await connectWhatsApp();
        }

        return created;
      } finally {
        setWhatsappProvisioning(false);
      }
    })();

    whatsappProvisionRef.current = promise;
    try {
      return await promise;
    } finally {
      if (whatsappProvisionRef.current === promise) {
        whatsappProvisionRef.current = null;
      }
    }
  }, [connectWhatsApp, createWhatsApp]);

  // Status inicial para o Header (consulta barata, sem `?refresh=1`).
  useEffect(() => {
    void refreshWhatsApp({ silent: true });
  }, [refreshWhatsApp]);

  // Ao voltar para a aba, confere o status de novo: o Header não fica congelado
  // enquanto a tela de Configurações (que tem o polling de 5s) está fechada.
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        void refreshWhatsApp({ silent: true });
      }
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [refreshWhatsApp]);

  // Pré-provisionamento: se a loja ainda não tem instância, cria + prepara o QR em
  // background assim que o app carrega. A tela de Configurações abre com o QR pronto
  // (ou com "Preparando conexão...") em vez de esperar o clique.
  useEffect(() => {
    if (whatsappLoading || !whatsapp || whatsapp.id !== null) return;
    if (autoProvisionStartedRef.current) return;

    autoProvisionStartedRef.current = true;
    void provisionWhatsApp().catch(() => {
      // O card de Configurações exibe o erro e oferece "Tentar novamente".
    });
  }, [whatsapp, whatsappLoading, provisionWhatsApp]);

  const updateLeadStage = (id: string, stage: LeadStage) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l));
    apiService.updateLeadStage(id, stage).catch(err => {
      console.warn('Falha ao persistir estágio do lead:', err);
    });
    // If closed or moved to human intervention, sync conversation state
    if (stage === 'fechado') {
      addNotification(`🎉 Parabéns! Venda fechada com sucesso!`);
    } else if (stage === 'intervencao_humana') {
      pauseAIForLead(id, storeSettings.interventionPauseHours);
    }
  };

  const toggleLeadUrgency = (id: string) => {
    const lead = leads.find(l => l.id === id);
    const nextUrgent = !lead?.urgent;
    setLeads(prev => prev.map(l => l.id === id ? { ...l, urgent: nextUrgent } : l));
    apiService.setLeadUrgency(id, nextUrgent, lead?.urgentReason).catch(err => {
      console.warn('Falha ao persistir urgência do lead:', err);
    });
  };

  const appendMessage = (leadId: string, newMsg: ChatMessage) => {
    setConversations(prev => {
      const lead = leads.find(l => l.id === leadId);
      const existing = prev[leadId] || {
        id: `conv-${leadId}`,
        leadId,
        phone: lead?.phone || '',
        leadName: lead?.name || 'Cliente',
        stage: 'atendimento_ia',
        aiStatus: 'active',
        lastMessage: '',
        lastTime: '',
        messages: []
      };

      return {
        ...prev,
        [leadId]: {
          ...existing,
          lastMessage: newMsg.text,
          lastTime: newMsg.timestamp,
          messages: [...existing.messages, newMsg]
        }
      };
    });

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lastInteraction: 'agora' } : l));
  };

  const sendMessage = (leadId: string, text: string, sender: 'client' | 'ai' | 'agent') => {
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      delivered: true,
      read: true
    };

    appendMessage(leadId, newMsg);

    // Persiste no PostgreSQL (se o backend estiver offline, a UI continua funcionando)
    apiService.sendLeadMessage(leadId, text, sender).catch(err => {
      console.warn('Falha ao persistir mensagem na API:', err);
    });

    // Se quem respondeu foi o lojista/atendente humano:
    if (sender === 'agent') {
      pauseAIForLead(leadId, storeSettings.interventionPauseHours);
      addNotification(`Atendimento assumido por humano. IA pausada por ${storeSettings.interventionPauseHours}h.`);
      
      // Registrar log dev
      setDevLogs(prev => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          level: 'info',
          service: 'CRM_Webhook',
          message: `Atendente humano respondeu lead ${leadId}. IA pausada por ${storeSettings.interventionPauseHours}h.`,
          storeId: 'malas-slz'
        },
        ...prev
      ]);
    }
  };

  /**
   * Chama a IA com o histórico real da conversa (persistida no banco) e
   * adiciona a resposta como mensagem do chat. Com persist=false devolve
   * apenas uma sugestão de texto (usada quando a IA está pausada).
   * Lança erro com mensagem amigável quando backend/chave não estão disponíveis.
   */
  const generateAIReplyForLead = async (
    leadId: string,
    options: { persist?: boolean } = {},
  ) => {
    const persist = options.persist ?? true;
    const result = await apiService.generateAIReplyForLead(leadId, { persist });

    if (result.persisted && result.message) {
      appendMessage(leadId, result.message);
    }

    setDevLogs(prev => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        level: 'ai_call',
        service: 'OpenAI',
        message: `IA gerou resposta no chat do lead ${leadId}${persist ? '' : ' (sugestão)'}. Modelo: ${result.model} • ${result.tokensUsed} tokens • ${result.latencyMs}ms.`,
        details: { model: result.model, tokensUsed: result.tokensUsed, latencyMs: result.latencyMs },
        storeId: 'malas-slz'
      },
      ...prev
    ]);

    return {
      response: result.response,
      persisted: result.persisted,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
      model: result.model,
    };
  };

  const pauseAIForLead = (leadId: string, hours = storeSettings.interventionPauseHours) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toLocaleString();
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, aiStatus: 'paused', pausedUntil: until, stage: 'intervencao_humana' } : l));
    setConversations(prev => {
      if (!prev[leadId]) return prev;
      return {
        ...prev,
        [leadId]: {
          ...prev[leadId],
          aiStatus: 'paused',
          pausedUntil: until,
          stage: 'intervencao_humana'
        }
      };
    });
    apiService.setLeadAIStatus(leadId, 'paused', hours).catch(err => {
      console.warn('Falha ao persistir pausa da IA:', err);
    });
  };

  const resumeAIForLead = (leadId: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, aiStatus: 'active', pausedUntil: undefined, stage: 'atendimento_ia' } : l));
    setConversations(prev => {
      if (!prev[leadId]) return prev;
      return {
        ...prev,
        [leadId]: {
          ...prev[leadId],
          aiStatus: 'active',
          pausedUntil: undefined,
          stage: 'atendimento_ia'
        }
      };
    });
    apiService.setLeadAIStatus(leadId, 'active').catch(err => {
      console.warn('Falha ao persistir retomada da IA:', err);
    });
    addNotification('IA reativada com sucesso para este chat!');
  };

  const teachAIFromMessage = (text: string, referenceQuestion = 'Dúvida do cliente no atendimento') => {
    const tempId = `k-${Date.now()}`;
    const newItem: AIKnowledgeItem = {
      id: tempId,
      question: referenceQuestion,
      answer: text,
      createdAt: new Date().toLocaleString(),
      source: 'humano_chat'
    };
    setAiKnowledge(prev => [newItem, ...prev]);
    addNotification('✨ Conhecimento absorvido! A IA aprenderá com esta resposta para os próximos clientes.');

    // Persiste no PostgreSQL: o RAG da IA passa a usar este ensinamento.
    apiService.addKnowledge({
      question: referenceQuestion,
      answer: text,
      source: 'humano_chat',
    }).then(saved => {
      if (saved) {
        setAiKnowledge(prev => prev.map(item => item.id === tempId ? saved : item));
      } else {
        addNotification('⚠️ Não foi possível salvar o conhecimento no banco. Tente novamente.');
      }
    }).catch(() => {
      addNotification('⚠️ Não foi possível salvar o conhecimento no banco. Tente novamente.');
    });

    // Adiciona log
    setDevLogs(prev => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        level: 'info',
        service: 'Gemini',
        message: `Novo chunk de conhecimento incorporado ao RAG da loja malas-slz. Pergunta: "${referenceQuestion.substring(0, 30)}..."`,
        storeId: 'malas-slz'
      },
      ...prev
    ]);
  };

  const removeKnowledge = (id: string) => {
    setAiKnowledge(prev => prev.filter(item => item.id !== id));
    apiService.deleteKnowledge(id).then(ok => {
      if (!ok) {
        addNotification('⚠️ Não foi possível remover o conhecimento do banco.');
      }
    }).catch(() => {
      addNotification('⚠️ Não foi possível remover o conhecimento do banco.');
    });
  };

  const addQuickReply = (reply: Omit<QuickReply, 'id'>) => {
    const tempId = `qr-${Date.now()}`;
    setQuickReplies(prev => [...prev, { ...reply, id: tempId }]);
    addNotification('Resposta rápida cadastrada com sucesso!');

    apiService.createQuickReply(reply).then(saved => {
      setQuickReplies(prev => prev.map(qr => qr.id === tempId ? saved : qr));
    }).catch((err: any) => {
      // Falhou (ex.: atalho duplicado): desfaz o item otimista e avisa o lojista.
      setQuickReplies(prev => prev.filter(qr => qr.id !== tempId));
      addNotification(`⚠️ ${err?.message || 'Não foi possível salvar a resposta rápida no banco.'}`);
    });
  };

  const removeQuickReply = (id: string) => {
    setQuickReplies(prev => prev.filter(qr => qr.id !== id));
    apiService.deleteQuickReply(id).then(ok => {
      if (!ok) {
        addNotification('⚠️ Não foi possível remover a resposta rápida do banco.');
      }
    }).catch(() => {
      addNotification('⚠️ Não foi possível remover a resposta rápida do banco.');
    });
  };

  const updateAIConfig = (newCfg: Partial<AIConfig>) => {
    setAIConfig(prev => ({ ...prev, ...newCfg }));
    apiService.updateAIConfig(newCfg).then(saved => {
      if (!saved) {
        addNotification('⚠️ Configuração aplicada na tela, mas não foi salva no banco.');
      }
    }).catch(() => {
      addNotification('⚠️ Configuração aplicada na tela, mas não foi salva no banco.');
    });
    addNotification('Configurações da IA atualizadas!');
  };

  const updateStoreSettings = (newSettings: Partial<StoreSettings>) => {
    setStoreSettings(prev => ({ ...prev, ...newSettings }));
    apiService.updateStoreSettings(newSettings).catch(err => {
      console.warn('Falha ao sincronizar configurações da loja com a API:', err);
    });
    addNotification('Dados da loja e personalização salvos!');
  };

  const [products, setProducts] = useState<Product[]>(initialProducts);

  const addProduct = (prod: Omit<Product, 'id'>) => {
    const tempId = `prod-${Date.now()}`;
    const optimisticProd: Product = { ...prod, id: tempId };
    setProducts(prev => [optimisticProd, ...prev]);
    addNotification(`Produto "${optimisticProd.name}" cadastrado com sucesso!`);

    apiService.createProduct(prod).then(persisted => {
      if (persisted) {
        setProducts(prev => prev.map(p => p.id === tempId ? persisted : p));
      }
    }).catch(err => {
      console.warn('Falha ao persistir produto na API:', err);
    });
  };

  const updateProduct = (id: string, updated: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    apiService.updateProduct(id, updated).catch(err => {
      console.warn('Falha ao atualizar produto na API:', err);
    });
    addNotification('Produto atualizado!');
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    apiService.deleteProduct(id).catch(err => {
      console.warn('Falha ao excluir produto na API:', err);
    });
    addNotification('Produto removido do catálogo.');
  };

  const updateProductStock = (id: string, delta: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const nextStock = Math.max(0, p.stock + delta);
        return { ...p, stock: nextStock };
      }
      return p;
    }));
    apiService.updateStock(id, delta).catch(err => {
      console.warn('Falha ao sincronizar alteração de estoque com a API:', err);
    });
  };

  const toggleCampaign = (id: string) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
  };

  /**
   * Recarrega os logs técnicos do backend (Área Dev), opcionalmente filtrando
   * por nível/serviço/busca. Também atualiza o resumo de tokens e erros.
   */
  const refreshDevLogs = async (filters: {
    level?: string;
    service?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<DevLogsResponse | null> => {
    const data = await apiService.getDevLogs(filters);

    if (!data) {
      addNotification('⚠️ Não foi possível carregar os logs técnicos do backend.');
      return null;
    }

    setDevLogs(data.logs);
    setDevLogSummary(data.summary);
    return data;
  };

  return (
    <CRMContext.Provider value={{
      currentView,
      setCurrentView,
      leads,
      updateLeadStage,
      toggleLeadUrgency,
      products,
      addProduct,
      updateProduct,
      deleteProduct,
      updateProductStock,
      conversations,
      selectedChatLeadId,
      setSelectedChatLeadId,
      sendMessage,
      generateAIReplyForLead,
      pauseAIForLead,
      resumeAIForLead,
      teachAIFromMessage,
      quickReplies,
      addQuickReply,
      removeQuickReply,
      aiConfig,
      updateAIConfig,
      aiKnowledge,
      removeKnowledge,
      storeSettings,
      updateStoreSettings,
      campaigns,
      toggleCampaign,
      devLogs,
      devLogSummary,
      refreshDevLogs,
      devMode,
      setDevMode,
      addNotification,
      notification,
      whatsapp,
      whatsappLoading,
      whatsappError,
      whatsappProvisioning,
      refreshWhatsApp,
      createWhatsApp,
      connectWhatsApp,
      logoutWhatsApp,
      restartWhatsApp,
      provisionWhatsApp
    }}>
      {children}
    </CRMContext.Provider>
  );
};

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error('useCRM deve ser usado dentro de um CRMProvider');
  }
  return context;
};
