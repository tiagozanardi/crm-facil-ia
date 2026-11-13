import React from 'react';
import { useCRM } from '../context/CRMContext';
import { LeadStage, Lead } from '../types';
import { 
  Columns3, 
  MessageSquare, 
  Zap, 
  Bot, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  ArrowRight,
  MoreVertical,
  Plus
} from 'lucide-react';

export const KanbanView: React.FC = () => {
  const { 
    leads, 
    updateLeadStage, 
    setSelectedChatLeadId, 
    setCurrentView,
    pauseAIForLead,
    storeSettings
  } = useCRM();

  const columns: { id: LeadStage; title: string; color: string; badge: string }[] = [
    { id: 'novo', title: 'Novos Contatos', color: 'border-blue-400 bg-blue-50/40', badge: 'bg-blue-100 text-blue-800' },
    { id: 'atendimento_ia', title: 'Atendimento IA', color: 'border-brand-500 bg-brand-50/40', badge: 'bg-brand-100 text-brand-800' },
    { id: 'intervencao_humana', title: 'Intervenção Humana', color: 'border-amber-400 bg-amber-50/40', badge: 'bg-amber-100 text-amber-800' },
    { id: 'em_negociacao', title: 'Em Negociação', color: 'border-purple-400 bg-purple-50/40', badge: 'bg-purple-100 text-purple-800' },
    { id: 'fechado', title: 'Venda Fechada', color: 'border-emerald-400 bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-800' },
  ];

  const handleOpenChat = (leadId: string) => {
    setSelectedChatLeadId(leadId);
    setCurrentView('chats');
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      
      {/* Header do Kanban */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <Columns3 className="w-5 h-5 text-brand-500" />
            Quadro Kanban de Atendimento
          </h2>
          <p className="text-xs text-gray-500">
            Arraste ou selecione a fase do lead para manter seu pipeline de vendas atualizado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Total: <strong>{leads.length} leads</strong></span>
        </div>
      </div>

      {/* Grid de Colunas do Kanban (Rolagem horizontal fluida no mobile) */}
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x">
        {columns.map((col) => {
          const colLeads = leads.filter(l => l.stage === col.id);
          const totalColValue = colLeads.reduce((acc, curr) => acc + curr.estimatedValue, 0);

          return (
            <div 
              key={col.id} 
              className={`w-72 sm:w-80 shrink-0 flex flex-col rounded-2xl border ${col.color} p-3 snap-center max-h-[calc(100vh-210px)]`}
            >
              {/* Cabeçalho da Coluna */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-200/60 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-gray-800">{col.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badge}`}>
                    {colLeads.length}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-gray-600">
                  R$ {totalColValue.toFixed(0)}
                </span>
              </div>

              {/* Lista de Cards da Coluna */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {colLeads.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                    Nenhum lead nesta fase
                  </div>
                ) : (
                  colLeads.map((lead) => (
                    <div 
                      key={lead.id}
                      className={`bg-white rounded-xl p-3.5 border shadow-xs hover:shadow-md transition-all relative ${
                        lead.urgent ? 'border-amber-300 ring-1 ring-amber-300/50' : 'border-gray-200/90'
                      }`}
                    >
                      {/* Urgência Tag */}
                      {lead.urgent && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md mb-2 border border-amber-200 w-fit">
                          <Zap className="w-3 h-3 fill-amber-500 text-amber-600" />
                          <span>ATENÇÃO: {lead.urgentReason || 'Urgente'}</span>
                        </div>
                      )}

                      {/* Dados do Lead */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-graphite-900">{lead.name}</h4>
                          <p className="text-[11px] text-gray-500">{lead.phone}</p>
                        </div>
                        <span className="text-xs font-bold text-brand-600">
                          R$ {lead.estimatedValue.toFixed(2)}
                        </span>
                      </div>

                      {/* Interesse */}
                      <div className="mt-2 text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        {lead.interest}
                      </div>

                      {/* Tags */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.tags.map((tag, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600">
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Status da IA & Ações */}
                      <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          {lead.aiStatus === 'active' ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-[10px]">
                              <Bot className="w-3 h-3" /> IA Ativa
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 font-medium text-[10px]">
                              <Clock className="w-3 h-3" /> Humano
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenChat(lead.id)}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-brand-50 hover:text-brand-600 text-gray-600 transition-colors"
                            title="Abrir chat no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* Seletor rápido de fase */}
                          <select
                            value={lead.stage}
                            onChange={(e) => updateLeadStage(lead.id, e.target.value as LeadStage)}
                            className="text-[10px] font-semibold bg-gray-50 border border-gray-200 rounded px-1.5 py-1 text-gray-700 focus:outline-none focus:border-brand-500"
                          >
                            <option value="novo">Novo</option>
                            <option value="atendimento_ia">IA</option>
                            <option value="intervencao_humana">Humano</option>
                            <option value="em_negociacao">Negociação</option>
                            <option value="fechado">Fechado</option>
                          </select>
                        </div>
                      </div>

                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
