import React, { useEffect, useState } from 'react';
import {
  CircleCheckBig,
  FlaskConical,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';

/**
 * Card "Modo Teste" (Fase 11 / Onda 1.5).
 *
 * Permite conectar o WhatsApp real e testar a IA com segurança:
 *  - só os números cadastrados entram no CRM e recebem resposta automática;
 *  - qualquer outro contato é descartado pelo webhook **sem gravar nada** (nem Lead, nem log).
 *
 * O toggle e a lista ficam salvos no banco (por loja), então valem para a Vercel também.
 */

const FALLBACK_MAX_NUMBERS = 10;

/** Espelho da normalização do servidor: E.164 só com dígitos. */
function normalizePhoneInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^[\d\s()+\-.\u00A0]+$/.test(value)) return null;

  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}

export const TestModeCard: React.FC = () => {
  const { testMode, testModeLoading, refreshTestMode, saveTestMode, whatsapp, addNotification } =
    useCRM();

  const [enabled, setEnabled] = useState(false);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxNumbers = testMode?.maxNumbers ?? FALLBACK_MAX_NUMBERS;
  const evolutionEnabled = whatsapp?.evolution.enabled ?? false;
  const whatsappConnected = whatsapp?.status === 'CONNECTED';

  // Hidrata os campos quando a configuração chega do contexto (carga inicial ou depois de salvar).
  useEffect(() => {
    if (!testMode) return;
    setEnabled(testMode.enabled);
    setNumbers(testMode.numbers);
  }, [testMode]);

  const savedEnabled = testMode?.enabled ?? false;
  const savedNumbers = testMode?.numbers ?? [];
  const dirty =
    enabled !== savedEnabled ||
    numbers.length !== savedNumbers.length ||
    numbers.some((number, index) => number !== savedNumbers[index]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await refreshTestMode();
      if (!data) setError('Não foi possível consultar o modo teste. Verifique o backend.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAdd = () => {
    const normalized = normalizePhoneInput(input);
    if (!normalized) {
      setError('Número inválido. Informe DDD + número, por exemplo +55 98 98845-1290.');
      return;
    }
    if (numbers.includes(normalized)) {
      setError('Esse número já está na lista de teste.');
      return;
    }
    if (numbers.length >= maxNumbers) {
      setError(`O modo teste aceita no máximo ${maxNumbers} números.`);
      return;
    }
    setNumbers((prev) => [...prev, normalized]);
    setInput('');
    setError(null);
  };

  const handleRemove = (number: string) => {
    setNumbers((prev) => prev.filter((item) => item !== number));
    setError(null);
  };

  const handleSave = async () => {
    if (saving) return;

    if (enabled && numbers.length === 0) {
      setError('Cadastre pelo menos um número antes de ligar o modo teste.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await saveTestMode({ enabled, numbers });
      setEnabled(saved.enabled);
      setNumbers(saved.numbers);
      addNotification(
        saved.enabled
          ? `🔒 Modo teste ativo: a IA só responde a ${saved.numbers.length} número(s).`
          : 'Modo teste desativado.',
      );
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o modo teste.');
    } finally {
      setSaving(false);
    }
  };

  const buttonBase =
    'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div
      className={`bg-white p-5 rounded-2xl border shadow-xs space-y-4 ${
        enabled ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-200/80'
      }`}
    >
      {/* Cabeçalho + toggle */}
      <div className="flex items-start justify-between gap-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              enabled
                ? 'bg-amber-50 border-amber-200'
                : 'bg-brand-50 border-brand-100'
            }`}
          >
            <FlaskConical className={`w-4 h-4 ${enabled ? 'text-amber-600' : 'text-brand-500'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-graphite-900">Modo Teste</h3>
            <p className="hidden sm:block text-[10px] text-gray-400 mt-0.5">
              A IA só responde aos números que você cadastrar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`hidden sm:inline text-[10px] font-bold ${
              enabled ? 'text-amber-700' : 'text-gray-400'
            }`}
          >
            {enabled ? 'LIGADO' : 'desligado'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Ligar ou desligar o modo teste"
            onClick={() => {
              setEnabled((prev) => !prev);
              setError(null);
            }}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              enabled ? 'bg-amber-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
            title="Recarregar a configuração do modo teste"
            aria-label="Recarregar a configuração do modo teste"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Estado de carregamento / offline */}
      {testModeLoading && testMode === null ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-400">
          <LoaderCircle className="w-5 h-5 animate-spin text-brand-500" />
          <span className="text-xs">Consultando o modo teste...</span>
        </div>
      ) : testMode === null ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] leading-relaxed text-amber-700">
              Não foi possível consultar o modo teste no servidor. Sem essa resposta, a tela não
              sabe se o modo está ligado — confira o backend antes de conectar o WhatsApp.
            </p>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Explicação / aviso quando ligado */}
          {enabled ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-bold text-amber-900">
                  Modo teste ativo: só os números da lista entram no CRM
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Mensagens de qualquer outro contato são <strong>descartadas antes de gravar</strong>{' '}
                  — não aparecem no funil, nos chats nem nos logs. A IA responde automaticamente
                  apenas para os números abaixo.
                </p>
              </div>
            </div>
          ) : (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-500">
              <Info className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
              Desligado, o CRM registra todos os contatos e <strong>não responde sozinho</strong> no
              WhatsApp (a automação geral chega na Onda 2). Ligue para testar a IA com segurança.
            </p>
          )}

          {/* Diagnóstico do que falta para o teste ponta a ponta */}
          {enabled && !evolutionEnabled && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <TriangleAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-red-700">
                O envio pelo WhatsApp está <strong>desligado no servidor</strong>{' '}
                (<code className="font-mono">EVOLUTION_ENABLED=false</code>). A IA não conseguirá
                responder. Ative a variável na Vercel (Production) e faça um <strong>Redeploy</strong>.
              </p>
            </div>
          )}
          {enabled && evolutionEnabled && !whatsappConnected && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Smartphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-amber-800">
                Conecte o WhatsApp no card <strong>Conexão WhatsApp</strong> acima para as respostas
                automáticas chegarem ao celular.
              </p>
            </div>
          )}
          {enabled && evolutionEnabled && whatsappConnected && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <CircleCheckBig className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-emerald-800">
                <strong>Pronto para testar:</strong> envie uma mensagem do número de teste para o
                WhatsApp conectado e a IA responde automaticamente.
              </p>
            </div>
          )}

          {/* Lista de números */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-700">
                Números de teste
              </label>
              <span className="text-[10px] text-gray-400 font-medium">
                {numbers.length}/{maxNumbers}
              </span>
            </div>

            {numbers.length === 0 ? (
              <p className="text-[11px] text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-center">
                Nenhum número cadastrado ainda. Use o número do seu segundo celular.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {numbers.map((number) => (
                  <li
                    key={number}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-graphite-900 truncate">
                      {formatPhone(number)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(number)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                      title="Remover número de teste"
                      aria-label={`Remover ${formatPhone(number)} da lista de teste`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="+55 98 98845-1290"
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!input.trim() || numbers.length >= maxNumbers}
                className={`${buttonBase} bg-white border border-brand-200 text-brand-600 hover:bg-brand-50`}
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              Informe DDD + número. O CRM normaliza e salva em E.164 (ex.:{' '}
              <span className="font-mono">5598988451290</span>).
            </p>
          </div>

          {/* Erro da última ação */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <TriangleAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-red-700">{error}</p>
            </div>
          )}

          {/* Salvar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <p className="text-[10px] text-gray-400">
              {dirty ? 'Há alterações não salvas.' : 'Configuração salva no banco desta loja.'}
            </p>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className={`${buttonBase} bg-brand-500 text-white hover:bg-brand-600 shadow-xs`}
            >
              {saving ? (
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? 'Salvando...' : 'Salvar modo teste'}
            </button>
          </div>

          {/* Passo a passo */}
          <details className="pt-2 border-t border-gray-100">
            <summary className="text-[11px] font-semibold text-gray-600 cursor-pointer select-none">
              Como testar de ponta a ponta
            </summary>
            <ol className="mt-2 space-y-1.5">
              {[
                'Cadastre o número do segundo celular e salve com o modo teste ligado.',
                'Conecte o WhatsApp da loja em “Conexão WhatsApp” (QR Code).',
                'Envie uma mensagem do segundo celular para o número conectado.',
                'A mensagem aparece no chat e a IA responde automaticamente.',
                'Ao terminar os testes, desligue o modo teste e clique em Salvar.',
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-2 text-[11px] text-gray-600 leading-relaxed"
                >
                  <span className="w-4 h-4 rounded-full bg-brand-50 text-brand-600 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </div>
  );
};
