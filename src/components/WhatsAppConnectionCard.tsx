import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleCheckBig,
  Info,
  LoaderCircle,
  MessageCircle,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  TriangleAlert,
  Unplug,
  WifiOff,
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import type { WhatsAppInstance, WhatsAppInstanceStatus } from '../services/api';

/**
 * Card "Conexão WhatsApp" (Fase 11 / Onda 1 / S5a).
 *
 * - Sem instância: cria a instância (idempotente) e já pede um QR novo quando necessário.
 * - CONNECTING: exibe o QR por proxy, renova sozinho depois de ~30s e faz polling de 5s
 *   somente com a aba visível.
 * - CONNECTED: número, última atividade, desconectar (com confirmação) e reiniciar.
 * - ERROR/DISCONNECTED: tentar novamente (novo QR) e reiniciar.
 *
 * O estado fica no CRMContext para o Header e este card usarem o mesmo status (um polling só).
 */

/** O QR da Evolution expira em ~40s; renovamos com folga aos 30s. */
const QR_RENEW_AFTER_MS = 30_000;
const QR_EXPIRES_AFTER_SECONDS = 40;
const POLL_INTERVAL_MS = 5_000;
/** Evita tempestade de `/connect` quando a Evolution devolve QR vazio/erro. */
const AUTO_CONNECT_COOLDOWN_MS = 15_000;

type BusyAction = 'create' | 'connect' | 'logout' | 'restart' | 'refresh' | null;

function formatPhone(phone: string | null): string {
  if (!phone) return 'Número não informado';
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusMeta(status: WhatsAppInstanceStatus, hasInstance: boolean) {
  if (!hasInstance) {
    return {
      label: 'Não configurado',
      shortLabel: 'Não configurado',
      dot: 'bg-gray-300',
      pill: 'bg-gray-100 text-gray-600 border-gray-200',
    };
  }

  switch (status) {
    case 'CONNECTED':
      return {
        label: 'Conectado',
        shortLabel: 'Conectado',
        dot: 'bg-emerald-500',
        pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'CONNECTING':
      return {
        label: 'Aguardando conexão',
        shortLabel: 'Aguardando',
        dot: 'bg-amber-500 animate-pulse',
        pill: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'ERROR':
      return {
        label: 'Erro na conexão',
        shortLabel: 'Erro',
        dot: 'bg-red-500',
        pill: 'bg-red-50 text-red-700 border-red-200',
      };
    default:
      return {
        label: 'Desconectado',
        shortLabel: 'Desconectado',
        dot: 'bg-gray-400',
        pill: 'bg-gray-100 text-gray-600 border-gray-200',
      };
  }
}

export const WhatsAppConnectionCard: React.FC = () => {
  const {
    whatsapp,
    whatsappLoading,
    whatsappError,
    refreshWhatsApp,
    createWhatsApp,
    connectWhatsApp,
    logoutWhatsApp,
    restartWhatsApp,
    addNotification,
  } = useCRM();

  const [busy, setBusy] = useState<BusyAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const busyRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const renewingRef = useRef(false);
  const autoConnectAtRef = useRef(0);

  const hasInstance = Boolean(whatsapp?.id);
  /** Estreita o tipo para os blocos que só renderizam com instância criada. */
  const instance = hasInstance ? whatsapp : null;
  const status = whatsapp?.status ?? 'DISCONNECTED';
  const isConnected = hasInstance && status === 'CONNECTED';
  const isConnecting = hasInstance && status === 'CONNECTING';
  const isDisconnected = hasInstance && (status === 'DISCONNECTED' || status === 'ERROR');
  const isInitialLoading = whatsapp === null && whatsappLoading;
  const meta = getStatusMeta(status, hasInstance);

  // Contador local só para o texto "expira em ~Xs" do QR (1s, sem chamadas de rede).
  useEffect(() => {
    if (!isConnecting) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [isConnecting]);

  const qrUpdatedMs = whatsapp?.qrUpdatedAt ? new Date(whatsapp.qrUpdatedAt).getTime() : NaN;
  const qrAgeSeconds = Number.isFinite(qrUpdatedMs)
    ? Math.max(0, Math.floor((now - qrUpdatedMs) / 1_000))
    : null;
  const qrSecondsLeft =
    qrAgeSeconds === null ? null : Math.max(0, QR_EXPIRES_AFTER_SECONDS - qrAgeSeconds);
  /** QR em cache vencido não é exibido: mostra o placeholder até o `/connect` renovar. */
  const qrIsFresh = qrAgeSeconds === null || qrAgeSeconds <= QR_RENEW_AFTER_MS;

  /**
   * Renova o QR quando ele sumiu ou passou de 30s. Tem trava de concorrência e
   * cooldown para não transformar uma falha da Evolution em loop de `/connect`.
   */
  const renewQrIfNeeded = useCallback(
    async (instance: WhatsAppInstance | null) => {
      if (!instance || instance.status !== 'CONNECTING') return;

      const updatedAt = instance.qrUpdatedAt ? new Date(instance.qrUpdatedAt).getTime() : 0;
      const age = updatedAt ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
      const needsNewQr = !instance.qrCode || age > QR_RENEW_AFTER_MS;
      if (!needsNewQr) return;
      if (renewingRef.current) return;
      if (Date.now() - autoConnectAtRef.current < AUTO_CONNECT_COOLDOWN_MS) return;

      renewingRef.current = true;
      autoConnectAtRef.current = Date.now();
      try {
        await connectWhatsApp();
      } catch (error) {
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível renovar o QR Code automaticamente.',
        );
      } finally {
        renewingRef.current = false;
      }
    },
    [connectWhatsApp],
  );

  // Abrir a tela: única consulta com `?refresh=1` (além do botão "Atualizar").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await refreshWhatsApp({ refresh: true, silent: true });
      if (cancelled || !data) return;
      await renewQrIfNeeded(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshWhatsApp, renewQrIfNeeded]);

  // Polling de 5s só com a aba visível; pausa durante ações e nunca dispara em paralelo.
  useEffect(() => {
    if (!isConnecting) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (pollInFlightRef.current || busyRef.current) return;

      pollInFlightRef.current = true;
      try {
        const next = await refreshWhatsApp({ silent: true });
        if (cancelled || !next) return;

        if (next.status === 'CONNECTED') {
          addNotification('✅ WhatsApp conectado com sucesso!');
          return;
        }

        await renewQrIfNeeded(next);
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const interval = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    // Voltou para a aba: atualiza na hora em vez de esperar o próximo ciclo.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isConnecting, refreshWhatsApp, renewQrIfNeeded, addNotification]);

  const runAction = async (
    action: Exclude<BusyAction, null | 'refresh'>,
    task: () => Promise<unknown>,
    successMessage: string,
  ) => {
    if (busyRef.current || renewingRef.current) return;

    busyRef.current = true;
    setBusy(action);
    setErrorMessage(null);
    try {
      await task();
      addNotification(successMessage);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível concluir a ação. Tente novamente.';
      setErrorMessage(message);
      addNotification(`⚠️ ${message}`);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    if (busyRef.current || renewingRef.current) return;

    busyRef.current = true;
    setBusy('create');
    setErrorMessage(null);
    try {
      const created = await createWhatsApp();
      // Feedback assim que a instância existe: o QR que veio do `/instance` já pode
      // ser exibido enquanto o `/connect` busca um QR novo (o cache pode estar vencido).
      addNotification('Conexão criada! Escaneie o QR Code com o WhatsApp da loja.');

      if (created.status === 'CONNECTED') return;
      try {
        await connectWhatsApp();
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'A conexão foi criada, mas não foi possível gerar um QR Code novo.';
        setErrorMessage(message);
        addNotification(`⚠️ ${message}`);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível criar a conexão com o WhatsApp.';
      setErrorMessage(message);
      addNotification(`⚠️ ${message}`);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleConnect = () => {
    void runAction(
      'connect',
      () => connectWhatsApp(),
      'Novo QR Code gerado. Escaneie com o WhatsApp da loja.',
    );
  };

  const handleRestart = () => {
    setConfirmLogout(false);
    void runAction(
      'restart',
      async () => {
        const restarted = await restartWhatsApp();
        // O restart limpa o QR e deixa CONNECTING; já buscamos um novo para exibir.
        if (restarted.status === 'CONNECTING' && !restarted.qrCode) {
          await connectWhatsApp();
        }
      },
      'Sessão reiniciada. Aguardando a conexão do celular...',
    );
  };

  const handleLogout = () => {
    setConfirmLogout(false);
    void runAction('logout', () => logoutWhatsApp(), 'WhatsApp desconectado.');
  };

  const handleRefresh = async () => {
    if (busyRef.current || renewingRef.current) return;

    busyRef.current = true;
    setBusy('refresh');
    setErrorMessage(null);
    try {
      const data = await refreshWhatsApp({ refresh: true });
      if (data) {
        addNotification(
          data.status === 'CONNECTED'
            ? '✅ WhatsApp conectado!'
            : 'Status da conexão atualizado.',
        );
        await renewQrIfNeeded(data);
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const buttonBase =
    'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
      {/* Cabeçalho do card + status real */}
      <div className="flex items-start justify-between gap-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4 text-brand-500" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-graphite-900">Conexão WhatsApp</h3>
            <p className="hidden sm:block text-[10px] text-gray-400 mt-0.5">
              Número da loja, QR Code e status em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold ${meta.pill}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            <span className="sm:hidden">{meta.shortLabel}</span>
            <span className="hidden sm:inline">{meta.label}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={busy !== null}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
            title="Atualizar status da conexão"
            aria-label="Atualizar status da conexão"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Webhook ausente: o QR conecta, mas as mensagens não chegam ao CRM. */}
      {whatsapp?.webhookWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-800">Webhook não configurado</p>
            <p className="text-[11px] leading-relaxed text-amber-700">{whatsapp.webhookWarning}</p>
            <p className="text-[10px] leading-relaxed text-amber-700/90 mt-1">
              O QR Code conecta, mas as mensagens recebidas não chegam ao CRM até o webhook ser
              configurado.
            </p>
          </div>
        </div>
      )}

      {/* Cache local quando a Evolution não respondeu ao refresh. */}
      {whatsapp?.stale && (
        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-gray-600">
            Exibindo o último status conhecido.{' '}
            {whatsapp.refreshError ?? 'A Evolution API não respondeu agora.'}
          </p>
        </div>
      )}

      {/* Falha de atualização com estado em cache: mantém o card utilizável e avisa. */}
      {whatsapp && whatsappError && !whatsapp.stale && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-amber-700">
            Não foi possível atualizar o status agora. {whatsappError}
          </p>
        </div>
      )}

      {/* Erro da última ação (toast + inline para não sumir em 3,5s). */}
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <TriangleAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Falha ao carregar o status e nada em cache. */}
      {!isInitialLoading && !whatsapp && whatsappError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <WifiOff className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-red-800">Não foi possível consultar a conexão</p>
            <p className="text-[11px] leading-relaxed text-red-700">{whatsappError}</p>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={busy !== null}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-[10px] font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-60"
            >
              <RefreshCw className="w-3 h-3" />
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {isInitialLoading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400">
          <LoaderCircle className="w-5 h-5 animate-spin text-brand-500" />
          <span className="text-xs">Consultando a conexão do WhatsApp...</span>
        </div>
      ) : !instance ? (
        !whatsappError && (
        /* ---------------------------------------------------------------- */
        /* Sem instância                                                     */
        /* ---------------------------------------------------------------- */
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 py-1">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <Smartphone className="w-7 h-7 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-graphite-900">Conecte o WhatsApp da loja</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Crie a conexão para receber as mensagens dos clientes no CRM e responder por aqui.
              Você escaneia o QR Code com o celular do número da loja.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy !== null}
            className={`${buttonBase} w-full sm:w-auto bg-brand-500 text-white hover:bg-brand-600 shadow-xs shrink-0`}
          >
            {busy === 'create' ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <MessageCircle className="w-3.5 h-3.5" />
            )}
            {busy === 'create' ? 'Criando conexão...' : 'Criar conexão com WhatsApp'}
          </button>
        </div>
        )
      ) : isConnected ? (
        /* ---------------------------------------------------------------- */
        /* Conectado                                                         */
        /* ---------------------------------------------------------------- */
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
              <CircleCheckBig className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-800">WhatsApp conectado</p>
              <p className="text-[11px] text-emerald-700">
                As mensagens do número da loja já podem chegar ao CRM.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Número conectado
              </p>
              <p className="text-xs font-bold text-graphite-900 mt-0.5">
                {formatPhone(instance.phoneNumber)}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Última atividade
              </p>
              <p className="text-xs font-bold text-graphite-900 mt-0.5">
                {formatDateTime(instance.lastSeenAt)}
              </p>
            </div>
          </div>

          {!confirmLogout ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleRestart}
                disabled={busy !== null}
                className={`${buttonBase} bg-white border border-gray-200 text-gray-700 hover:bg-gray-50`}
              >
                <RotateCcw
                  className={`w-3.5 h-3.5 ${busy === 'restart' ? 'animate-spin' : ''}`}
                />
                {busy === 'restart' ? 'Reiniciando...' : 'Reiniciar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                disabled={busy !== null}
                className={`${buttonBase} bg-white border border-red-200 text-red-600 hover:bg-red-50`}
              >
                <Unplug className="w-3.5 h-3.5" />
                Desconectar
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-[11px] font-bold text-red-800">
                Desconectar o WhatsApp deste CRM?
              </p>
              <p className="text-[10px] leading-relaxed text-red-700">
                O celular deixa de enviar mensagens para o CRM e será preciso escanear um novo QR
                Code para reconectar.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={busy !== null}
                  className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}
                >
                  {busy === 'logout' ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unplug className="w-3.5 h-3.5" />
                  )}
                  {busy === 'logout' ? 'Desconectando...' : 'Sim, desconectar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLogout(false)}
                  disabled={busy !== null}
                  className={`${buttonBase} bg-white border border-gray-200 text-gray-600 hover:bg-gray-50`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : isConnecting ? (
        /* ---------------------------------------------------------------- */
        /* Aguardando conexão (QR)                                           */
        /* ---------------------------------------------------------------- */
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="mx-auto sm:mx-0 shrink-0">
            <div className="bg-white p-3 rounded-2xl border-2 border-dashed border-brand-200 shadow-xs inline-block">
              {instance.qrCode && qrIsFresh ? (
                <img
                  src={instance.qrCode}
                  alt="QR Code para conectar o WhatsApp da loja"
                  className="w-52 h-52 sm:w-56 sm:h-56 rounded-xl bg-white"
                />
              ) : (
                <div className="w-52 h-52 sm:w-56 sm:h-56 rounded-xl bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <LoaderCircle className="w-6 h-6 animate-spin text-brand-500" />
                  <span className="text-[11px] text-center px-4">
                    {instance.qrCode
                      ? 'Renovando o QR Code...'
                      : 'Gerando um QR Code novo...'}
                  </span>
                </div>
              )}
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-2">
              {instance.qrCode && qrIsFresh ? (
                <>
                  Gerado às {formatTime(instance.qrUpdatedAt)}
                  {qrSecondsLeft !== null ? ` • expira em ~${qrSecondsLeft}s` : ''}
                </>
              ) : (
                'Renovando automaticamente — aguarde alguns segundos.'
              )}
            </p>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm font-bold text-graphite-900">Aponte a câmera do WhatsApp</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                O CRM está aguardando a conexão do celular.
              </p>
            </div>

            <ol className="space-y-2">
              {[
                'Abra o WhatsApp no celular do número da loja.',
                'Toque em Aparelhos conectados.',
                'Toque em Conectar aparelho e escaneie o código ao lado.',
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

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy !== null}
                className={`${buttonBase} bg-brand-500 text-white hover:bg-brand-600 shadow-xs`}
              >
                {busy === 'connect' ? (
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <QrCode className="w-3.5 h-3.5" />
                )}
                {busy === 'connect' ? 'Gerando...' : 'Gerar novo QR'}
              </button>
              <button
                type="button"
                onClick={handleRestart}
                disabled={busy !== null}
                className={`${buttonBase} bg-white border border-gray-200 text-gray-700 hover:bg-gray-50`}
              >
                <RotateCcw
                  className={`w-3.5 h-3.5 ${busy === 'restart' ? 'animate-spin' : ''}`}
                />
                {busy === 'restart' ? 'Reiniciando...' : 'Reiniciar'}
              </button>
            </div>

          </div>
        </div>
      ) : isDisconnected ? (
        /* ---------------------------------------------------------------- */
        /* Desconectado / erro com instância existente                       */
        /* ---------------------------------------------------------------- */
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <WifiOff className="w-5 h-5 text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-graphite-900">
                {status === 'ERROR' ? 'Não foi possível conectar' : 'WhatsApp desconectado'}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Gere um novo QR Code para reconectar o número da loja. Se a sessão caiu, reinicie a
                conexão.
              </p>
              {instance.lastSeenAt && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Última atividade: {formatDateTime(instance.lastSeenAt)}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy !== null}
              className={`${buttonBase} bg-brand-500 text-white hover:bg-brand-600 shadow-xs`}
            >
              {busy === 'connect' ? (
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <QrCode className="w-3.5 h-3.5" />
              )}
              {busy === 'connect' ? 'Gerando QR...' : 'Tentar novamente'}
            </button>
            <button
              type="button"
              onClick={handleRestart}
              disabled={busy !== null}
              className={`${buttonBase} bg-white border border-gray-200 text-gray-700 hover:bg-gray-50`}
            >
              <RotateCcw
                className={`w-3.5 h-3.5 ${busy === 'restart' ? 'animate-spin' : ''}`}
              />
              {busy === 'restart' ? 'Reiniciando...' : 'Reiniciar'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Transparência: conectar não depende do envio real estar ligado. */}
      {whatsapp && !whatsapp.evolution.enabled && (
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-gray-400">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          O envio de mensagens pelo CRM está desativado neste ambiente (modo de teste). Conectar o
          QR Code já está liberado.
        </p>
      )}

      {/* Aviso de risco (D2): API não oficial, sem disparo em massa. */}
      <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] leading-relaxed text-gray-400">
          <span className="font-semibold text-gray-500">
            Use um número dedicado e por sua conta e risco.
          </span>{' '}
          A conexão usa a API não oficial do WhatsApp (Baileys) e o número pode ser banido se o
          WhatsApp identificar uso automatizado. Mantenha o celular do chip ligado e não dispare
          mensagens em massa.
        </p>
      </div>
    </div>
  );
};
