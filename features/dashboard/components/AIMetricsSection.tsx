/**
 * @fileoverview AI Metrics Section
 *
 * Exibe métricas do AI Agent no Dashboard.
 * Mostra conversas respondidas, HITL pendentes, taxas de avanço.
 *
 * @module features/dashboard/components/AIMetricsSection
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageSquare, Clock, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { useAIMetricsQuery } from '@/lib/query/hooks';

/**
 * Card compacto para exibir uma métrica AI (`.card-kpi`).
 */
function AIMetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'primary' | 'green' | 'amber' | 'red' | 'purple';
  onClick?: () => void;
}) {
  const content = (
    <>
      <h3 className="card-kpi__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={14} aria-hidden="true" />
        {label}
      </h3>
      <p className="card-kpi__value num">{value}</p>
      {subtext && <p className="card-kpi__delta">{subtext}</p>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="card-kpi" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className="card-kpi">{content}</article>;
}

/**
 * Barra de progresso para distribuição de ações.
 */
function ActionDistributionBar({
  responded,
  advanced,
  handoff,
  skipped,
  total,
}: {
  responded: number;
  advanced: number;
  handoff: number;
  skipped: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2">
        <div className="bg-slate-300 dark:bg-slate-600 h-full rounded-full w-full opacity-30" />
      </div>
    );
  }

  const respondedPct = (responded / total) * 100;
  const advancedPct = (advanced / total) * 100;
  const handoffPct = (handoff / total) * 100;
  const skippedPct = (skipped / total) * 100;

  return (
    <div className="space-y-2">
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden flex">
        <div
          className="bg-green-500 h-full"
          style={{ width: `${respondedPct}%` }}
          title={`Respondidas: ${responded}`}
        />
        <div
          className="bg-blue-500 h-full"
          style={{ width: `${advancedPct}%` }}
          title={`Avançou Estágio: ${advanced}`}
        />
        <div
          className="bg-amber-500 h-full"
          style={{ width: `${handoffPct}%` }}
          title={`Handoff: ${handoff}`}
        />
        <div
          className="bg-slate-400 h-full"
          style={{ width: `${skippedPct}%` }}
          title={`Ignoradas: ${skipped}`}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Respondidas ({responded})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          Avançou ({advanced})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          Handoff ({handoff})
        </div>
      </div>
    </div>
  );
}

export function AIMetricsSection() {
  const router = useRouter();
  const { data, isLoading, error } = useAIMetricsQuery();

  if (error) {
    return null; // Silently hide on error
  }

  if (isLoading) {
    return (
      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title title-sm">performance da IA</h3>
        </div>
        <div className="skeleton-stack">
          <span className="skeleton skeleton--kpi" />
          <span className="skeleton skeleton--kpi" />
        </div>
      </section>
    );
  }

  if (!data || data.conversations.thisMonth.total === 0) {
    // No AI activity yet - show a minimal placeholder
    return (
      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title title-sm">performance da IA</h3>
        </div>
        <div className="state-empty">
          <Sparkles size={24} aria-hidden="true" />
          <p className="state-empty__text">
            nenhuma conversa de IA registrada ainda — configure o agente nas configurações pra começar a automatizar.
          </p>
        </div>
      </section>
    );
  }

  const { conversations, hitl, tokensUsed } = data;
  const monthStats = conversations.thisMonth;

  return (
    <section className="panel">
      <div className="panel__head">
        <h3 className="panel__title title-sm">performance da IA</h3>
      </div>

      <div className="kpi-grid">
        <AIMetricCard
          icon={MessageSquare}
          label="conversas hoje"
          value={conversations.today.total}
          subtext={`${conversations.thisWeek.total} esta semana`}
        />

        <AIMetricCard
          icon={hitl.pending > 0 ? AlertCircle : CheckCircle}
          label="HITL pendentes"
          value={hitl.pending}
          subtext={hitl.pending > 0 ? 'aguardando aprovação' : 'nenhum pendente'}
          onClick={() => router.push('/settings?tab=ai')}
        />

        <AIMetricCard
          icon={CheckCircle}
          label="taxa aprovação HITL"
          value={`${hitl.approvalRate.toFixed(0)}%`}
          subtext={`${hitl.approved} aprovados, ${hitl.rejected} rejeitados`}
        />

        <AIMetricCard
          icon={Clock}
          label="auto-avanços"
          value={monthStats.advancedStage}
          subtext={`${hitl.autoApproved} automáticos este mês`}
        />
      </div>

      {/* Action Distribution */}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <p className="meta" style={{ marginBottom: 'var(--space-2)' }}>distribuição de ações (este mês)</p>
        <ActionDistributionBar
          responded={monthStats.responded}
          advanced={monthStats.advancedStage}
          handoff={monthStats.handoff}
          skipped={monthStats.skipped}
          total={monthStats.total}
        />
        <p className="meta" style={{ marginTop: 'var(--space-2)' }}>
          total: {monthStats.total} interações · tokens: {tokensUsed.thisMonth.toLocaleString('pt-BR')}
        </p>
      </div>
    </section>
  );
}
