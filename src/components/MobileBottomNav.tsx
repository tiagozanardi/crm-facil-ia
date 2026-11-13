import React from 'react';
import { useCRM, ViewType } from '../context/CRMContext';
import { 
  LayoutDashboard, 
  Columns3, 
  MessageSquare, 
  Bot, 
  Settings
} from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const { currentView, setCurrentView, leads, conversations } = useCRM();

  const urgentCount = leads.filter(l => l.urgent).length;
  const unreadCount = Object.values(conversations).reduce((acc, conv) => {
    return acc + conv.messages.filter(m => m.sender === 'client' && !m.read).length;
  }, 0);

  const navItems = [
    { id: 'dashboard' as ViewType, label: 'Início', icon: LayoutDashboard, badge: urgentCount },
    { id: 'kanban' as ViewType, label: 'Kanban', icon: Columns3 },
    { id: 'chats' as ViewType, label: 'Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'ai_config' as ViewType, label: 'IA Agente', icon: Bot },
    { id: 'settings' as ViewType, label: 'Ajustes', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200 px-2 py-1 flex items-center justify-around shadow-lg">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-2 relative transition-all ${
              isActive ? 'text-brand-500 font-bold' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1 -right-2.5 px-1 py-0.2 rounded-full text-[9px] bg-brand-500 text-white font-bold animate-pulse">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
