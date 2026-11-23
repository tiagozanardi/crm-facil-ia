import React, { useEffect, useRef, useState } from 'react';
import { useCRM } from '../context/CRMContext';
import { Product, ChatMessage } from '../types';
import { 
  Search, 
  Send, 
  Bot, 
  User, 
  Clock, 
  Sparkles, 
  Share2, 
  Zap, 
  AlertCircle, 
  Check,
  CheckCheck, 
  BookOpen, 
  SlidersHorizontal,
  ChevronLeft,
  X,
  ExternalLink,
  Plus,
  Package,
  Loader2,
  WifiOff
} from 'lucide-react';

/** Polling do inbox (S5b): 5 s, somente com a aba visível. */
const CHAT_POLL_INTERVAL_MS = 5_000;
/** Distância (px) do fim considerada "colado no fim" para o auto-scroll. */
const STICK_TO_BOTTOM_PX = 80;

/** Ticks de entrega reais (S4/S5b) para mensagens da IA/atendente. */
function renderMessageStatus(status?: ChatMessage['status']) {
  switch (status) {
    case 'PENDING':
      return (
        <span title="Enviando pelo WhatsApp..." aria-label="Enviando pelo WhatsApp">
          <Clock className="w-3 h-3 opacity-70" />
        </span>
      );
    case 'SENT':
      return (
        <span title="Enviado" aria-label="Enviado">
          <Check className="w-3 h-3 opacity-80" />
        </span>
      );
    case 'DELIVERED':
      return (
        <span title="Entregue" aria-label="Entregue">
          <CheckCheck className="w-3 h-3 opacity-80" />
        </span>
      );
    case 'READ':
      return (
        <span title="Lido" aria-label="Lido" className="text-sky-200">
          <CheckCheck className="w-3 h-3" />
        </span>
      );
    case 'FAILED':
      return (
        <span title="Falha ao enviar pelo WhatsApp" aria-label="Falha no envio" className="text-red-200">
          <AlertCircle className="w-3 h-3" />
        </span>
      );
    default:
      return null;
  }
}

export const ChatView: React.FC = () => {
  const { 
    leads, 
    conversations, 
    selectedChatLeadId, 
    setSelectedChatLeadId, 
    sendMessage, 
    refreshConversations,
    generateAIReplyForLead,
    pauseAIForLead, 
    resumeAIForLead, 
    teachAIFromMessage, 
    quickReplies,
    products,
    storeSettings,
    whatsapp,
    refreshWhatsApp,
    setCurrentView,
    addNotification
  } = useCRM();

  const [inputMessage, setInputMessage] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [showQuickRepliesModal, setShowQuickRepliesModal] = useState(false);
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [learningMessageId, setLearningMessageId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Filtro de conversas por telefone ou nome
  const filteredLeads = leads.filter(l => 
    l.phone.replace(/\D/g, '').includes(searchPhone.replace(/\D/g, '')) ||
    l.name.toLowerCase().includes(searchPhone.toLowerCase())
  );

  const activeLead = leads.find(l => l.id === selectedChatLeadId) || leads[0];
  const activeConversation = selectedChatLeadId ? conversations[selectedChatLeadId] : null;

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const activeMessageCount = activeConversation?.messages.length ?? 0;

  // S5b: aviso no topo do chat quando o WhatsApp não está pronto (mensagens não entram/saem).
  const whatsappBanner =
    !whatsapp || whatsapp.status === 'CONNECTED'
      ? null
      : whatsapp.status === 'CONNECTING'
        ? {
            wrapper: 'bg-amber-50 border-amber-200 text-amber-800',
            icon: 'text-amber-600',
            title: 'WhatsApp aguardando conexão:',
            text: ' escaneie o QR Code em Configurações para as mensagens chegarem.',
          }
        : {
            wrapper: 'bg-red-50 border-red-200 text-red-800',
            icon: 'text-red-600',
            title: 'WhatsApp desconectado:',
            text: ' as mensagens não chegam nem saem pelo CRM.',
          };

  // S5b: polling de 5 s em /api/conversations, somente com a aba visível.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let tickCount = 0;

    const tick = async () => {
      if (cancelled || document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      try {
        await refreshConversations({ silent: true });

        // A cada ~30 s revalida o status da conexão: o banner do topo reflete quedas/retomadas.
        tickCount += 1;
        if (tickCount % 6 === 0) {
          void refreshWhatsApp({ silent: true });
        }
      } finally {
        inFlight = false;
      }
    };

    // Primeira atualização ao abrir o chat (não espera os 5 s).
    void tick();

    const interval = window.setInterval(() => {
      void tick();
    }, CHAT_POLL_INTERVAL_MS);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshConversations, refreshWhatsApp]);

  const scrollMessagesToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  // Mensagens novas (inclusive as que chegam pelo polling) acompanham o fim se o usuário já estava lá.
  useEffect(() => {
    if (stickToBottomRef.current) scrollMessagesToBottom('smooth');
  }, [activeMessageCount]);

  // Troca de conversa: começa sempre no fim, como no WhatsApp.
  useEffect(() => {
    stickToBottomRef.current = true;
    scrollMessagesToBottom('auto');
  }, [selectedChatLeadId]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    stickToBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < STICK_TO_BOTTOM_PX;
  };

  const handleSendHumanMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeLead) return;

    sendMessage(activeLead.id, inputMessage.trim(), 'agent');
    setInputMessage('');
  };

  const handleApplyQuickReply = (text: string) => {
    setInputMessage(text);
    setShowQuickRepliesModal(false);
  };

  const handleInsertProduct = (p: Product) => {
    const text = `✨ *${p.name}*\n📏 Medidas: ${p.dimensions || 'Padrão'}\n🎨 Cores disponíveis: ${p.colors.join(', ')}\n💰 Valor: R$ ${p.price.toFixed(2)}${p.pixPrice ? ` (ou R$ ${p.pixPrice.toFixed(2)} à vista no Pix com 7% OFF)` : ''}\n📦 Temos pronta entrega na nossa loja! Deseja que eu reserve para você?`;
    setInputMessage(text);
    setShowProductsModal(false);
  };

  const handleTeachAI = (msgText: string, msgId: string) => {
    teachAIFromMessage(msgText, `Dúvida do cliente atendido em ${activeLead?.name}`);
    setLearningMessageId(msgId);
    setTimeout(() => setLearningMessageId(null), 3000);
  };

  // Gera uma resposta com GPT usando o catálogo + histórico real da conversa.
  // Se a IA estiver pausada (intervenção humana), vira sugestão no campo de texto.
  const handleAskAI = async () => {
    if (!activeLead || aiLoading) return;

    const isPaused = activeLead.aiStatus === 'paused';
    setAiLoading(true);

    try {
      const result = await generateAIReplyForLead(activeLead.id, { persist: !isPaused });

      if (result.persisted) {
        addNotification(
          `✨ IA respondeu com o catálogo e o histórico (${result.tokensUsed} tokens • ${result.latencyMs}ms).`,
        );
      } else {
        setInputMessage(result.response);
        addNotification('💡 Sugestão da IA inserida no campo. Revise e envie como atendente.');
      }
    } catch (err: any) {
      addNotification(`❌ ${err?.message || 'Não foi possível gerar a resposta da IA.'}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden flex flex-col md:flex-row h-[calc(100vh-140px)] min-h-[550px] mb-16 md:mb-0">
      
      {/* COLUNA ESQUERDA: LISTA DE CONVERSAS (WhatsApp Inbox) */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col bg-gray-50/50 ${selectedChatLeadId && 'hidden md:flex'}`}>
        
        {/* Busca por número ou nome */}
        <div className="p-3 border-b border-gray-200 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Pesquisar por número ou nome..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filteredLeads.map((lead) => {
            const isSelected = lead.id === selectedChatLeadId;
            const conv = conversations[lead.id];
            const isAiPaused = lead.aiStatus === 'paused';

            return (
              <div
                key={lead.id}
                onClick={() => setSelectedChatLeadId(lead.id)}
                className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors relative ${
                  isSelected ? 'bg-brand-50/70 border-l-4 border-brand-500' : 'hover:bg-gray-100/70'
                }`}
              >
                {/* Avatar com status de IA ou Intervenção */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-brand-100/80 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {lead.name.substring(0, 2).toUpperCase()}
                  </div>
                  {isAiPaused ? (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] shadow-xs" title="Humano assumiu">
                      <Clock className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] shadow-xs" title="IA Ativa">
                      <Bot className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-graphite-900 truncate">{lead.name}</h4>
                    <span className="text-[10px] text-gray-400 shrink-0">{conv?.lastTime || lead.lastInteraction}</span>
                  </div>

                  <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">{lead.phone}</p>

                  <p className="text-xs text-gray-600 truncate mt-1">
                    {conv?.lastMessage || lead.interest}
                  </p>

                  {/* Badges de urgência ou status */}
                  <div className="mt-1.5 flex items-center gap-1">
                    {lead.urgent && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                        Atenção
                      </span>
                    )}
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-gray-200/70 text-gray-700">
                      R$ {lead.estimatedValue.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COLUNA DIREITA: CONVERSA ATIVA */}
      {activeLead ? (
        <div className={`flex-1 flex flex-col bg-[#FAF9F6] ${!selectedChatLeadId && 'hidden md:flex'}`}>
          
          {/* Top Bar da Conversa */}
          <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              {/* Botão voltar no mobile */}
              <button 
                onClick={() => setSelectedChatLeadId(null)}
                className="md:hidden p-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold text-xs">
                {activeLead.name.substring(0, 2).toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-gray-900">{activeLead.name}</h3>
                  <span className="text-[11px] text-gray-500 font-medium">{activeLead.phone}</span>
                </div>
                <div className="text-[11px] text-brand-600 font-medium flex items-center gap-1.5">
                  <span>{activeLead.interest || 'Novo contato'}</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-gray-500 font-semibold">R$ {activeLead.estimatedValue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Ações Rápidas: Intervenção & Redirecionamento */}
            <div className="flex items-center gap-2">
              
              {/* Status da IA e Botão de Pausa / Retomada */}
              {activeLead.aiStatus === 'paused' ? (
                <button
                  onClick={() => resumeAIForLead(activeLead.id)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="A IA está pausada. Clique para reativar o atendimento automático."
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Reativar IA</span>
                </button>
              ) : (
                <button
                  onClick={() => pauseAIForLead(activeLead.id, storeSettings.interventionPauseHours)}
                  className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-xs font-semibold flex items-center gap-1 transition-colors"
                  title={`Pausar respostas automáticas da IA por ${storeSettings.interventionPauseHours}h`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Pausar IA ({storeSettings.interventionPauseHours}h)</span>
                </button>
              )}

              {/* Botão de Redirecionar para Grupo VIP / Fechamento */}
              <button
                onClick={() => {
                  window.open(storeSettings.vipGroupLink, '_blank');
                }}
                className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Redirecionar para Grupo VIP de Descontos no WhatsApp"
              >
                <Share2 className="w-3.5 h-3.5 text-purple-600" />
                <span className="hidden lg:inline">Grupo VIP</span>
              </button>

            </div>
          </div>

          {/* S5b: WhatsApp não conectado — as mensagens não entram nem saem */}
          {whatsappBanner && (
            <div
              className={`border-b px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${whatsappBanner.wrapper}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <WifiOff className={`w-4 h-4 shrink-0 ${whatsappBanner.icon}`} />
                <span>
                  <strong>{whatsappBanner.title}</strong>
                  {whatsappBanner.text}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView('settings')}
                className="shrink-0 text-xs font-bold underline hover:opacity-80 self-start sm:self-auto"
              >
                Abrir Conexão WhatsApp
              </button>
            </div>
          )}

          {/* Banner de Aviso de Intervenção Ativa */}
          {activeLead.aiStatus === 'paused' && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Atendimento Humano em andamento:</strong> A IA está em silêncio até {activeLead.pausedUntil || '24h'}.
                </span>
              </div>
              <button 
                onClick={() => resumeAIForLead(activeLead.id)}
                className="text-xs font-bold text-amber-900 underline hover:text-amber-700 ml-2"
              >
                Devolver para IA
              </button>
            </div>
          )}

          {/* Área das Mensagens (Scroll) */}
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {activeConversation?.messages.map((msg) => {
              const isClient = msg.sender === 'client';
              const isAi = msg.sender === 'ai';
              const isAgent = msg.sender === 'agent';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isClient ? 'items-start' : 'items-end'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-xs relative group ${
                    isClient 
                      ? 'bg-white text-gray-800 border border-gray-200 rounded-tl-none' 
                      : isAi
                        ? 'bg-brand-500 text-white rounded-tr-none'
                        : 'bg-emerald-600 text-white rounded-tr-none'
                  } ${msg.status === 'FAILED' ? 'ring-1 ring-red-300' : ''}`}>
                    {/* Badge do Remetente */}
                    <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 mb-1 font-semibold">
                      <span className="flex items-center gap-1">
                        {isClient ? <User className="w-3 h-3" /> : isAi ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {isClient ? activeLead.name : isAi ? 'IA Malas SLZ' : 'Você (Atendente)'}
                      </span>
                      <span className="flex items-center gap-1">
                        {msg.timestamp}
                        {!isClient && renderMessageStatus(msg.status)}
                      </span>
                    </div>

                    {/* Texto da Mensagem */}
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                    {/* Recurso de Aprendizado da IA: Quando o humano respondeu */}
                    {isAgent && (
                      <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center justify-between text-[10px]">
                        <button
                          onClick={() => handleTeachAI(msg.text, msg.id)}
                          className="flex items-center gap-1 font-bold text-amber-200 hover:text-white transition-colors"
                          title="Adicionar esta resposta ao conhecimento da IA para atender futuros clientes"
                        >
                          <Sparkles className="w-3 h-3" />
                          {learningMessageId === msg.id ? 'Aprendido!' : 'Ensinar IA com esta resposta'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra de Entrada de Mensagem e Respostas Rápidas */}
          <div className="p-3 bg-white border-t border-gray-200">
            {/* Atalhos Rápidos Clicáveis */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                type="button"
                onClick={handleAskAI}
                disabled={aiLoading}
                className="shrink-0 px-2.5 py-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[11px] font-bold border border-brand-600 hover:from-brand-600 hover:to-brand-700 disabled:opacity-60 disabled:cursor-wait flex items-center gap-1 shadow-xs transition-all"
                title={
                  activeLead.aiStatus === 'paused'
                    ? 'IA pausada por intervenção humana: gera uma sugestão para você revisar e enviar'
                    : 'Gerar resposta automática da IA com o catálogo e o histórico da conversa'
                }
              >
                {aiLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {aiLoading ? 'IA pensando...' : 'Responder com IA'}
              </button>

              <button
                type="button"
                onClick={() => setShowQuickRepliesModal(true)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 text-[11px] font-semibold border border-brand-200 hover:bg-brand-100 flex items-center gap-1 transition-colors"
              >
                <BookOpen className="w-3 h-3 text-brand-500" />
                Respostas Rápidas
              </button>

              <button
                type="button"
                onClick={() => setShowProductsModal(true)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
              >
                <Package className="w-3 h-3 text-emerald-600" />
                Enviar Produto / Estoque
              </button>

              {quickReplies.slice(0, 3).map((qr) => (
                <button
                  key={qr.id}
                  type="button"
                  onClick={() => setInputMessage(qr.content)}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px] hover:bg-gray-200 transition-colors truncate max-w-[180px]"
                  title={qr.content}
                >
                  {qr.title}
                </button>
              ))}
            </div>

            {/* Formulário de Envio */}
            <form onSubmit={handleSendHumanMessage} className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Digite sua resposta humana (ao enviar, a IA pausa automaticamente)..."
                className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="p-2.5 rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
                title="Enviar como atendente humano"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center p-8 text-center text-gray-400">
          Selecione uma conversa ao lado para visualizar os detalhes
        </div>
      )}

      {/* MODAL DE RESPOSTAS RÁPIDAS */}
      {showQuickRepliesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-brand-500" />
                <h3 className="text-sm font-bold text-gray-900">Respostas Rápidas Cadastradas</h3>
              </div>
              <button 
                onClick={() => setShowQuickRepliesModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {quickReplies.map((qr) => (
                <div 
                  key={qr.id}
                  onClick={() => handleApplyQuickReply(qr.content)}
                  className="p-3 rounded-xl border border-gray-200 hover:border-brand-500 hover:bg-brand-50/40 cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 group-hover:text-brand-600">{qr.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{qr.shortcut}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{qr.content}</p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowQuickRepliesModal(false)}
                className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE PRODUTO DO ESTOQUE */}
      {showProductsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-900">Selecionar Produto do Estoque para Enviar</h3>
              </div>
              <button 
                onClick={() => setShowProductsModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 py-2">
              Clique em um produto abaixo para montar a proposta formatada com foto, medidas e valor Pix direto no chat:
            </p>

            <div className="flex-1 overflow-y-auto py-2 space-y-2.5">
              {products.map((p) => (
                <div 
                  key={p.id}
                  onClick={() => handleInsertProduct(p)}
                  className="p-3 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/30 cursor-pointer transition-all flex items-center gap-3 group"
                >
                  <img 
                    src={p.imageUrl} 
                    alt={p.name} 
                    className="w-14 h-14 rounded-lg object-cover border border-gray-200 shrink-0" 
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo-malas-slz.jpg'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-900 truncate group-hover:text-emerald-700">{p.name}</h4>
                      <span className="text-xs font-extrabold text-graphite-900">R$ {p.price.toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate mt-0.5">{p.dimensions || p.category}</div>
                    <div className="flex items-center justify-between mt-1 text-[10px]">
                      <span className="text-emerald-700 font-bold">Pix: R$ {p.pixPrice?.toFixed(2)}</span>
                      <span className={`px-1.5 py-0.2 rounded font-semibold ${p.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {p.stock} un. em estoque
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowProductsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
