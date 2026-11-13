import React from 'react';
import { useCRM } from '../context/CRMContext';
import { 
  TrendingUp, 
  Users, 
  Bot, 
  MessageSquare, 
  CheckCircle2, 
  ArrowDown, 
  DollarSign, 
  Sparkles,
  HelpCircle
} from 'lucide-react';

export const SalesFunnelView: React.FC = () => {
  const { leads, setCurrentView } = useCRM();

  const stagesData = [
    {
      id: 'novo',
      title: '1. Novos Contatos',
      description: 'Leads que entraram por anúncios no Instagram e WhatsApp',
      count: 42,
      percent: '100%',
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50 border-blue-200 text-blue-800',
      conversionNext: '85.7% continuaram para conversa com a IA'
    },
    {
      id: 'atendimento_ia',
      title: '2. Atendimento & Qualificação IA',
      description: 'Tirando dúvidas sobre tamanho de mala, cores e disponibilidade',
      count: 36,
      percent: '85.7%',
      color: 'bg-brand-500',
      lightColor: 'bg-brand-50 border-brand-200 text-brand-800',
      conversionNext: '55.5% avançaram para negociação de valores'
    },
    {
      id: 'em_negociacao',
      title: '3. Em Negociação / Fechamento',
      description: 'Calculando frete para São Luís, desconto no Pix ou parcelamento',
      count: 20,
      percent: '47.6%',
      color: 'bg-amber-500',
      lightColor: 'bg-amber-50 border-amber-200 text-amber-800',
      conversionNext: '70% fecharam pedido e efetuaram pagamento'
    },
    {
      id: 'fechado',
      title: '4. Vendas Concluídas',
      description: 'Pagamento confirmado e produto separado para envio/retirada',
      count: 14,
      percent: '33.3%',
      color: 'bg-emerald-500',
      lightColor: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      conversionNext: '92% foram para fluxo de Pós-Venda e avaliação'
    }
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-500" />
            Funil de Vendas & Conversão
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhe a jornada do cliente desde o primeiro 'oi' no WhatsApp até o pagamento concluído.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentView('kanban')}
            className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors shadow-xs"
          >
            Ver Leads no Kanban
          </button>
        </div>
      </div>

      {/* Funil Visual */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-xs space-y-4">
        {stagesData.map((stage, index) => (
          <div key={stage.id} className="relative">
            <div className={`p-4 rounded-xl border ${stage.lightColor} flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs`}>
              
              <div className="flex items-start md:items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${stage.color} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs`}>
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{stage.title}</h3>
                  <p className="text-xs text-gray-600 mt-0.5">{stage.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 self-end md:self-auto">
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">{stage.count} leads</div>
                  <div className="text-[11px] font-semibold text-gray-500">{stage.percent} do total</div>
                </div>
              </div>

            </div>

            {/* Barra de Conversão Intermediária */}
            {index < stagesData.length - 1 && (
              <div className="flex items-center justify-center py-2">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-gray-600 border border-gray-200">
                  <ArrowDown className="w-3.5 h-3.5 text-brand-500" />
                  <span>{stage.conversionNext}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dicas de Melhoria Baseadas em Dados */}
      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-bold text-amber-900">Insight do Especialista para Malas SLZ</h4>
          <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
            O maior ponto de desistência acontece na etapa de <strong>Qualificação IA para Negociação</strong> (queda de 44.5%). A maioria dos clientes hesita sobre as dimensões das malas e o custo do frete. Adicionar fotos reais com as medidas ANAC estampadas na resposta rápida da IA pode aumentar a conversão dessa etapa em até 20%.
          </p>
        </div>
      </div>

    </div>
  );
};
