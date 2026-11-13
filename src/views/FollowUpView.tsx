import React from 'react';
import { useCRM } from '../context/CRMContext';
import { 
  Send, 
  Clock, 
  ToggleLeft, 
  ToggleRight, 
  Sparkles, 
  CheckCircle2, 
  Users, 
  ArrowRight,
  Plus
} from 'lucide-react';

export const FollowUpView: React.FC = () => {
  const { campaigns, toggleCampaign, addNotification } = useCRM();

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <Send className="w-5 h-5 text-brand-500" />
            Campanhas Automáticas de Follow-up
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Reaqueça leads que pararam de responder no WhatsApp sem precisar ficar mandando mensagem manual um a um.
          </p>
        </div>

        <button 
          onClick={() => addNotification('Nova automação criada!')}
          className="px-3.5 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Criar Nova Campanha
        </button>
      </div>

      {/* Grid de Campanhas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaigns.map((camp) => (
          <div 
            key={camp.id}
            className={`bg-white rounded-2xl p-5 border shadow-xs transition-all flex flex-col justify-between ${
              camp.active ? 'border-brand-200' : 'border-gray-200 opacity-70'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                    camp.active ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-gray-900">{camp.title}</h3>
                    <span className="text-[10px] text-gray-400">Gatilho: {camp.triggerHours}h sem resposta</span>
                  </div>
                </div>

                <button 
                  onClick={() => toggleCampaign(camp.id)}
                  className="text-gray-400 hover:text-brand-500 transition-colors"
                  title={camp.active ? 'Desativar campanha' : 'Ativar campanha'}
                >
                  {camp.active ? (
                    <ToggleRight className="w-7 h-7 text-brand-500" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-gray-300" />
                  )}
                </button>
              </div>

              {/* Mensagem Template */}
              <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-700 leading-relaxed italic">
                "{camp.messageTemplate}"
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-gray-500 text-[11px] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <strong>{camp.conversionsCount}</strong> vendas recuperadas
              </span>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                camp.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {camp.active ? 'Em Execução' : 'Pausada'}
              </span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
