import React, { useState } from 'react';
import { useCRM } from '../context/CRMContext';
import { AIConfig, QuickReply } from '../types';
import { 
  Bot, 
  Sparkles, 
  Smile, 
  MessageCircle, 
  Target, 
  Zap, 
  Play, 
  Plus, 
  BookOpen, 
  Save, 
  Check, 
  Info,
  HelpCircle
} from 'lucide-react';

export const AILanguageView: React.FC = () => {
  const { 
    aiConfig, 
    updateAIConfig, 
    quickReplies, 
    addQuickReply,
    aiKnowledge,
    storeSettings
  } = useCRM();

  // Estado local para simular respostas em tempo real no Playground
  const [simulationInput, setSimulationInput] = useState('Vocês têm mala de bordo que não precisa despachar na Azul e Gol?');
  const [simulationResponse, setSimulationResponse] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Estado para cadastro de nova resposta rápida
  const [newTitle, setNewTitle] = useState('');
  const [newShortcut, setNewShortcut] = useState('');
  const [newContent, setNewContent] = useState('');

  const handleSimulate = () => {
    setIsSimulating(true);
    setSimulationResponse('');

    setTimeout(() => {
      let response = '';
      
      // Aplicar tom
      if (aiConfig.tone === 'consultivo') {
        response = 'Olá! Com certeza! Nossas malas de bordo da Malas SLZ foram desenhadas nas dimensões exatas de 55x35x25cm (padrão ANAC), garantindo que você viaje tranquilamente na Azul, Gol e Latam sem qualquer risco de despacho forçado. ';
      } else if (aiConfig.tone === 'vendedor') {
        response = 'Opa! Temos sim e estão com uma super condição nesta semana! Nossas malas de bordo 10kg atendem 100% as normas da Azul e Gol com rodinhas 360° em polipropileno ultrarresistente. ';
      } else if (aiConfig.tone === 'direto') {
        response = 'Sim! Malas de bordo 55x35x25cm homologadas para Azul, Gol e Latam. ';
      } else {
        response = 'Oi, tudo bem com você? Temos sim, com todo carinho! Nossas malas de bordo atendem perfeitamente as regras da Azul e Gol para você viajar sem preocupação. ';
      }

      // Aplicar gírias/regionalismo
      if (aiConfig.slangType === 'regional_slz') {
        response += 'Mermã, é garantia de viagem sem estresse nenhum por aqui! ';
      } else if (aiConfig.slangType === 'descontraido') {
        response += 'É sucesso garantido no seu próximo voo! ';
      }

      // Aplicar CTA
      if (aiConfig.ctaStrategy === 'grupo_vip_whatsapp') {
        response += 'Inclusive, estamos liberando um cupom de 15% exclusivo dentro do nosso Grupo VIP no WhatsApp. Posso te enviar o link?';
      } else if (aiConfig.ctaStrategy === 'link_pagamento') {
        response += 'Se desejar, já separo o modelo na bancada e te gero o link de Pix com 7% de desconto agora!';
      } else if (aiConfig.ctaStrategy === 'direcionar_loja_fisica') {
        response += 'Se quiser ver de pertinho, estamos te esperando na loja do Calhau até às 19h!';
      } else {
        response += 'Qualquer detalhe extra, só me chamar que te atendo com todo prazer!';
      }

      // Aplicar emojis
      if (aiConfig.emojiIntensity === 'none') {
        response = response.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
      } else if (aiConfig.emojiIntensity === 'moderate') {
        response += ' ✈️✨';
      } else {
        response += ' ✈️🧳🔥💃💖';
      }

      setSimulationResponse(response);
      setIsSimulating(false);
    }, 600);
  };

  const handleCreateQuickReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newContent) return;

    addQuickReply({
      title: newTitle,
      shortcut: newShortcut.startsWith('/') ? newShortcut : `/${newShortcut || 'atalho'}`,
      category: 'precos',
      content: newContent
    });

    setNewTitle('');
    setNewShortcut('');
    setNewContent('');
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner Explicativo */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-graphite-900 flex items-center gap-2">
            <Bot className="w-5 h-5 text-brand-500" />
            Configuração da Linguagem do Agente IA
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Personalize a voz e o estilo do seu atendente virtual sem precisar escrever linhas de comandos técnicos.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 font-semibold">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>Prompt Interno Otimizado Ativo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: CONTROLES VISUAIS AMIGÁVEIS (8 Colunas) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* 1. Tom de Atendimento */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-graphite-900 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-brand-500" />
                Tom de Voz do Atendimento
              </label>
              <span className="text-[11px] text-gray-400">Como a IA aborda o cliente</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'consultivo', label: 'Consultivo & Elegante', desc: 'Foco técnico, tira dúvidas, passa segurança e valor.' },
                { id: 'vendedor', label: 'Vendedor Ativo', desc: 'Promocional, focado em fechar rápido e destacar descontos.' },
                { id: 'direto', label: 'Direto & Rápido', desc: 'Respostas curtas, objetivas, sem rodeios.' },
                { id: 'afetuoso', label: 'Afetuoso & Acolhedor', desc: 'Super empático, caloroso e atencioso.' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => updateAIConfig({ tone: item.id as any })}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiConfig.tone === item.id 
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-gray-900">{item.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Emojis e Regionalismo */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Intensidade de Emojis */}
            <div>
              <label className="text-xs font-bold text-graphite-900 flex items-center gap-2 mb-2">
                <Smile className="w-4 h-4 text-amber-500" />
                Intensidade de Emojis
              </label>
              <div className="space-y-1.5">
                {[
                  { id: 'none', label: 'Nenhum Emoji', desc: 'Estritamente formal e sério' },
                  { id: 'moderate', label: 'Moderado (Recomendado)', desc: '1 a 2 emojis estratégicos' },
                  { id: 'expressive', label: 'Expressivo & Animado', desc: 'Vários emojis descontraídos' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => updateAIConfig({ emojiIntensity: item.id as any })}
                    className={`w-full p-2.5 rounded-lg border text-left text-xs transition-all ${
                      aiConfig.emojiIntensity === item.id 
                        ? 'border-brand-500 bg-brand-50 text-brand-900 font-bold' 
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div>{item.label}</div>
                    <div className="text-[10px] text-gray-400 font-normal">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Gírias e Linguagem Regional */}
            <div>
              <label className="text-xs font-bold text-graphite-900 flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                Regionalismo & Gírias
              </label>
              <div className="space-y-1.5">
                {[
                  { id: 'regional_slz', label: 'Regional (São Luís / MA)', desc: 'Toque maranhense amigável' },
                  { id: 'descontraido', label: 'Descontraído Geral', desc: 'Moderno, leve e natural' },
                  { id: 'neutro', label: 'Português Neutro', desc: 'Sem gírias regionais' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => updateAIConfig({ slangType: item.id as any })}
                    className={`w-full p-2.5 rounded-lg border text-left text-xs transition-all ${
                      aiConfig.slangType === item.id 
                        ? 'border-brand-500 bg-brand-50 text-brand-900 font-bold' 
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div>{item.label}</div>
                    <div className="text-[10px] text-gray-400 font-normal">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* 3. Estratégia de CTA (Chamada para Ação) */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-graphite-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-500" />
                Estratégia de CTA (Chamada para Ação ao Final)
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { id: 'grupo_vip_whatsapp', label: 'Encaminhar ao Grupo VIP', desc: 'Direciona para a comunidade de descontos no WhatsApp.' },
                { id: 'link_pagamento', label: 'Fechar com Pix Imediato', desc: 'Oferece desconto de 7% no Pix e link de pagamento.' },
                { id: 'direcionar_loja_fisica', label: 'Convidar para a Loja', desc: 'Endereço no Calhau para ver e testar as malas.' },
                { id: 'consultor_humano', label: 'Chamar Vendedor Humano', desc: 'Transborda para fechamento assistido.' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => updateAIConfig({ ctaStrategy: item.id as any })}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiConfig.ctaStrategy === item.id 
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-gray-900">{item.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Cadastro de Novas Respostas Rápidas */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-graphite-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-500" />
              Cadastrar Nova Resposta Rápida (Para o Atendente Usar no Chat)
            </h3>

            <form onSubmit={handleCreateQuickReply} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Título (ex: Chave Pix da Loja)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
                <input
                  type="text"
                  placeholder="Atalho (ex: /pix)"
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              <textarea
                placeholder="Texto da mensagem que será inserida ao clicar no atalho..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
              />

              <button
                type="submit"
                disabled={!newTitle || !newContent}
                className="px-4 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Salvar Resposta Rápida
              </button>
            </form>
          </div>

        </div>

        {/* COLUNA DIREITA: PLAYGROUND / SIMULADOR EM TEMPO REAL (5 Colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-brand-200 shadow-md sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-500" />
                <h3 className="text-xs font-bold text-gray-900">Simulador da IA em Tempo Real</h3>
              </div>
              <span className="text-[10px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-bold">
                Teste Imediato
              </span>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Teste agora como a IA responderá aos clientes com as configurações que você escolheu ao lado:
            </p>

            {/* Caixa de Entrada do Cliente */}
            <div className="mt-3">
              <label className="text-[11px] font-semibold text-gray-600">Pergunta do Cliente:</label>
              <textarea
                value={simulationInput}
                onChange={(e) => setSimulationInput(e.target.value)}
                rows={2}
                className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={handleSimulate}
              disabled={isSimulating}
              className="mt-2 w-full py-2 px-4 rounded-xl bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              {isSimulating ? 'Gerando resposta...' : 'Simular Resposta da IA'}
            </button>

            {/* Prévia da Resposta da IA */}
            <div className="mt-4 p-3.5 rounded-xl bg-[#FAF8F5] border border-gray-200">
              <div className="flex items-center gap-2 text-[11px] font-bold text-brand-600 mb-1.5">
                <Bot className="w-4 h-4" />
                <span>Resposta Gerada pela IA:</span>
              </div>

              {simulationResponse ? (
                <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {simulationResponse}
                </p>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  Clique no botão acima para ver como a IA responderá na prática.
                </p>
              )}
            </div>

            {/* Base de Conhecimento Aprendida */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-[11px] font-bold text-gray-700 flex items-center justify-between mb-2">
                <span>Conhecimento Aprendido pelo Atendente ({aiKnowledge.length})</span>
                <span className="text-[9px] text-emerald-600 font-semibold">RAG Ativo</span>
              </div>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {aiKnowledge.map((item) => (
                  <div key={item.id} className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-[11px]">
                    <span className="font-semibold text-gray-800">"{item.question}"</span>
                    <p className="text-gray-600 mt-0.5 truncate">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
