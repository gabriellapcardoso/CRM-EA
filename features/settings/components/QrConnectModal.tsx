'use client';

/**
 * @fileoverview QR code modal for (re)connecting a WhatsApp channel (z-api / evolution).
 *
 * State machine:
 *
 *   disconnected/error ──[abre o modal]──> waiting_qr ──[Evolution webhook: scan OK]──> connected
 *           ^                                  │
 *           │                                  │ [expira, ~60s — expiresAt vem do backend]
 *           └──────[usuário fecha o modal]───── expired ──[clica "gerar novo"]──> waiting_qr (novo)
 *
 * O modal controla seu próprio fetch/retry (busca o QR ao abrir, não recebe
 * via props do pai) e faz polling leve (sem `credentials`) enquanto aberto
 * pra detectar quando o canal virou `connected` via webhook.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, Wifi } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  useConnectChannelMutation,
  useChannelConnectionStatus,
} from '@/lib/query/hooks/useChannelsQuery';

interface QrConnectModalProps {
  channelId: string;
  channelName: string;
  isOpen: boolean;
  onClose: () => void;
}

function normalizeQrSrc(qrCode: string): string {
  return qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; qrCode: string; expiresAt: string }
  | { status: 'reconnected' }
  | { status: 'error'; message: string };

export function QrConnectModal({ channelId, channelName, isOpen, onClose }: QrConnectModalProps) {
  const [state, setState] = useState<FetchState>({ status: 'idle' });
  const [now, setNow] = useState(() => Date.now());

  const connectMutation = useConnectChannelMutation();
  const statusQuery = useChannelConnectionStatus(channelId, isOpen);

  const fetchQrCode = () => {
    setState({ status: 'loading' });
    connectMutation.mutate(channelId, {
      onSuccess: (data) =>
        'alreadyConnected' in data
          ? setState({ status: 'reconnected' })
          : setState({ status: 'success', qrCode: data.qrCode, expiresAt: data.expiresAt }),
      onError: (error) =>
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Erro ao gerar QR code.' }),
    });
  };

  // Busca o QR ao abrir o modal. state.status leva a ref para fora do array de
  // deps de propósito — reabrir precisa refazer o fetch mesmo se a última
  // tentativa terminou em erro; ver fetchQrCode acima pro fluxo de retry.
  useEffect(() => {
    if (!isOpen) {
      setState({ status: 'idle' });
      return;
    }
    fetchQrCode();
  }, [isOpen, channelId]);

  // Tick pra recalcular expiração enquanto o modal está aberto
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Fecha sozinho quando o polling detecta status 'connected'
  useEffect(() => {
    if (isOpen && statusQuery.data?.status === 'connected') {
      onClose();
    }
  }, [isOpen, statusQuery.data?.status, onClose]);

  const isExpired = state.status === 'success' ? now >= new Date(state.expiresAt).getTime() : false;

  const handleRegenerate = () => fetchQrCode();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Conectar ${channelName}`} size="sm">
      <div className="flex flex-col items-center gap-4 py-2">
        {state.status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Gerando QR code...</p>
          </div>
        )}

        {state.status === 'reconnected' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Wifi className="w-6 h-6 text-green-500" />
            <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
              Sessão reconectada automaticamente, sem precisar de QR code.
            </p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-red-600 dark:text-red-400 text-center">{state.message}</p>
            <button
              type="button"
              onClick={handleRegenerate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {state.status === 'success' && (
          <>
            {isExpired ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <p className="text-sm text-slate-600 dark:text-slate-300">QR code expirado.</p>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                    bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                >
                  <Wifi className="w-4 h-4" />
                  Gerar novo QR code
                </button>
              </div>
            ) : (
              <>
                <img
                  src={normalizeQrSrc(state.qrCode)}
                  alt="QR code para conectar o WhatsApp"
                  className="w-56 h-56 rounded-lg border border-slate-200 dark:border-white/10"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">
                  Abra o WhatsApp no celular do número do canal, vá em Aparelhos conectados e
                  escaneie o código.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default QrConnectModal;
