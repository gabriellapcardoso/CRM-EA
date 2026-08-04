'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/context/ToastContext';

interface WhatsAppSafetyState {
  killSwitchActive: boolean;
  alertEmail: string;
}

/**
 * Kill switch + e-mail de alerta do health-check da sessão Evolution (T4).
 * Ver T4-EXECUCAO.md item 4.
 */
export const WhatsAppSafetySection: React.FC = () => {
  const { addToast } = useToast();
  const [state, setState] = useState<WhatsAppSafetyState>({ killSwitchActive: false, alertEmail: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (updates: Partial<{ killSwitchActive: boolean; alertEmail: string }>): Promise<boolean> => {
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
      </ul>

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
