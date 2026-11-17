import React, { createContext, useContext, useState, useEffect } from 'react';
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
  pauseAIForLead: (leadId: string, hours?: number) => void;
  resumeAIForLead: (leadId: string) => void;
  teachAIFromMessage: (text: string, referenceQuestion?: string) => void;
  quickReplies: QuickReply[];
  addQuickReply: (reply: Omit<QuickReply, 'id'>) => void;
  aiConfig: AIConfig;
  updateAIConfig: (config: Partial<AIConfig>) => void;
  aiKnowledge: AIKnowledgeItem[];
  storeSettings: StoreSettings;
  updateStoreSettings: (settings: Partial<StoreSettings>) => void;
  campaigns: FollowUpCampaign[];
  toggleCampaign: (id: string) => void;
  devLogs: DevLogItem[];
  devMode: boolean;
  setDevMode: (active: boolean) => void;
  addNotification: (msg: string) => void;
  notification: string | null;
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
  const [devMode, setDevMode] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

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
        const [backendProducts, backendStore] = await Promise.all([
          apiService.getProducts(),
          apiService.getStoreSettings(),
        ]);

        if (!isMounted) return;

        if (backendProducts && backendProducts.length > 0) {
          setProducts(backendProducts);
        }
        if (backendStore) {
          setStoreSettings(backendStore);
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

  const addNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const updateLeadStage = (id: string, stage: LeadStage) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l));
    // If closed or moved to human intervention, sync conversation state
    if (stage === 'fechado') {
      addNotification(`🎉 Parabéns! Venda fechada com sucesso!`);
    } else if (stage === 'intervencao_humana') {
      pauseAIForLead(id, storeSettings.interventionPauseHours);
    }
  };

  const toggleLeadUrgency = (id: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, urgent: !l.urgent } : l));
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

    setConversations(prev => {
      const existing = prev[leadId] || {
        id: `conv-${leadId}`,
        leadId,
        phone: leads.find(l => l.id === leadId)?.phone || '',
        leadName: leads.find(l => l.id === leadId)?.name || 'Cliente',
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
          lastMessage: text,
          lastTime: newMsg.timestamp,
          messages: [...existing.messages, newMsg]
        }
      };
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
    addNotification('IA reativada com sucesso para este chat!');
  };

  const teachAIFromMessage = (text: string, referenceQuestion = 'Dúvida do cliente no atendimento') => {
    const newItem: AIKnowledgeItem = {
      id: `k-${Date.now()}`,
      question: referenceQuestion,
      answer: text,
      createdAt: new Date().toLocaleString(),
      source: 'humano_chat'
    };
    setAiKnowledge(prev => [newItem, ...prev]);
    addNotification('✨ Conhecimento absorvido! A IA aprenderá com esta resposta para os próximos clientes.');

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

  const addQuickReply = (reply: Omit<QuickReply, 'id'>) => {
    setQuickReplies(prev => [...prev, { ...reply, id: `qr-${Date.now()}` }]);
    addNotification('Resposta rápida cadastrada com sucesso!');
  };

  const updateAIConfig = (newCfg: Partial<AIConfig>) => {
    setAIConfig(prev => ({ ...prev, ...newCfg }));
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
      pauseAIForLead,
      resumeAIForLead,
      teachAIFromMessage,
      quickReplies,
      addQuickReply,
      aiConfig,
      updateAIConfig,
      aiKnowledge,
      storeSettings,
      updateStoreSettings,
      campaigns,
      toggleCampaign,
      devLogs,
      devMode,
      setDevMode,
      addNotification,
      notification
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
