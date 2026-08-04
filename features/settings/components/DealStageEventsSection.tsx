import React, { useCallback, useEffect, useState } from 'react';
import { Send, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

/**
 * T3 (emissor) — visibilidade + reenvio manual da ponte Negociação → Gerador
 * de Propostas Comerciais. Mesmo padrão "Reenviar" já usado no ecossistema
 * (Propostas → CRM, ver HANDOFF.md do gerador de propostas): lista os
 * últimos eventos que falharam ao notificar o Gerador de Propostas quando um
 * deal entrou em "Topou receber proposta", com botão pra reciclar pro próximo ciclo
 * do dispatcher (Edge Function deal-stage-dispatcher, via pg_cron).
 *
 * Componente isolado de propósito (não integrado ao WebhooksSection.tsx já
 * existente, ~1200 linhas com estado próprio complexo) — evita risco de
 * quebrar aquele fluxo pra adicionar uma seção sem relação direta com
 * webhooks configuráveis por endpoint.
 */

type DealStageEventRow = {
  id: string;
  deal_id: string;
  external_event_id: string;
  contador: number;
  status: 'pendente' | 'enviado' | 'falhou';
  attempt_count: number;
  response_status: number | null;
  erro: string | null;
  created_at: string;
  sent_at: string | null;
  last_attempt_at: string | null;
};

export function DealStageEventsSection() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [events, setEvents] = useState<DealStageEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const canUse = !!profile?.organization_id;

  const load = useCallback(async () => {
    if (!canUse || !supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('deal_stage_events')
        .select('id,deal_id,external_event_id,contador,status,attempt_count,response_status,erro,created_at,sent_at,last_attempt_at')
        .order('created_at', { ascending: false })
        .limit(20);
      setEvents((data as DealStageEventRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, [canUse]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRetry(eventId: string) {
    if (!supabase) return;
    setRetryingId(eventId);
    try {
      const { error } = await supabase.rpc('retry_deal_stage_event', { p_event_id: eventId });
      if (error) throw error;
      addToast('Evento reciclado — será reenviado no próximo ciclo (até 2min).', 'success');
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao reenviar evento', 'error');
    } finally {
      setRetryingId(null);
    }
  }

  if (!canUse) return null;

  const falhados = events.filter((e) => e.status === 'falhou');

  return (
    <section className="panel">
      <h2 className="panel__title title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Send className="h-4 w-4" />
        ponte propostas comerciais (T3)
      </h2>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Quando um deal entra em &quot;Topou receber proposta&quot; no board Negociação, o Gerador de
          Propostas Comerciais é notificado automaticamente pra criar uma proposta-rascunho.
          Últimos 20 eventos:
        </p>

        {loading && events.length === 0 && (
          <p className="text-sm text-slate-400">Carregando…</p>
        )}

        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-400">Nenhum deal entrou em &quot;Topou receber proposta&quot; ainda.</p>
        )}

        {events.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-white/5 text-left text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Evento</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Tentativas</th>
                  <th className="px-3 py-2 font-medium">Criado em</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {ev.external_event_id}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          ev.status === 'enviado'
                            ? 'text-green-600 dark:text-green-400'
                            : ev.status === 'falhou'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {ev.status === 'falhou' && <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />}
                        {ev.status}
                        {ev.response_status ? ` (HTTP ${ev.response_status})` : ''}
                      </span>
                      {ev.erro && ev.status === 'falhou' && (
                        <div className="text-xs text-slate-400 mt-0.5 max-w-xs truncate" title={ev.erro}>
                          {ev.erro}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{ev.attempt_count}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      {new Date(ev.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {ev.status === 'falhou' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={retryingId === ev.id}
                          onClick={() => handleRetry(ev.id)}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${retryingId === ev.id ? 'animate-spin' : ''}`} />
                          Reenviar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {falhados.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar lista
          </Button>
        )}
      </div>
    </section>
  );
}
