import React, { useState } from 'react';
import { useCRM } from '../context/CRMContext';
import { 
  Settings, 
  Palette, 
  Clock, 
  Upload, 
  Sparkles, 
  Check, 
  Building, 
  Phone, 
  MapPin, 
  Share2, 
  Save, 
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { storeSettings, updateStoreSettings, addNotification } = useCRM();

  const [name, setName] = useState(storeSettings.name);
  const [segment, setSegment] = useState(storeSettings.segment);
  const [whatsapp, setWhatsapp] = useState(storeSettings.whatsappNumber);
  const [address, setAddress] = useState(storeSettings.address);
  const [pauseHours, setPauseHours] = useState(storeSettings.interventionPauseHours);
  const [vipGroupLink, setVipGroupLink] = useState(storeSettings.vipGroupLink);

  const [primaryColor, setPrimaryColor] = useState(storeSettings.theme.primaryColor);
  const [accentColor, setAccentColor] = useState(storeSettings.theme.accentColor);

  // Presets inteligentes para demonstrar escalabilidade multi-loja
  const brandPresets = [
    {
      id: 'malas-slz',
      name: 'Malas SLZ (Terracota Nobre)',
      primary: '#B3471A',
      accent: '#D97706',
      surface: '#FAF8F5',
      logo: '/logo-malas-slz.jpg',
      badge: 'Identidade Atual'
    },
    {
      id: 'minimal-graphite',
      name: 'Mala Urbana (Grafite & Ônix)',
      primary: '#24292F',
      accent: '#0969DA',
      surface: '#F6F8FA',
      logo: '/logo-malas-slz.jpg',
      badge: 'Escalabilidade Loja 2'
    },
    {
      id: 'emerald-luxury',
      name: 'Viagens & Couro (Verde Esmeralda)',
      primary: '#0F766E',
      accent: '#B45309',
      surface: '#F0FDFA',
      logo: '/logo-malas-slz.jpg',
      badge: 'Escalabilidade Loja 3'
    },
    {
      id: 'rose-gold',
      name: 'Boutique Glam (Rosé & Terracota)',
      primary: '#BE185D',
      accent: '#F59E0B',
      surface: '#FDF2F8',
      logo: '/logo-malas-slz.jpg',
      badge: 'Escalabilidade Loja 4'
    }
  ];

  const handleApplyPreset = (preset: typeof brandPresets[0]) => {
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
    updateStoreSettings({
      theme: {
        primaryColor: preset.primary,
        accentColor: preset.accent,
        surfaceColor: preset.surface
      }
    });
    addNotification(`Tema "${preset.name}" aplicado em todo o sistema!`);
  };

  const handleSmartExtractPalette = () => {
    // Simula a extração algorítmica da imagem anexada
    setPrimaryColor('#B3471A');
    setAccentColor('#D97706');
    updateStoreSettings({
      theme: {
        primaryColor: '#B3471A',
        accentColor: '#D97706',
        surfaceColor: '#FAF8F5'
      }
    });
    addNotification('🎨 Paleta extraída com sucesso a partir do arquivo do logotipo da Malas SLZ!');
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    updateStoreSettings({
      name,
      segment,
      whatsappNumber: whatsapp,
      address,
      interventionPauseHours: Number(pauseHours),
      vipGroupLink,
      theme: {
        primaryColor,
        accentColor,
        surfaceColor: '#FAF8F5'
      }
    });
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-500" />
            Configurações Gerais & Personalização de Marca
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Altere os dados da loja, regras de intervenção e personalize cores e logos para este cliente ou novos clientes.
          </p>
        </div>

        <button 
          onClick={handleSaveAll}
          className="px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors flex items-center gap-2 shadow-xs"
        >
          <Save className="w-4 h-4" />
          Salvar Todas as Configurações
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: DADOS DA LOJA & INTERVENÇÃO (7 Colunas) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Dados do Negócio */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-graphite-900 flex items-center gap-2 pb-2 border-b border-gray-100">
              <Building className="w-4 h-4 text-brand-500" />
              Dados do Negócio
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-700">Nome da Loja</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700">Segmento / Ramo</label>
                <input
                  type="text"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700">WhatsApp Comercial</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700">Endereço Físico (Loja / Retirada)</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* Configuração de Intervenção Humana & Grupo VIP */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-graphite-900 flex items-center gap-2 pb-2 border-b border-gray-100">
              <Clock className="w-4 h-4 text-brand-500" />
              Regras de Intervenção & Redirecionamento
            </h3>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-700">
                    Tempo de Pausa da IA ao Atendente Humano Intervir (horas)
                  </label>
                  <span className="text-xs font-bold text-brand-600">{pauseHours} horas</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="72"
                  value={pauseHours}
                  onChange={(e) => setPauseHours(Number(e.target.value))}
                  className="w-full mt-2 accent-brand-500"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Padrão recomendado: 24h. Durante esse período, a IA não interrompe nem sobrepõe as mensagens enviadas pelo lojista.
                </p>
              </div>

              <div className="pt-2">
                <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-purple-600" />
                  Link do Grupo VIP de Fechamento no WhatsApp
                </label>
                <input
                  type="text"
                  value={vipGroupLink}
                  onChange={(e) => setVipGroupLink(e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Usado pela IA e pelos botões de redirecionamento para transbordar clientes para fechamento coletivo com cupons.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* COLUNA DIREITA: IDENTIDADE VISUAL & EXTRATOR INTELIGENTE (5 Colunas) */}
        <div className="lg:col-span-5 space-y-5">
          
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-xs font-bold text-graphite-900 flex items-center gap-2">
                <Palette className="w-4 h-4 text-brand-500" />
                Identidade Visual & Cores (White-label)
              </h3>
            </div>

            {/* Logo Preview & Upload */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center">
              <div className="w-20 h-20 rounded-full border-2 border-white shadow-md mx-auto overflow-hidden bg-white">
                <img 
                  src={storeSettings.logoUrl} 
                  alt="Logo da Loja" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="text-xs font-bold text-gray-800 mt-2">Logotipo Cadastrado</div>
              <p className="text-[10px] text-gray-400">Arquivo fornecido: WhatsApp Image Malas SLZ</p>

              {/* Botão de Extração Inteligente de Paleta */}
              <button
                type="button"
                onClick={handleSmartExtractPalette}
                className="mt-3 w-full py-2 px-3 rounded-lg bg-white border border-brand-200 hover:bg-brand-50 text-brand-600 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                Detectar Paleta da Imagem Automaticamente
              </button>
            </div>

            {/* Seletor Manual de Cores Primária e Destaque */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-800">Cor Primária da Marca</div>
                  <div className="text-[10px] text-gray-400">Botões, destaques e headers</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => {
                      setPrimaryColor(e.target.value);
                      updateStoreSettings({ theme: { ...storeSettings.theme, primaryColor: e.target.value } });
                    }}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200"
                  />
                  <span className="text-xs font-mono font-semibold text-gray-700">{primaryColor}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-800">Cor de Destaque / Acentos</div>
                  <div className="text-[10px] text-gray-400">Avisos e tags especiais</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => {
                      setAccentColor(e.target.value);
                      updateStoreSettings({ theme: { ...storeSettings.theme, accentColor: e.target.value } });
                    }}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200"
                  />
                  <span className="text-xs font-mono font-semibold text-gray-700">{accentColor}</span>
                </div>
              </div>
            </div>

            {/* Demonstração de Escalabilidade: Presets de Outras Lojas */}
            <div className="pt-3 border-t border-gray-100">
              <div className="text-[11px] font-bold text-gray-700 mb-2">
                Demonstração de Escalabilidade para Outros Clientes:
              </div>
              <div className="space-y-1.5">
                {brandPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="w-full p-2 rounded-xl border border-gray-200 hover:border-gray-400 bg-white flex items-center justify-between text-left transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="w-5 h-5 rounded-full border border-gray-300 shadow-2xs" 
                        style={{ backgroundColor: preset.primary }} 
                      />
                      <span className="text-xs font-semibold text-gray-800">{preset.name}</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                      {preset.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
