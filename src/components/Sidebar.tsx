import React from 'react';
import { useCRM, ViewType } from '../context/CRMContext';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Columns3, 
  MessageSquare, 
  Bot, 
  Send, 
  HeartHandshake, 
  Palette, 
  Terminal,
  X,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { currentView, setCurrentView, devMode, leads, conversations } = useCRM();

  const unreadMessagesCount = Object.values(conversations).reduce((acc, conv) => {
    return acc + conv.messages.filter(m => m.sender === 'client' && !m.read).length;
  }, 0);

  const urgentLeadsCount = leads.filter(l => l.urgent).length;

  const navItems: { id: ViewType; label: string; icon: React.ElementType; badge?: number; badgeColor?: string; devOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: urgentLeadsCount, badgeColor: 'bg-amber-500' },
    { id: 'funnel', label: 'Funil de Vendas', icon: TrendingUp },
    { id: 'kanban', label: 'Kanban de Leads', icon: Columns3 },
    { id: 'chats', label: 'WhatsApp & Chats', icon: MessageSquare, badge: unreadMessagesCount, badgeColor: 'bg-brand-500' },
    { id: 'ai_config', label: 'Linguagem da IA', icon: Bot },
    { id: 'follow_up', label: 'Campanhas Follow-up', icon: Send },
    { id: 'post_sale', label: 'Pós-Venda & Retenção', icon: HeartHandshake },
    { id: 'settings', label: 'Configurações & Cores', icon: Palette },
  ];

  if (devMode) {
    navItems.push({
      id: 'dev_admin',
      label: 'Área Dev (Logs & IA)',
      icon: Terminal,
      devOnly: true
    });
  }

  const handleSelect = (view: ViewType) => {
    setCurrentView(view);
    onCloseMobile();
  };

  return (
    <>
      {/* Overlay escuro no mobile */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col justify-between
        transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:z-10
        ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Cabeçalho do Menu no Mobile */}
        <div className="p-4 flex items-center justify-between border-b border-gray-100 md:hidden">
          <span className="font-bold text-gray-900 text-sm">Navegação do CRM</span>
          <button 
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links de navegação */}
        <div className="p-3 space-y-1 overflow-y-auto flex-1">
          <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
            Menu Principal
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`
                  w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold
                  transition-all duration-200 group
                  ${isActive 
                    ? 'bg-brand-50 text-brand-600 shadow-xs border border-brand-100' 
                    : item.devOnly
                      ? 'text-purple-600 hover:bg-purple-50'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-brand-500' : item.devOnly ? 'text-purple-600' : 'text-gray-400 group-hover:text-gray-600'
                  }`} />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold text-white rounded-full ${item.badgeColor || 'bg-brand-500'}`}>
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-brand-500" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Rodapé da Sidebar: Status de Multi-tenant & Dica */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50">
          <div className="p-3 rounded-xl bg-white border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-gray-800">Loja Ativa</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">Online</span>
            </div>
            <div className="text-xs font-bold text-brand-500 truncate">Malas SLZ</div>
            <p className="text-[10px] text-gray-400 mt-0.5">Plano Pro • 1 a 5 atendentes</p>
          </div>
        </div>
      </aside>
    </>
  );
};
