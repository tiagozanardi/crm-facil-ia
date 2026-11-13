export type ProductCategory = 
  | 'bordo' 
  | 'media_grande' 
  | 'frasqueira' 
  | 'mochila' 
  | 'acessorios';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  pixPrice?: number;
  stock: number;
  minStock?: number;
  dimensions?: string; // Ex: "55 x 35 x 25 cm (Padrão ANAC)"
  colors: string[];
  imageUrl: string;
  active: boolean;
  sku?: string;
  description?: string;
}

export type LeadStage = 
  | 'novo'
  | 'atendimento_ia'
  | 'intervencao_humana'
  | 'em_negociacao'
  | 'fechado'
  | 'perdido';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  interest: string; // Ex: "Mala de Bordo Rose Gold 10kg"
  estimatedValue: number;
  stage: LeadStage;
  aiStatus: 'active' | 'paused' | 'disabled';
  pausedUntil?: string;
  lastInteraction: string;
  urgent: boolean;
  urgentReason?: string;
  unreadCount?: number;
  tags: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'client' | 'ai' | 'agent';
  text: string;
  timestamp: string;
  delivered?: boolean;
  read?: boolean;
  isLearned?: boolean; // Se foi adicionado ao conhecimento da IA
}

export interface ChatConversation {
  id: string;
  leadId: string;
  phone: string;
  leadName: string;
  stage: LeadStage;
  aiStatus: 'active' | 'paused';
  pausedUntil?: string;
  lastMessage: string;
  lastTime: string;
  messages: ChatMessage[];
}

export interface QuickReply {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: 'medidas' | 'precos' | 'envio' | 'garantia' | 'pagamento';
}

export interface AIKnowledgeItem {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  source: 'humano_chat' | 'manual';
}

export interface AIConfig {
  tone: 'consultivo' | 'vendedor' | 'direto' | 'afetuoso';
  emojiIntensity: 'none' | 'moderate' | 'expressive';
  slangType: 'neutro' | 'regional_slz' | 'descontraido' | 'formal';
  ctaStrategy: 'link_pagamento' | 'direcionar_loja_fisica' | 'grupo_vip_whatsapp' | 'consultor_humano';
  maxWordsPerReply: number;
  activeHours: {
    start: string;
    end: string;
    respondOffHours: boolean;
  };
}

export interface StoreSettings {
  name: string;
  segment: string;
  whatsappNumber: string;
  address: string;
  logoUrl: string;
  interventionPauseHours: number; // Padrão: 24h
  vipGroupLink: string;
  theme: {
    primaryColor: string;
    accentColor: string;
    surfaceColor: string;
  };
}

export interface FollowUpCampaign {
  id: string;
  title: string;
  triggerHours: number;
  targetStage: LeadStage;
  messageTemplate: string;
  active: boolean;
  conversionsCount: number;
}

export interface DevLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'ai_call';
  service: 'Evolution_API' | 'OpenAI' | 'Gemini' | 'CRM_Webhook' | 'Token_Billing';
  message: string;
  details?: Record<string, any>;
  storeId: string;
}
