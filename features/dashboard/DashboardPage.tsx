'use client'

/**
 * @fileoverview Dashboard — redesenhado a partir de `dashboard(+estados).html`
 * (ver REDESIGN-CRM.md). Vocabulário visual: `.kpi-grid`/`.card-kpi`,
 * `.banner--hitl`/`.banner--error`, `.panel`/`.funnel`/`.feed`, `.skeleton*`.
 *
 * @module features/dashboard/DashboardPage
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useActivities } from '@/lib/query/hooks/useActivitiesQuery';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
import { useDeals } from '@/lib/query/hooks/useDealsQuery';
import { useContacts } from '@/lib/query/hooks/useContactsQuery';
import { useAuth } from '@/context/AuthContext';
import decisionQueueService from '@/features/decisions/services/decisionQueueService';
import type { Decision } from '@/features/decisions/types';
import { PipelineAlertsModal } from './components/PipelineAlertsModal';
import { AIMetricsSection } from './components/AIMetricsSection';
import { MessagingMetricsSection } from './components/MessagingMetricsSection';
import { RecentFeed } from './components/RecentFeed';
import { useDashboardMetrics, PeriodFilter, COMPARISON_LABELS } from './hooks/useDashboardMetrics';
import { PeriodFilterSelect } from '@/components/filters/PeriodFilterSelect';
import { formatBRL } from '@/lib/utils/formatCurrency';

/** Grid 2 colunas usada pelo mock (`.ds-grid`) — classe vive só em `design-system.css`
 *  do handoff, que não foi trazido pro app (ver REDESIGN-CRM.md, decisão 1). Replicado
 *  inline, como "último recurso" pra dado/estilo que não tem classe correspondente. */
const dsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--space-3)',
  alignItems: 'start',
};

function formatChange(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  const sign = isPositive ? '+' : '';
  return { text: `${sign}${value.toFixed(1)}%`, isPositive };
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'bom dia';
  if (hour < 18) return 'boa tarde';
  return 'boa noite';
}

const EYEBROW_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const DashboardPage: React.FC = () => {
  const router = useRouter();
  const { profile } = useAuth();
  const { data: activities = [] } = useActivities();
  const { data: boards = [] } = useBoards();
  const [period, setPeriod] = useState<PeriodFilter>('this_month');
  const [showPipelineAlerts, setShowPipelineAlerts] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [pendingDecisions, setPendingDecisions] = useState<Decision[]>([]);
  const [greeting, setGreeting] = useState<{ salutation: string; eyebrow: string }>({ salutation: '', eyebrow: '' });

  // Erros/refetch das queries base — usados no banner de erro (mesma fonte de dados
  // que useDashboardMetrics consome; ele próprio não expõe isError/refetch).
  const { isError: dealsError, refetch: refetchDeals } = useDeals();
  const { isError: contactsError, refetch: refetchContacts } = useContacts();
  const hasError = dealsError || contactsError;

  // Decisões pendentes: mesma fonte do pill do shell (Layout.tsx) — lida em
  // useEffect pra não gerar mismatch de hidratação (localStorage não existe no server).
  useEffect(() => {
    const refresh = () => setPendingDecisions(decisionQueueService.getPendingDecisions());
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Saudação/data também dependem do horário local do navegador — mesmo motivo.
  useEffect(() => {
    const now = new Date();
    setGreeting({
      salutation: getGreeting(now.getHours()),
      eyebrow: EYEBROW_FORMATTER.format(now),
    });
  }, []);

  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) {
      const defaultB = boards.find(b => b.isDefault) || boards[0];
      setSelectedBoardId(defaultB.id);
    }
  }, [boards, selectedBoardId]);

  const {
    isLoading,
    pipelineValue,
    funnelData,
    wonDeals,
    wonRevenue,
    winRate,
    riskyCount,
    stagnantDealsCount,
    stagnantDealsValue,
    changes,
    activeSnapshotDeals,
    activePercent,
    inactivePercent,
    churnedPercent,
    activeContacts,
    inactiveContacts,
    churnedContacts,
    avgLTV,
  } = useDashboardMetrics(period, selectedBoardId);

  const pipelineChangeInfo = formatChange(changes.pipeline);
  const winRateChangeInfo = formatChange(changes.winRate);

  const firstName = profile?.first_name?.toLowerCase() || '';
  const oldestPendingMinutes = pendingDecisions.length > 0
    ? Math.max(0, Math.round((Date.now() - new Date(pendingDecisions[pendingDecisions.length - 1].createdAt).getTime()) / 60000))
    : 0;

  const maxFunnelCount = Math.max(1, ...funnelData.map(s => s.count));

  return (
    <div className="screen__inner screen__inner--wide">
      <div className="panel__head">
        <div>
          <p className="eyebrow">{greeting.eyebrow}</p>
          <h2 className="title-xl">
            {greeting.salutation}{firstName ? `, ${firstName}` : ''}
            <span className="dot-accent">.</span>
          </h2>
        </div>
        <span className="spacer" />
        {boards.length > 1 && (
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            aria-label="Selecionar pipeline"
            className="input"
            style={{ width: 'auto' }}
          >
            {boards.map(board => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>
        )}
        <PeriodFilterSelect value={period} onChange={setPeriod} />
        <button
          type="button"
          onClick={() => setShowPipelineAlerts(true)}
          className="btn btn--ghost"
          title="Alertas de pipeline"
        >
          <AlertTriangle size={16} aria-hidden="true" />
          {(riskyCount > 0 || stagnantDealsCount > 0) && (
            <span className="badge-count">{stagnantDealsCount}</span>
          )}
          <span className="sr-only">Alertas de pipeline</span>
        </button>
      </div>

      {pendingDecisions.length > 0 && (
        <section className="banner banner--hitl" aria-labelledby="hitl-title">
          <span className="banner--hitl__mark" aria-hidden="true">IA</span>
          <div>
            <h3 className="banner__title" id="hitl-title">
              {pendingDecisions.length} decis{pendingDecisions.length === 1 ? 'ão' : 'ões'} precisa{pendingDecisions.length === 1 ? '' : 'm'} da sua aprovação
            </h3>
            <p className="banner__text">
              o agente parou e deixou pra você decidir · mais antiga: {oldestPendingMinutes} min
            </p>
          </div>
          <span className="spacer" />
          <a className="btn btn--on-lime" href="/decisions">revisar agora</a>
        </section>
      )}

      {hasError && (
        <p className="banner banner--error">
          <span className="dot" />
          <span className="banner__text">
            <strong className="banner__title">não conseguimos carregar alguns números do dashboard.</strong>{' '}
            tente de novo em alguns instantes.
          </span>
          <span className="spacer" />
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => { refetchDeals(); refetchContacts(); }}
          >
            tentar de novo
          </button>
        </p>
      )}

      <section className="kpi-grid" aria-label="Indicadores">
        <article className="card-kpi">
          <h3 className="card-kpi__label">pipeline aberto</h3>
          {isLoading ? <p className="skeleton skeleton--text" /> : (
            <>
              <p className="card-kpi__value num">{formatBRL(pipelineValue)}</p>
              <p className={`card-kpi__delta${pipelineChangeInfo.isPositive ? ' card-kpi__delta--up' : ''}`}>
                {pipelineChangeInfo.text} {COMPARISON_LABELS[period]}
              </p>
            </>
          )}
        </article>
        <article className="card-kpi">
          <h3 className="card-kpi__label">ganho no período</h3>
          {isLoading ? <p className="skeleton skeleton--text" /> : (
            <>
              <p className="card-kpi__value num">{formatBRL(wonRevenue)}</p>
              <p className="card-kpi__delta">{wonDeals.length} negócio{wonDeals.length === 1 ? '' : 's'} ganho{wonDeals.length === 1 ? '' : 's'}</p>
            </>
          )}
        </article>
        <article className="card-kpi">
          <h3 className="card-kpi__label">taxa de conversão</h3>
          {isLoading ? <p className="skeleton skeleton--text" /> : (
            <>
              <p className="card-kpi__value num">{winRate.toFixed(1)}%</p>
              <p className={`card-kpi__delta${winRateChangeInfo.isPositive ? ' card-kpi__delta--up' : ''}`}>
                {winRateChangeInfo.text} {COMPARISON_LABELS[period]}
              </p>
            </>
          )}
        </article>
        <article className="card-kpi">
          <h3 className="card-kpi__label">negócios ativos</h3>
          {isLoading ? <p className="skeleton skeleton--text" /> : (
            <>
              <p className="card-kpi__value num">{activeSnapshotDeals.length}</p>
              <p className="card-kpi__delta">no pipeline agora</p>
            </>
          )}
        </article>
      </section>

      <div style={dsGridStyle}>
        <section className="panel">
          <div className="panel__head">
            <h3 className="panel__title title-sm">funil de negociação</h3>
            <span className="spacer" />
            <p className="meta">{activeSnapshotDeals.length} deals abertos · {formatBRL(pipelineValue)}</p>
          </div>
          {isLoading ? (
            <div className="skeleton-stack">
              <span className="skeleton skeleton--row" />
              <span className="skeleton skeleton--row" />
              <span className="skeleton skeleton--row" />
              <span className="skeleton skeleton--row" />
            </div>
          ) : funnelData.length === 0 ? (
            <div className="state-empty">
              <p className="state-empty__text">configure os estágios do board pra ver o funil aqui.</p>
            </div>
          ) : (
            <div className="funnel">
              {funnelData.map((stage) => (
                <div className="funnel__row" key={stage.name}>
                  <p className="funnel__label">{stage.name}</p>
                  <div className="bar">
                    <div
                      className="bar__fill"
                      style={{ width: `${(stage.count / maxFunnelCount) * 100}%`, background: stage.fill }}
                    />
                  </div>
                  <p className="funnel__count num">{stage.count}</p>
                  <p className="funnel__value num">{formatBRL(stage.value)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__head">
            <h3 className="panel__title title-sm">acontecendo agora</h3>
            <span className="spacer" />
            <p className="status"><span className="dot dot--success" />tempo real</p>
          </div>
          <RecentFeed activities={activities} decisions={pendingDecisions} />
          <button
            type="button"
            onClick={() => router.push('/activities')}
            className="btn btn--ghost"
            style={{ marginTop: 'var(--space-3)', width: '100%', justifyContent: 'center' }}
          >
            ver todas as atividades
          </button>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title title-sm">saúde da carteira</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
          <button
            type="button"
            className="card-kpi"
            style={{ cursor: 'pointer', textAlign: 'left' }}
            onClick={() => router.push('/contacts')}
          >
            <h3 className="card-kpi__label">distribuição da carteira</h3>
            <p className="card-kpi__value num">{activePercent}%</p>
            <div className="bar bar--slim" style={{ width: '100%', display: 'flex', overflow: 'hidden' }}>
              <div style={{ width: `${activePercent}%`, background: 'var(--success)' }} />
              <div style={{ width: `${inactivePercent}%`, background: '#eab308' }} />
              <div style={{ width: `${churnedPercent}%`, background: 'var(--danger)' }} />
            </div>
            <p className="card-kpi__delta">
              ativos ({activeContacts.length}) · inativos ({inactiveContacts.length}) · churn ({churnedContacts.length})
            </p>
          </button>

          <button
            type="button"
            className="card-kpi"
            style={{ cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setShowPipelineAlerts(true)}
          >
            <h3 className="card-kpi__label">negócios parados</h3>
            <p className="card-kpi__value num">{stagnantDealsCount}</p>
            <p className={`card-kpi__delta${stagnantDealsCount === 0 ? ' card-kpi__delta--up' : ''}`}>
              {stagnantDealsCount > 0 ? `${formatBRL(stagnantDealsValue)} em risco · sem mudança de estágio há +10 dias` : 'nenhum deal parado'}
            </p>
          </button>

          <div className="card-kpi">
            <h3 className="card-kpi__label">LTV médio</h3>
            <p className="card-kpi__value num">{formatBRL(avgLTV)}</p>
            <p className="card-kpi__delta">valor médio vitalício por cliente ativo</p>
          </div>
        </div>
      </section>

      <MessagingMetricsSection period={period} />
      <AIMetricsSection />

      <PipelineAlertsModal
        isOpen={showPipelineAlerts}
        onClose={() => setShowPipelineAlerts(false)}
        deals={activeSnapshotDeals}
        activities={activities.map(a => ({ dealId: a.dealId, date: a.date, completed: a.completed }))}
        onNavigateToDeal={(dealId) => {
          setShowPipelineAlerts(false);
          router.push(`/pipeline?deal=${dealId}`);
        }}
      />
    </div>
  );
};

export default DashboardPage;
