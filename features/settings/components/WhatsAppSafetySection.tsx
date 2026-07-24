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
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          Segurança do canal WhatsApp
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Kill switch de emergência e e-mail de alerta do health-check da sessão Evolution.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">Kill switch</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Desliga todo envio de WhatsApp da organização imediatamente.
          </p>
        </div>
        <Switch
          checked={state.killSwitchActive}
          onCheckedChange={handleToggleKillSwitch}
          disabled={isLoading || isSaving}
          aria-label="Kill switch do canal WhatsApp"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="whatsapp-alert-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          E-mail de alerta
        </label>
        <div className="flex gap-2 max-w-md">
          <input
            id="whatsapp-alert-email"
            type="email"
            value={state.alertEmail}
            onChange={(e) => setState((prev) => ({ ...prev, alertEmail: e.target.value }))}
            placeholder="ops@aaagencia.com.br"
            disabled={isLoading || isSaving}
            className="w-full px-4 py-2 bg-white dark:bg-dark-bg border border-slate-300 dark:border-dark-border rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={isLoading || isSaving}
            className="px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppSafetySection;
