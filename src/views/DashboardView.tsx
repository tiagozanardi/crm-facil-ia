import React from 'react';
import { useCRM } from '../context/CRMContext';
import { 
  Zap, 
  MessageSquare, 
  TrendingUp, 
  Bot, 
  Clock, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Users, 
  DollarSign, 
  ChevronRight,
  Send
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { 
    leads, 
    setCurrentView, 
    setSelectedChatLeadId, 
    pauseAIForLead, 
    updateLeadStage,
    storeSettings
  } = useCRM();

  const urgentLeads = leads.filter(l => l.urgent);
  const activeLeadsCount = leads.filter(l => l.stage !== 'fechado' && l.stage !== 'perdido').length;
  const closedLeads = leads.filter(l => l.stage === 'fechado');
  const totalClosedValue = closedLeads.reduce((acc, curr) => acc + curr.estimatedValue, 0);

  const handleOpenChat = (leadId: string) => {
    setSelectedChatLeadId(leadId);
    setCurrentView('chats');
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* 1. SEÇÃO DE FOCO & ATENÇÃO: Leads Mais Urgentes */}
      <section className="bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-transparent border border-amber-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
                Foco do Dia: Leads que Precisam de Atenção
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                  {urgentLeads.length} pendentes
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Clientes em fase final de decisão, solicitações de desconto Pix ou que pediram para falar com atendente humano.
              </p>
            </div>
          </div>

          <button 
            onClick={() => setCurrentView('kanban')}
            className="text-xs font-semibold text-brand-500 hover:text-brand-600 flex items-center gap-1 self-start md:self-auto"
          >
            Ver todos no Kanban
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Cards de Atenção Urgente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {urgentLeads.map((lead) => (
            <div 
              key={lead.id}
              className="bg-white rounded-xl p-4 border border-amber-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-graphite-900">{lead.name}</h3>
                    <p className="text-xs text-gray-500">{lead.phone}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    R$ {lead.estimatedValue.toFixed(2)}
                  </span>
                </div>

                <div className="mt-2.5 p-2 rounded-lg bg-amber-50/60 border border-amber-100 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{lead.urgentReason || 'Cliente aguardando resposta sobre fechamento.'}</span>
                </div>

                <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Última interação: <strong>{lead.lastInteraction}</strong></span>
                  <span>•</span>
                  <span className="text-brand-500 font-medium">{lead.interest}</span>
                </div>
              </div>

              {/* Ações Rápidas */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    pauseAIForLead(lead.id, storeSettings.interventionPauseHours);
                    handleOpenChat(lead.id);
                  }}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Assumir no WhatsApp
                </button>

                <button
                  onClick={() => updateLeadStage(lead.id, 'fechado')}
                  className="py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-colors flex items-center gap-1"
                  title="Marcar venda como concluída"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Fechar Venda
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. ESTATÍSTICAS RÁPIDAS & INSIGHTS ACIONÁVEIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Leads Ativos */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Leads em Atendimento</span>
            <Users className="w-4 h-4 text-brand-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-graphite-900">{activeLeadsCount}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <span>+3 novos hoje</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tempo de Resposta da IA */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Tempo Médio Resposta</span>
            <Bot className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-graphite-900">4 seg</div>
            <div className="text-[11px] text-blue-600 font-medium mt-0.5">
              98% respondidos pela IA
            </div>
          </div>
        </div>

        {/* Card 3: Taxa de Conversão */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Taxa de Conversão</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-graphite-900">22.4%</div>
            <div className="text-[11px] text-purple-600 font-medium mt-0.5">
              Acima da média de e-commerce
            </div>
          </div>
        </div>

        {/* Card 4: Faturamento do Mês */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-medium">Vendas Concluídas</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-graphite-900">
              R$ {totalClosedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
              {closedLeads.length} pedidos faturados
            </div>
          </div>
        </div>

      </div>

      {/* 3. INSIGHTS INTELIGENTES DA IA & RECOMENDAÇÕES */}
      <section className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-brand-500" />
          <h2 className="text-sm font-bold text-graphite-900">
            Insights & Sugestões de Otimização da IA
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-600">
            Recomendado para Malas SLZ
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Dica 1: Comunicação da IA */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 hover:border-brand-200 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-800">Ajustar Tom para Clientes de Bordo</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">Tom Consultivo</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                68% dos seus clientes têm dúvidas sobre as regras de 10kg da ANAC (Latam/Gol/Azul). Sugerimos ativar o tom <strong>Consultivo</strong> na IA para passar mais segurança técnica antes do preço.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Impacto previsto: +15% de fechamento</span>
              <button 
                onClick={() => setCurrentView('ai_config')}
                className="text-xs font-semibold text-brand-500 hover:text-brand-600 flex items-center gap-1"
              >
                Ajustar Linguagem da IA
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Dica 2: Follow-up Automático */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 hover:border-brand-200 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-800">Reaquecer Orçamentos Parados (+24h)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Follow-up 24h</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Existem 4 clientes que receberam fotos das malas de viagem mas não responderam há mais de 24 horas. Disparar a campanha de follow-up com oferta de frete grátis para São Luís.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Tempo estimado: 1 clique</span>
              <button 
                onClick={() => setCurrentView('follow_up')}
                className="text-xs font-semibold text-brand-500 hover:text-brand-600 flex items-center gap-1"
              >
                Ver Campanhas
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 4. ATALHOS RÁPIDOS & FUNIL RESUMIDO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Card de Acesso aos Chats */}
        <div 
          onClick={() => setCurrentView('chats')}
          className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs hover:border-brand-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
              Ver conversas <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
          <h3 className="text-sm font-bold text-graphite-900">Atendimento WhatsApp</h3>
          <p className="text-xs text-gray-500 mt-1">
            Pesquise por número, use respostas rápidas e intervenha manualmente com 1 clique.
          </p>
        </div>

        {/* Card de Configuração de Marca / Cores */}
        <div 
          onClick={() => setCurrentView('settings')}
          className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs hover:border-brand-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-xs text-brand-500 font-bold flex items-center gap-1">
              Personalizar <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
          <h3 className="text-sm font-bold text-graphite-900">Cores & Marca (White-label)</h3>
          <p className="text-xs text-gray-500 mt-1">
            Paleta terracota extraída da logo da loja. Altere logos e temas para outros clientes.
          </p>
        </div>

        {/* Card de Redirecionamento para Grupo VIP */}
        <div 
          onClick={() => window.open(storeSettings.vipGroupLink, '_blank')}
          className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs hover:border-brand-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-xs text-purple-600 font-bold flex items-center gap-1">
              Abrir Link <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
          <h3 className="text-sm font-bold text-graphite-900">Grupo VIP de Fechamento</h3>
          <p className="text-xs text-gray-500 mt-1">
            Canal exclusivo para onde a IA direciona clientes que buscam descontos e novidades.
          </p>
        </div>

      </div>

    </div>
  );
};
