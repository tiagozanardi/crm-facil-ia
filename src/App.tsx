import React, { useState } from 'react';
import { CRMProvider, useCRM } from './context/CRMContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';

// Views
import { DashboardView } from './views/DashboardView';
import { SalesFunnelView } from './views/SalesFunnelView';
import { KanbanView } from './views/KanbanView';
import { ChatView } from './views/ChatView';
import { AILanguageView } from './views/AILanguageView';
import { FollowUpView } from './views/FollowUpView';
import { PostSaleView } from './views/PostSaleView';
import { SettingsView } from './views/SettingsView';
import { DevAdminView } from './views/DevAdminView';

const MainContent: React.FC = () => {
  const { currentView } = useCRM();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'funnel':
        return <SalesFunnelView />;
      case 'kanban':
        return <KanbanView />;
      case 'chats':
        return <ChatView />;
      case 'ai_config':
        return <AILanguageView />;
      case 'follow_up':
        return <FollowUpView />;
      case 'post_sale':
        return <PostSaleView />;
      case 'settings':
        return <SettingsView />;
      case 'dev_admin':
        return <DevAdminView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col text-graphite-900 font-sans">
      <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar 
          mobileOpen={mobileMenuOpen} 
          onCloseMobile={() => setMobileMenuOpen(false)} 
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {renderView()}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default function App() {
  return (
    <CRMProvider>
      <MainContent />
    </CRMProvider>
  );
}
