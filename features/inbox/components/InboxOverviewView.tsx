import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, TrendingUp, UserX, ArrowRight, Sparkles, Target } from 'lucide-react';
import type { Activity } from '@/types';
import type { AISuggestion } from '../hooks/useInboxController';
import { usePendingAdvanceCountQuery } from '@/lib/query/hooks';
import { PendingAdvancesSection, PendingAdvancesStatCard } from './PendingAdvancesSection';

interface InboxOverviewViewProps {
  overdueActivities: Activity[];
  todayMeetings: Activity[];
  todayTasks: Activity[];
  upcomingActivities: Activity[];
  aiSuggestions: AISuggestion[];

  onGoToList: () => void;
  onStartFocus: () => void;
  onAcceptSuggestion: (suggestion: AISuggestion) => void;

  onOpenOverdue: () => void;
  onOpenToday: () => void;
  onOpenCriticalSuggestions: () => void;
  onOpenPending: () => void;
}

const StatCard: React.FC<{
  label: string;
  value: number;
  tone: 'neutral' | 'danger' | 'success' | 'warning';
  hint?: string;
  onClick?: () => void;
}> = ({ label, value, tone, hint, onClick }) => {
  const valueColor: Record<typeof tone, string> = {
    neutral: 'var(--text-strong)',
    danger: 'var(--danger)',
    warning: '#8a6200',
    success: '#1c7a4a',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="card-kpi w-full text-left"
    >
      <span className="card-kpi__label">{label}</span>
      <span className="card-kpi__value num" style={{ color: valueColor[tone] }}>{value}</span>
      {hint ? <span className="meta">{hint}</span> : null}
    </Component>
  );
};

const SuggestionMiniRow: React.FC<{
  suggestion: AISuggestion;
  onAccept: () => void;
}> = ({ suggestion, onAccept }) => {
  const router = useRouter();

  const icon = useMemo(() => {
    switch (suggestion.type) {
      case 'STALLED':
        return <AlertTriangle size={15} style={{ color: 'var(--warning)' }} aria-hidden="true" />;
      case 'RESCUE':
        return <UserX size={15} style={{ color: 'var(--danger)' }} aria-hidden="true" />;
      case 'UPSELL':
        return <TrendingUp size={15} style={{ color: 'var(--success)' }} aria-hidden="true" />;
      default:
        return <Sparkles size={15} style={{ color: 'var(--purple-700)' }} aria-hidden="true" />;
    }
  }, [suggestion.type]);

  const navigationTarget = useMemo(() => {
    const dealId = suggestion.data.deal?.id;
    const contactId = suggestion.data.contact?.id;
    if (dealId) return `/boards?deal=${dealId}`;
    if (contactId) return `/contacts?contactId=${contactId}`;
    return null;
  }, [suggestion.data.deal?.id, suggestion.data.contact?.id]);

  return (
    <div className="feed__item">
      <span className="shrink-0">{icon}</span>
      <span className="feed__body">
        <span className="feed__text truncate">{suggestion.title}</span>
        <span className="feed__meta truncate">{suggestion.description}</span>
      </span>
      <span className="shrink-0 flex items-center gap-2">
        <button type="button" onClick={onAccept} className="btn btn--primary">
          aplicar
        </button>
        <button
          type="button"
          onClick={() => navigationTarget && router.push(navigationTarget)}
          disabled={!navigationTarget}
          className="btn btn--ghost"
        >
          abrir
        </button>
      </span>
    </div>
  );
};

/**
 * Componente React `InboxOverviewView`.
 *
 * @param {InboxOverviewViewProps} {
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onGoToList,
  onStartFocus,
  onAcceptSuggestion,
  onOpenOverdue,
  onOpenToday,
  onOpenCriticalSuggestions,
  onOpenPending,
} - Parâmetro `{
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onGoToList,
  onStartFocus,
  onAcceptSuggestion,
  onOpenOverdue,
  onOpenToday,
  onOpenCriticalSuggestions,
  onOpenPending,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const InboxOverviewView: React.FC<InboxOverviewViewProps> = ({
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onGoToList,
  onStartFocus,
  onAcceptSuggestion,
  onOpenOverdue,
  onOpenToday,
  onOpenCriticalSuggestions,
  onOpenPending,
}) => {
  const { data: pendingAdvanceCount = 0 } = usePendingAdvanceCountQuery();
  const todayTotal = todayMeetings.length + todayTasks.length;
  const totalPending = overdueActivities.length + todayTotal + aiSuggestions.length + pendingAdvanceCount;

  const highPrioritySuggestions = useMemo(
    () => aiSuggestions.filter(s => s.priority === 'high'),
    [aiSuggestions]
  );

  const riskSuggestions = useMemo(
    () => aiSuggestions.filter(s => s.type === 'STALLED' || s.type === 'RESCUE').slice(0, 5),
    [aiSuggestions]
  );

  const opportunitySuggestions = useMemo(
    () => aiSuggestions.filter(s => s.type === 'UPSELL').slice(0, 5),
    [aiSuggestions]
  );

  const canStartFocus = totalPending > 0;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
      {/* Top CTA */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="title-md">visão geral</h2>
          <p className="meta">diagnóstico rápido do dia (sem virar outra lista de atividades).</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onGoToList} className="btn btn--ghost">
            ver lista
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onStartFocus}
            disabled={!canStartFocus}
            className="btn btn--primary"
            title={canStartFocus ? 'Começar a executar' : 'Nada pendente'}
          >
            <Target size={14} aria-hidden="true" />
            começar foco
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="kpi-grid">
        <StatCard
          label="atrasados"
          value={overdueActivities.length}
          tone={overdueActivities.length > 0 ? 'danger' : 'success'}
          hint={overdueActivities.length > 0 ? 'prioridade máxima' : 'tudo em dia'}
          onClick={onOpenOverdue}
        />
        <StatCard
          label="hoje"
          value={todayTotal}
          tone={todayTotal > 0 ? 'warning' : 'success'}
          hint={todayTotal > 0 ? `${todayMeetings.length} reuniões · ${todayTasks.length} tarefas` : 'sem tarefas para hoje'}
          onClick={onOpenToday}
        />
        <StatCard
          label="sugestões críticas"
          value={highPrioritySuggestions.length}
          tone={highPrioritySuggestions.length > 0 ? 'warning' : 'neutral'}
          hint={highPrioritySuggestions.length > 0 ? 'risco/oportunidade agora' : 'sem urgências'}
          onClick={onOpenCriticalSuggestions}
        />
        <PendingAdvancesStatCard count={pendingAdvanceCount} />
        <StatCard
          label="pendências"
          value={totalPending}
          tone={totalPending > 0 ? 'neutral' : 'success'}
          hint={upcomingActivities.length > 0 ? `${upcomingActivities.length} próximos` : 'backlog leve'}
          onClick={onOpenPending}
        />
      </div>

      {/* Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 'var(--space-4)' }}>
        <section className="panel">
          <div className="panel__head">
            <AlertTriangle size={15} style={{ color: 'var(--warning)' }} aria-hidden="true" />
            <h3 className="title-sm">risco (resgate e deals parados)</h3>
            <span className="spacer" />
            <button type="button" onClick={onGoToList} className="btn btn--quiet">
              ver tudo
            </button>
          </div>
          {riskSuggestions.length === 0 ? (
            <p className="meta">sem riscos destacados agora.</p>
          ) : (
            <div className="feed">
              {riskSuggestions.map(s => (
                <SuggestionMiniRow key={s.id} suggestion={s} onAccept={() => onAcceptSuggestion(s)} />
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <TrendingUp size={15} style={{ color: 'var(--success)' }} aria-hidden="true" />
            <h3 className="title-sm">oportunidades (upsell)</h3>
            <span className="spacer" />
            <button type="button" onClick={onGoToList} className="btn btn--quiet">
              ver tudo
            </button>
          </div>
          {opportunitySuggestions.length === 0 ? (
            <p className="meta">sem oportunidades destacadas agora.</p>
          ) : (
            <div className="feed">
              {opportunitySuggestions.map(s => (
                <SuggestionMiniRow key={s.id} suggestion={s} onAccept={() => onAcceptSuggestion(s)} />
              ))}
            </div>
          )}
        </section>

        {/* Pending Advances (HITL) */}
        <PendingAdvancesSection limit={5} />
      </div>
    </div>
  );
};
