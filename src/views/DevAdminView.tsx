import React, { useState } from 'react';
import { useCRM } from '../context/CRMContext';
import { DevLogItem } from '../types';
import { 
  Terminal, 
  Bug, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  Coins, 
  Sparkles, 
  RefreshCw, 
  Filter, 
  ChevronRight,
  ShieldAlert,
  Copy,
  ExternalLink
} from 'lucide-react';

export const DevAdminView: React.FC = () => {
  const { devLogs, addNotification } = useCRM();

  const [selectedLog, setSelectedLog] = useState<DevLogItem | null>(devLogs[0] || null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<string | null>(null);

  const handleDiagnoseWithAI = (log: DevLogItem) => {
    setDiagnosing(true);
    setDiagnosisResult(null);

    setTimeout(() => {
      if (log.service === 'Evolution_API') {
        setDiagnosisResult(
          `🤖 Diagnóstico do Agente Dev IA:
- Causa Raiz: A instância do WhatsApp conectada via Evolution API reportou alerta de baixa energia ou desconexão temporária de socket no aparelho físico.
- Impacto: Atraso de 400ms no webhook de recebimento de mensagens.
- Ação Recomendada:
  1. Manter o aparelho comercial carregando ou parear via WhatsApp Web QR Code estável.
  2. Nenhuma alteração de código necessária; o CRM tratou o retry automaticamente com sucesso.`
        );
      } else {
        setDiagnosisResult(
          `🤖 Diagnóstico do Agente Dev IA:
- Serviço: Chamada LLM (Provider ${log.service}).
- Métricas: Latência excelente (840ms), consumo de 380 tokens totais.
- Custo estimado: $0.00008 USD.
- Ação Recomendada: Nenhuma anomalia detectada. O modelo respondeu respeitando o limite configurado de 55 palavras.`
        );
      }
      setDiagnosing(false);
    }, 800);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification('Copiado para a área de transferência!');
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      
      {/* Top Banner de Alerta de Área Restrita Dev */}
      <div className="bg-purple-950 text-white rounded-2xl p-5 border border-purple-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-white">Painel Técnico do Desenvolvedor (Admin Dev)</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-800 text-purple-200 border border-purple-600">
              Apenas Desenvolvedores
            </span>
          </div>
          <p className="text-xs text-purple-300 mt-1">
            Esta tela é 100% invisível para lojistas comuns. Use para monitorar instâncias WhatsApp (Evolution API), consumo de tokens por loja e diagnosticar bugs com auxílio de agentes de IA.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-purple-300">Consumo de Tokens (Mês)</div>
            <div className="text-sm font-bold text-white">48.250 tokens (~$0.02)</div>
          </div>
        </div>
      </div>

      {/* Grid de Serviços Monitorados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Evolution API (WhatsApp)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          </div>
          <div className="mt-2 text-lg font-bold text-gray-900">Online (v2.1)</div>
          <p className="text-[11px] text-gray-400 mt-0.5">Instância: malas-slz-01</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Billing de IA / Tenant</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-lg font-bold text-gray-900">Separado por Loja</div>
          <p className="text-[11px] text-emerald-600 mt-0.5">Loja: malas-slz (Quota 82% livre)</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Diagnóstico Inteligente</span>
            <Sparkles className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 text-lg font-bold text-gray-900">Agente Ativo</div>
          <p className="text-[11px] text-gray-400 mt-0.5">Pronto para resolver exceptions</p>
        </div>

      </div>

      {/* Tabela de Logs e Painel de Diagnóstico */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Lista de Logs Recentes (7 Colunas) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-900 flex items-center gap-2">
              <Bug className="w-4 h-4 text-purple-600" />
              Logs de Execução & Eventos da API
            </h3>
            <span className="text-[10px] text-gray-400 font-mono">Últimos eventos</span>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {devLogs.map((log) => {
              const isSelected = selectedLog?.id === log.id;
              const isWarn = log.level === 'warn';
              const isAi = log.level === 'ai_call';

              return (
                <div
                  key={log.id}
                  onClick={() => {
                    setSelectedLog(log);
                    setDiagnosisResult(null);
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-purple-500 bg-purple-50/50 ring-1 ring-purple-500' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                    <span className="font-mono">{log.timestamp}</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                      isWarn ? 'bg-amber-100 text-amber-800' : isAi ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {log.service}
                    </span>
                  </div>
                  <p className="font-medium text-gray-800 leading-snug">{log.message}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diagnóstico do Log Selecionado com IA (5 Colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-sm sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-bold text-gray-900">Assistente Dev IA</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">
                Auto-Correção
              </span>
            </div>

            {selectedLog ? (
              <div className="mt-3 space-y-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-800 break-words">
                  <div><strong>ID:</strong> {selectedLog.id}</div>
                  <div><strong>Serviço:</strong> {selectedLog.service}</div>
                  <div><strong>Tenant:</strong> {selectedLog.storeId}</div>
                  <div className="mt-1 text-gray-600">{selectedLog.message}</div>
                </div>

                <button
                  onClick={() => handleDiagnoseWithAI(selectedLog)}
                  disabled={diagnosing}
                  className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {diagnosing ? 'Agente analisando stack...' : 'Diagnosticar com Agente de IA'}
                </button>

                {diagnosisResult && (
                  <div className="mt-3 p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-950 font-mono whitespace-pre-wrap leading-relaxed relative">
                    <button
                      onClick={() => copyToClipboard(diagnosisResult)}
                      className="absolute top-2 right-2 p-1 text-purple-600 hover:text-purple-900"
                      title="Copiar diagnóstico"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {diagnosisResult}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-3 text-center">Selecione um log ao lado para analisar.</p>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
