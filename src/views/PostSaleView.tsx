import React from 'react';
import { useCRM } from '../context/CRMContext';
import { 
  HeartHandshake, 
  Star, 
  Gift, 
  ShieldCheck, 
  MessageSquare, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const PostSaleView: React.FC = () => {
  const { addNotification } = useCRM();

  const rules = [
    {
      id: 'rule-1',
      title: 'Pesquisa de Satisfação & Avaliação Google',
      trigger: '3 dias após a entrega / retirada',
      action: 'Envia mensagem amigável perguntando se a mala chegou perfeita e convida para deixar avaliação 5 estrelas no Google com link direto.',
      status: 'Ativo'
    },
    {
      id: 'rule-2',
      title: 'Dicas de Viagem & Cuidados com a Mala',
      trigger: '7 dias após a compra',
      action: 'Envia guia rápido em PDF com instruções de como configurar o cadeado TSA embutido e como higienizar a mala após a viagem.',
      status: 'Ativo'
    },
    {
      id: 'rule-3',
      title: 'Cupom de Recompra para Acessórios',
      trigger: '30 dias após a compra',
      action: 'Oferece cupom de 15% OFF para compra de capas de mala, organizadores internos ou frasqueira combinando.',
      status: 'Ativo'
    }
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-brand-500" />
            Pós-Venda & Fidelização de Clientes
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Transforme compradores de malas em promotores da sua loja através de mensagens automáticas de carinho e suporte pós-compra.
          </p>
        </div>

        <button 
          onClick={() => addNotification('Regra de pós-venda configurada!')}
          className="px-3.5 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors shadow-xs"
        >
          Nova Regra de Pós-Venda
        </button>
      </div>

      {/* Grid de Regras de Pós-Venda */}
      <div className="space-y-3">
        {rules.map((rule) => (
          <div 
            key={rule.id}
            className="bg-white rounded-2xl p-5 border border-gray-200/90 shadow-xs hover:border-brand-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">{rule.title}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                  {rule.status}
                </span>
              </div>
              <div className="text-xs text-brand-600 font-semibold">{rule.trigger}</div>
              <p className="text-xs text-gray-600 leading-relaxed">{rule.action}</p>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button 
                onClick={() => addNotification('Mensagem de teste enviada ao seu WhatsApp!')}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition-colors"
              >
                Testar no WhatsApp
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
