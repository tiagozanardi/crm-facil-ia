import React, { useEffect, useState } from 'react';
import { useCRM } from '../context/CRMContext';
import { DevLogItem } from '../types';
import { apiService } from '../services/api';
import { 
  Terminal, 
  Bug, 
  AlertTriangle, 
  Cpu, 
  Coins, 
  Sparkles, 
  RefreshCw, 
  Filter, 
  ShieldAlert,
  Copy,
  Loader2,
  Search
} from 'lucide-react';

const LEVEL_OPTIONS = [
  { value: '', label: 'Todos os níveis' },
  { value: 'ai_call', label: 'Chamadas de IA' },
  { value: 'error', label: 'Erros' },
  { value: 'warn', label: 'Avisos' },
  { value: 'info', label: 'Informações' },
];

const SERVICE_OPTIONS = [
  { value: '', label: 'Todos os serviços' },
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'Evolution_API', label: 'Evolution API' },
  { value: 'CRM_Webhook', label: 'CRM Webhook' },
  { value: 'Gemini', label: 'Gemini' },
  { value: 'Token_Billing', label: 'Token Billing' },
];

function levelBadgeClass(level: DevLogItem['level']): string {
  if (level === 'error') return 'bg-rose-100 text-rose-800';
  if (level === 'warn') return 'bg-amber-100 text-amber-800';
  if (level === 'ai_call') return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-700';
}

function levelLabel(level: DevLogItem['level']): string {
  if (level === 'error') return 'ERRO';
  if (level === 'warn') return 'AVISO';
  if (level === 'ai_call') return 'IA';
  return 'INFO';
}

export const DevAdminView: React.FC = () => {
  const { devLogs, devLogSummary, refreshDevLogs, addNotification } = useCRM();

  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedLog, setSelectedLog] = useState<DevLogItem | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<{
    diagnosis: string;
    model: string;
    tokensUsed: number;
    latencyMs: number;
  } | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      await refreshDevLogs({
        level: level || undefined,
        service: service || undefined,
        search: search.trim() || undefined,
        limit: 100,
      });
    } finally {
      setLoading(false);
    }
  };

  // Recarrega ao montar e sempre que os filtros de nível/serviço mudarem.
  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, service]);

  // Busca textual com debounce para não disparar request a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs();
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Mantém um log selecionado válido quando a lista é recarregada.
  useEffect(() => {
    if (devLogs.length === 0) {
      setSelectedLog(null);
      return;
    }
    if (!selectedLog || !devLogs.some((log) => log.id === selectedLog.id)) {
      setSelectedLog(devLogs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devLogs]);

  const handleDiagnoseWithAI = async () => {
    if (!selectedLog || diagnosing) return;

    setDiagnosing(true);
    setDiagnosis(null);
    setDiagnosisError(null);

    try {
      const result = await apiService.diagnoseDevLog(selectedLog.id);
      setDiagnosis(result);
      addNotification(`🤖 Diagnóstico gerado (${result.tokensUsed} tokens • ${result.latencyMs}ms).`);
      // O diagnóstico também é um evento de IA: atualiza a lista/métricas.
      await loadLogs();
    } catch (err: any) {
      setDiagnosisError(err?.message || 'Não foi possível gerar o diagnóstico.');
    } finally {
      setDiagnosing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification('Copiado para a área de transferência!');
  };

  const summary = devLogSummary;

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
            Esta tela é 100% invisível para lojistas comuns. Logs, tokens e diagnósticos vêm direto do PostgreSQL (últimos {summary?.windowDays ?? 30} dias).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-purple-300">Consumo de Tokens ({summary?.windowDays ?? 30}d)</div>
            <div className="text-sm font-bold text-white">
              {(summary?.tokensTotal ?? 0).toLocaleString('pt-BR')} tokens
              <span className="text-purple-300 font-normal">
                {' '}(~US$ {(summary?.estimatedCostUsd ?? 0).toFixed(4)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Serviços Monitorados (dados reais) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">OpenAI (LLM)</span>
            <Cpu className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-lg font-bold text-gray-900">
            {summary?.aiCalls ?? 0} chamadas
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Latência média: {summary?.avgLatencyMs ?? 0}ms
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Erros & Alertas</span>
            <ShieldAlert className={`w-4 h-4 ${(summary?.errors ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
          </div>
          <div className="mt-2 text-lg font-bold text-gray-900">
            {summary?.errors ?? 0} erros · {summary?.warnings ?? 0} avisos
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {summary?.events ?? 0} eventos monitorados
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Evolution API (WhatsApp)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" title="Integração ainda não configurada" />
          </div>
          <div className="mt-2 text-lg font-bold text-gray-900">
            {summary?.byService?.Evolution_API ?? 0} eventos
          </div>
          <p className="text-[11px] text-amber-600 mt-0.5">Webhook real aguardando integração</p>
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono">
                {devLogs.length} de {summary?.events ?? devLogs.length}
              </span>
              <button
                type="button"
                onClick={loadLogs}
                disabled={loading}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                title="Recarregar logs do banco"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar na mensagem do log..."
                className="w-full pl-8 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-700"
              title="Filtrar por nível"
            >
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-700"
              title="Filtrar por serviço"
            >
              {SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {devLogs.map((log) => {
              const isSelected = selectedLog?.id === log.id;

              return (
                <div
                  key={log.id}
                  onClick={() => {
                    setSelectedLog(log);
                    setDiagnosis(null);
                    setDiagnosisError(null);
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-purple-500 bg-purple-50/50 ring-1 ring-purple-500' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1 gap-2">
                    <span className="font-mono">{log.timestamp}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${levelBadgeClass(log.level)}`}>
                        {levelLabel(log.level)}
                      </span>
                      <span className="px-1.5 py-0.2 rounded font-bold uppercase bg-gray-100 text-gray-700">
                        {log.service}
                      </span>
                    </div>
                  </div>
                  <p className="font-medium text-gray-800 leading-snug">{log.message}</p>
                  {(log.tokensIn || log.tokensOut || log.latencyMs) ? (
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-400 font-mono">
                      <span>{log.tokensIn ?? 0} in / {log.tokensOut ?? 0} out</span>
                      <span>{log.latencyMs ?? 0}ms</span>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {devLogs.length === 0 && !loading && (
              <div className="p-6 text-center text-xs text-gray-400">
                {level || service || search
                  ? 'Nenhum log encontrado com esses filtros.'
                  : 'Nenhum log técnico registrado ainda.'}
              </div>
            )}

            {loading && devLogs.length === 0 && (
              <div className="p-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando logs do banco...
              </div>
            )}
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
                OpenAI
              </span>
            </div>

            {selectedLog ? (
              <div className="mt-3 space-y-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-800 break-words">
                  <div><strong>ID:</strong> {selectedLog.id}</div>
                  <div><strong>Serviço:</strong> {selectedLog.service}</div>
                  <div><strong>Nível:</strong> {levelLabel(selectedLog.level)}</div>
                  <div><strong>Tenant:</strong> {selectedLog.storeId}</div>
                  {(selectedLog.tokensIn || selectedLog.tokensOut) ? (
                    <div><strong>Tokens:</strong> {selectedLog.tokensIn ?? 0} in / {selectedLog.tokensOut ?? 0} out</div>
                  ) : null}
                  {selectedLog.latencyMs ? (
                    <div><strong>Latência:</strong> {selectedLog.latencyMs}ms</div>
                  ) : null}
                  <div className="mt-1 text-gray-600">{selectedLog.message}</div>
                </div>

                <button
                  onClick={handleDiagnoseWithAI}
                  disabled={diagnosing}
                  className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-60"
                >
                  {diagnosing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Agente analisando log...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Diagnosticar com Agente de IA
                    </>
                  )}
                </button>

                {diagnosisError && (
                  <div className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{diagnosisError}</span>
                  </div>
                )}

                {diagnosis && (
                  <div className="mt-3 p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-950 whitespace-pre-wrap leading-relaxed relative">
                    <button
                      onClick={() => copyToClipboard(diagnosis.diagnosis)}
                      className="absolute top-2 right-2 p-1 text-purple-600 hover:text-purple-900"
                      title="Copiar diagnóstico"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {diagnosis.diagnosis}
                    <div className="mt-2 pt-2 border-t border-purple-200 text-[10px] text-purple-500 font-mono">
                      {diagnosis.model} · {diagnosis.tokensUsed} tokens · {diagnosis.latencyMs}ms
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-3 text-center">
                {loading ? 'Carregando logs...' : 'Selecione um log ao lado para analisar.'}
              </p>
            )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
            <div className="flex items-center gap-2 text-[11px] font-bold text-gray-700">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              Eventos por serviço ({summary?.windowDays ?? 30} dias)
            </div>
            <div className="mt-2 space-y-1">
              {Object.entries(summary?.byService ?? {}).length > 0 ? (
                Object.entries(summary?.byService ?? {}).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-[11px] text-gray-600">
                    <span>{name}</span>
                    <span className="font-mono text-gray-800">{count}</span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-gray-400 italic">Sem eventos no período.</p>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
