'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import { useToast } from '@/context/ToastContext';
import type { ChannelStatus, ChannelType } from '@/lib/messaging/types/channel.types';

interface WhatsAppSafetyState {
  killSwitchActive: boolean;
  alertEmail: string;
  autoSendProposalWhatsapp: boolean;
}

/**
 * Kill switch + e-mail de alerta do health-check da sessão Evolution (T4).
 * Ver T4-EXECUCAO.md item 4.
 */
export const WhatsAppSafetySection: React.FC = () => {
  const { addToast } = useToast();
  const [state, setState] = useState<WhatsAppSafetyState>({
    killSwitchActive: false,
    alertEmail: '',
    autoSendProposalWhatsapp: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus | null>(null);
  const [confirmAutoSendOpen, setConfirmAutoSendOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/settings/whatsapp-safety');
        const data = await res.json();
        if (!cancelled) {
          setState({
            killSwitchActive: Boolean(data.killSwitchActive),
            alertEmail: data.alertEmail ?? '',
            autoSendProposalWhatsapp: Boolean(data.autoSendProposalWhatsapp),
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await fetch('/api/messaging/channels');
        if (!res.ok) return;
        const data = await res.json();
        const whatsappChannel = (data.channels ?? []).find(
          (c: { channel_type: ChannelType }) => c.channel_type === 'whatsapp'
        );
        if (!cancelled) {
          setChannelStatus(whatsappChannel?.status ?? null);
        }
      } catch {
        // Status do canal é só um aviso informativo — falha aqui não deve travar a tela.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (
    updates: Partial<{ killSwitchActive: boolean; alertEmail: string; autoSendProposalWhatsapp: boolean }>
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/whatsapp-safety', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        addToast(body.error || 'Erro ao salvar', 'error');
        return false;
      }
      addToast('Configuração salva', 'success');
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleKillSwitch = async (checked: boolean) => {
    const previous = state.killSwitchActive;
    setState((prev) => ({ ...prev, killSwitchActive: checked }));
    const ok = await save({ killSwitchActive: checked });
    if (!ok) {
      setState((prev) => ({ ...prev, killSwitchActive: previous }));
    }
  };

  const handleSaveEmail = () => {
    save({ alertEmail: state.alertEmail });
  };

  const applyAutoSendProposal = async (checked: boolean) => {
    const previous = state.autoSendProposalWhatsapp;
    setState((prev) => ({ ...prev, autoSendProposalWhatsapp: checked }));
    const ok = await save({ autoSendProposalWhatsapp: checked });
    if (!ok) {
      setState((prev) => ({ ...prev, autoSendProposalWhatsapp: previous }));
    }
  };

  const handleToggleAutoSendProposal = (checked: boolean) => {
    if (checked) {
      setConfirmAutoSendOpen(true);
      return;
    }
    applyAutoSendProposal(false);
  };

  const handleConfirmAutoSendProposal = () => {
    setConfirmAutoSendOpen(false);
    applyAutoSendProposal(true);
  };

  return (
    <section className="panel">
      <h2 className="panel__title title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldAlert className="w-4 h-4" />
        segurança do canal whatsapp
      </h2>
      <p className="meta">
        Kill switch de emergência e e-mail de alerta do health-check da sessão Evolution.
      </p>

      <ul className="panel__body" style={{ marginTop: 'var(--space-3)' }}>
        <li className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__title">Kill switch</span>
            <span className="setting-row__desc">Desliga todo envio de WhatsApp da organização imediatamente.</span>
          </span>
          <Switch
            checked={state.killSwitchActive}
            onCheckedChange={handleToggleKillSwitch}
            disabled={isLoading || isSaving}
            aria-label="Kill switch do canal WhatsApp"
          />
        </li>
        <li className="setting-row">
          <span className="setting-row__text">
            <span className="setting-row__title">Enviar proposta automaticamente por WhatsApp</span>
            <span className="setting-row__desc">
              Quando um deal entra em &quot;Proposta pronta&quot;, envia o link da proposta por WhatsApp além do
              e-mail automático.
            </span>
            {channelStatus !== null && channelStatus !== 'connected' && (
              <span
                className="setting-row__desc"
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-warning, #b45309)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Canal WhatsApp está desconectado — nada será enviado até reconectar.
              </span>
            )}
          </span>
          <Switch
            checked={state.autoSendProposalWhatsapp}
            onCheckedChange={handleToggleAutoSendProposal}
            disabled={isLoading || isSaving}
            aria-label="Enviar proposta automaticamente por WhatsApp"
          />
        </li>
      </ul>

      <ConfirmModal
        isOpen={confirmAutoSendOpen}
        onClose={() => setConfirmAutoSendOpen(false)}
        onConfirm={handleConfirmAutoSendProposal}
        title="Ligar envio automático de proposta por WhatsApp?"
        message={
          <div>
            A partir de agora, sempre que um deal entrar em &quot;Proposta pronta&quot;, o CRM vai enviar o link da
            proposta por WhatsApp automaticamente para o lead — sem revisão humana antes do envio.
          </div>
        }
        confirmText="Ligar"
        cancelText="Cancelar"
        variant="primary"
      />

      <div className="field" style={{ marginTop: 'var(--space-3)', maxWidth: 420 }}>
        <label htmlFor="whatsapp-alert-email" className="field__label">
          E-mail de alerta
        </label>
        <div className="chip-row" style={{ gap: 8 }}>
          <input
            id="whatsapp-alert-email"
            type="email"
            value={state.alertEmail}
            onChange={(e) => setState((prev) => ({ ...prev, alertEmail: e.target.value }))}
            placeholder="ops@aaagencia.com.br"
            disabled={isLoading || isSaving}
            className="input"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={isLoading || isSaving}
            className="btn btn--primary"
          >
            Salvar
          </button>
        </div>
      </div>
    </section>
  );
};

export default WhatsAppSafetySection;
