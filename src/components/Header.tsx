import React from 'react';
import { useCRM } from '../context/CRMContext';
import { 
  Bell, 
  Terminal, 
  Zap, 
  Search, 
  Menu, 
  ShieldCheck, 
  ChevronDown,
  Sparkles,
  Smartphone,
  FlaskConical
} from 'lucide-react';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { 
    storeSettings, 
    devMode, 
    setDevMode, 
    setCurrentView, 
    leads, 
    notification,
    whatsapp,
    whatsappLoading,
    testMode
  } = useCRM();

  const urgentCount = leads.filter(l => l.urgent).length;

  // Status real da conexão (mesmo estado do card em Configurações → um polling só).
  const whatsappBadge = whatsapp === null
    ? whatsappLoading
      ? {
          label: 'Verificando WhatsApp...',
          shortLabel: 'Verificando...',
          dot: 'bg-gray-300 animate-pulse',
          text: 'text-gray-500',
          title: 'Consultando a conexão do WhatsApp',
        }
      : {
          label: 'WhatsApp desconectado',
          shortLabel: 'Desconectado',
          dot: 'bg-gray-300',
          text: 'text-gray-500',
          title: 'WhatsApp desconectado — abrir Conexão WhatsApp',
        }
    : whatsapp.status === 'CONNECTED'
      ? {
          label: 'WhatsApp Conectado',
          shortLabel: 'Conectado',
          dot: 'bg-emerald-500 animate-pulse',
          text: 'text-emerald-700',
          title: 'WhatsApp conectado — abrir Conexão WhatsApp',
        }
      : whatsapp.status === 'CONNECTING'
        ? {
            label: 'Aguardando conexão',
            shortLabel: 'Aguardando',
            dot: 'bg-amber-500 animate-pulse',
            text: 'text-amber-700',
            title: 'Aguardando leitura do QR Code — abrir Conexão WhatsApp',
          }
        : {
            label: 'WhatsApp desconectado',
            shortLabel: 'Desconectado',
            dot: 'bg-gray-300',
            text: 'text-gray-500',
            title: 'WhatsApp desconectado — abrir Conexão WhatsApp',
          };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs">
      {/* Toast Notification */}
      {notification && (
        <div className="bg-brand-500 text-white text-xs md:text-sm py-2 px-4 text-center font-medium shadow-md transition-all animate-bounce">
          {notification}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Lado Esquerdo: Botão Menu Mobile + Identidade da Loja */}
          <div className="flex items-center gap-3">
            <button 
              onClick={onOpenMobileMenu}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Logo da Loja */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
              <div className="w-10 h-10 rounded-full border border-gray-200 overflow-hidden shadow-xs bg-white flex items-center justify-center shrink-0">
                <img 
                  src={storeSettings.logoUrl} 
                  alt={storeSettings.name} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback visual elegante caso a imagem ainda não carregue
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold text-graphite-900 leading-tight">
                    {storeSettings.name}
                  </h1>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-600 border border-brand-100">
                    CRM Fácil
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCurrentView('settings');
                    }}
                    className="group/status inline-flex items-center gap-1.5 whitespace-nowrap"
                    title={whatsappBadge.title}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${whatsappBadge.dot}`}></span>
                    <span
                      className={`text-[11px] font-medium ${whatsappBadge.text} group-hover/status:underline`}
                    >
                      <span className="sm:hidden">{whatsappBadge.shortLabel}</span>
                      <span className="hidden sm:inline">{whatsappBadge.label}</span>
                    </span>
                  </button>
                  <span className="text-gray-300">•</span>
                  <span className="text-[11px] text-gray-500 hidden md:inline">IA Ativa</span>
                  {testMode?.enabled && (
                    <>
                      <span className="text-gray-300 hidden sm:inline">•</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCurrentView('settings');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold hover:bg-amber-100 transition-colors"
                        title={`Modo teste ativo: a IA só responde a ${testMode.numbers.length} número(s). Abrir Configurações.`}
                      >
                        <FlaskConical className="w-3 h-3" />
                        <span className="hidden sm:inline">Modo teste</span>
                        <span className="sm:hidden">Teste</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Centro: Barra de busca rápida no PC */}
          <div className="hidden lg:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Pesquisar por cliente, telefone ou produto..."
                className="w-full pl-9 pr-4 py-1.5 bg-gray-50/80 border border-gray-200 rounded-full text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Lado Direito: Ações, Alertas de Urgência e Modo Dev */}
          <div className="flex items-center gap-2 sm:gap-3">

            {/* Badge de Leads Urgentes */}
            {urgentCount > 0 && (
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors"
                title={`${urgentCount} leads precisam de atenção imediata`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                <span>{urgentCount} <span className="hidden sm:inline">atenção</span></span>
              </button>
            )}

            {/* Botão para simular no celular / QR Code ou Wi-Fi IP */}
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200" title="Acesse pelo celular no mesmo Wi-Fi: http://192.168.101.3:3000">
              <Smartphone className="w-3.5 h-3.5 text-gray-600" />
              <span>IP: <strong className="text-gray-700">192.168.101.3:3000</strong></span>
            </div>

            {/* Modo Desenvolvedor / Admin Técnico (Discreto) */}
            <button
              onClick={() => {
                setDevMode(!devMode);
                if (!devMode) {
                  setCurrentView('dev_admin');
                }
              }}
              className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                devMode 
                  ? 'bg-purple-100 text-purple-700 border border-purple-300 shadow-xs' 
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Acesso Admin do Desenvolvedor (Logs e Diagnóstico de IA)"
            >
              <Terminal className="w-4 h-4" />
              <span className="hidden md:inline">{devMode ? 'Dev Ativo' : 'Dev'}</span>
            </button>

            {/* Usuário logado */}
            <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-xs font-bold text-brand-600">
                TZ
              </div>
              <div className="hidden xl:block text-left">
                <div className="text-xs font-semibold text-gray-800">Tiago Zanardi</div>
                <div className="text-[10px] text-gray-500">Lojista Admin</div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
