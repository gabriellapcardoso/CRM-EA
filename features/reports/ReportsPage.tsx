'use client'

/**
 * @fileoverview Relatórios — redesenhado a partir de `relatorios(+carregando).html`
 * (ver REDESIGN-CRM.md). Vocabulário visual: `.kpi-grid`/`.card-kpi`, `.panel`,
 * `.chart`/`.chart__bar` (ganho x perdido), `.funnel`/`.bar--slim`, `.impact`
 * (`.panel--inverse`), `.skeleton*`.
 *
 * @module features/reports/ReportsPage
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Download, Settings, Trophy } from 'lucide-react';
import { useDashboardMetrics, PeriodFilter, COMPARISON_LABELS } from '../dashboard/hooks/useDashboardMetrics';
import { PeriodFilterSelect } from '@/components/filters/PeriodFilterSelect';
import { generateReportPDF } from './utils/generateReportPDF';
import { useBoards } from '@/lib/query/hooks';
import { useAIMetricsQuery } from '@/lib/query/hooks/useAIMetricsQuery';
import { useMessagingMetricsQuery } from '@/lib/query/hooks/useMessagingMetricsQuery';
import { useAuth } from '@/context/AuthContext';
import { formatBRL, formatCompactBRL } from '@/lib/utils/formatCurrency';

/** Mesma ressalva do Dashboard: `.ds-grid` só existe em `design-system.css`
 *  (não trazido pro app, ver REDESIGN-CRM.md decisão 1) — replicado inline. */
const dsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--space-3)',
  alignItems: 'start',
};

const CURRENT_MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date()).toLowerCase();

function formatSeconds(seconds: number): string {
  if (!seconds) return '--';
  if (seconds < 60) return '< 1min';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return min > 0 ? `${hours}h ${min}min` : `${hours}h`;
}

/**
 * Componente React `ReportsPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
const ReportsPage: React.FC = () => {
  const router = useRouter();
  const { data: boards = [] } = useBoards();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<PeriodFilter>('this_month');
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  // Performance: avoid recomputing the "default board id" logic inside the effect.
  const defaultBoardId = useMemo(() => {
    if (!boards.length) return '';
    const defaultB = boards.find(b => b.isDefault) || boards[0];
    return defaultB?.id || '';
  }, [boards]);

  useEffect(() => {
    if (!selectedBoardId && defaultBoardId) {
      setSelectedBoardId(defaultBoardId);
    }
  }, [defaultBoardId, selectedBoardId]);

  const selectedBoard = useMemo(() => {
    return boards.find(b => b.id === selectedBoardId);
  }, [boards, selectedBoardId]);

  const {
    isLoading,
    trendData,
    avgSalesCycle,
    fastestDeal,
    slowestDeal,
    actualWinRate,
    winRate,
    wonDeals,
    lostDeals,
    wonRevenue,
    pipelineValue,
    changes,
    funnelData,
    activeSnapshotDeals,
  } = useDashboardMetrics(period, selectedBoardId);

  const { data: aiMetrics } = useAIMetricsQuery();
  const { data: messagingMetrics } = useMessagingMetricsQuery(period);

  // Extrair meta do board selecionado
  const boardGoal = selectedBoard?.goal;
  const goalType = boardGoal?.type || 'currency';
  const goalTarget = parseFloat(boardGoal?.targetValue || '0') || 0;
  const goalKpi = boardGoal?.kpi || 'Receita';
  const hasGoal = goalTarget > 0;

  const currentValue = useMemo(() => {
    switch (goalType) {
      case 'currency':
        return wonRevenue;
      case 'percentage':
        return actualWinRate;
      case 'number':
      default:
        return wonDeals.length;
    }
  }, [goalType, wonRevenue, actualWinRate, wonDeals.length]);

  const forecastPercent = hasGoal ? Math.min((currentValue / goalTarget) * 100, 100) : 0;
  const forecastGap = goalTarget - currentValue;
  const isOnTrack = forecastPercent >= 75;

  const formatGoalValue = useCallback((value: number) => {
    switch (goalType) {
      case 'currency':
        return formatCompactBRL(value);
      case 'number':
        return value.toFixed(0);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      default:
        return value.toLocaleString('pt-BR');
    }
  }, [goalType]);

  const leaderboard = useMemo(() => {
    const repsMap: Record<string, { name: string; avatar: string; deals: number; revenue: number }> = {};

    wonDeals.forEach(deal => {
      const ownerKey = deal.owner?.name || 'unknown';
      const ownerName = deal.owner?.name || 'Sem Dono';
      const ownerAvatar = deal.owner?.avatar || '';

      if (!repsMap[ownerKey]) {
        repsMap[ownerKey] = { name: ownerName, avatar: ownerAvatar, deals: 0, revenue: 0 };
      }
      repsMap[ownerKey].deals += 1;
      repsMap[ownerKey].revenue += deal.value;
    });

    return Object.entries(repsMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [wonDeals]);

  const generatedBy = useMemo(() => {
    if (profile?.first_name && profile?.last_name) return `${profile.first_name} ${profile.last_name}`;
    return profile?.first_name || profile?.email || 'Usuário';
  }, [profile?.email, profile?.first_name, profile?.last_name]);

  const handleExportPDF = useCallback(async () => {
    await generateReportPDF(
      {
        pipelineValue,
        actualWinRate,
        avgSalesCycle,
        fastestDeal,
        wonRevenue,
        wonDeals,
        changes,
        funnelData,
      },
      period,
      selectedBoard?.name,
      generatedBy
    );
  }, [
    actualWinRate,
    avgSalesCycle,
    changes,
    fastestDeal,
    funnelData,
    generatedBy,
    period,
    pipelineValue,
    selectedBoard?.name,
    wonDeals,
    wonRevenue,
  ]);

  // "1ª resposta média" e cobertura da IA — mesma fonte de dados do Dashboard
  // (useMessagingMetricsQuery). Não existe hoje uma métrica real de "% de
  // primeiras respostas feitas pela IA" especificamente — usamos a proporção
  // de mensagens enviadas pela IA como proxy de cobertura (ver REDESIGN-CRM.md).
  const aiMessageShare = useMemo(() => {
    if (!messagingMetrics || messagingMetrics.messagesSent.total === 0) return 0;
    const aiCount = (messagingMetrics.messagesSent.byType.ai ?? 0) + (messagingMetrics.messagesSent.byType.agent ?? 0);
    return (aiCount / messagingMetrics.messagesSent.total) * 100;
  }, [messagingMetrics]);

  // Chart "ganho x perdido por mês" — escala em px dentro do container fixo (.chart, 200px).
  const maxTrendValue = Math.max(1, ...trendData.flatMap(m => [m.revenue, m.lostRevenue]));
  const maxBarPx = 170;
  const maxFunnelCount = Math.max(1, ...funnelData.map(s => s.count));

  const monthStats = aiMetrics?.conversations.thisMonth;
  const hitl = aiMetrics?.hitl;
  const totalHitlDecided = hitl ? hitl.pending + hitl.approved + hitl.rejected + hitl.expired : 0;

  return (
    <div className="screen__inner screen__inner--wide">
      <div className="panel__head">
        <h2 className="title-lg">relatórios</h2>
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
        <button type="button" onClick={handleExportPDF} className="btn btn--ghost" title="Exportar PDF">
          <Download size={16} aria-hidden="true" />
          exportar PDF
        </button>
      </div>

      {/* Meta do board — feature real sem equivalente no mock, mantida com o vocabulário novo */}
      {hasGoal ? (
        <section className="panel">
          <div className="panel__head">
            <h3 className="panel__title title-sm">{goalKpi}</h3>
            <span className="spacer" />
            <p className="meta">
              realizado {formatGoalValue(currentValue)} · meta {formatGoalValue(goalTarget)} ·{' '}
              {forecastGap > 0 ? `faltam ${formatGoalValue(Math.abs(forecastGap))}` : 'meta atingida'}
            </p>
          </div>
          <div className="bar" style={{ height: 14 }}>
            <div
              className="bar__fill"
              style={{ width: `${forecastPercent}%`, background: isOnTrack ? 'var(--success)' : 'var(--danger)' }}
            />
          </div>
        </section>
      ) : (
        <p className="banner banner--info">
          <Settings size={16} aria-hidden="true" />
          <span className="banner__text">
            <strong className="banner__title">meta não configurada.</strong> defina uma meta no board pra acompanhar o forecast aqui.
          </span>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={() => router.push('/boards')}>configurar</button>
        </p>
      )}

      {isLoading ? (
        <div className="kpi-grid">
          <span className="skeleton skeleton--kpi" />
          <span className="skeleton skeleton--kpi" />
          <span className="skeleton skeleton--kpi" />
          <span className="skeleton skeleton--kpi" />
        </div>
      ) : (
        <section className="kpi-grid" aria-label="Indicadores">
          <article className="card-kpi">
            <h3 className="card-kpi__label">pipeline aberto</h3>
            <p className="card-kpi__value num">{formatBRL(pipelineValue)}</p>
            <p className={`card-kpi__delta${changes.pipeline >= 0 ? ' card-kpi__delta--up' : ''}`}>
              {changes.pipeline >= 0 ? '+' : ''}{changes.pipeline.toFixed(1)}% {COMPARISON_LABELS[period]}
            </p>
          </article>
          <article className="card-kpi">
            <h3 className="card-kpi__label">ganho no período</h3>
            <p className="card-kpi__value num">{formatBRL(wonRevenue)}</p>
            <p className="card-kpi__delta">{wonDeals.length} negócio{wonDeals.length === 1 ? '' : 's'} ganho{wonDeals.length === 1 ? '' : 's'}</p>
          </article>
          <article className="card-kpi">
            <h3 className="card-kpi__label">taxa de conversão</h3>
            <p className="card-kpi__value num">{winRate.toFixed(1)}%</p>
            <p className={`card-kpi__delta${changes.winRate >= 0 ? ' card-kpi__delta--up' : ''}`}>
              {changes.winRate >= 0 ? '+' : ''}{changes.winRate.toFixed(1)}% {COMPARISON_LABELS[period]}
            </p>
          </article>
          <article className="card-kpi">
            <h3 className="card-kpi__label">1ª resposta média</h3>
            <p className="card-kpi__value num">{formatSeconds(messagingMetrics?.sla.avgFirstResponseSeconds ?? 0)}</p>
            <p className="card-kpi__delta">agente cobre {aiMessageShare.toFixed(0)}% das mensagens</p>
          </article>
        </section>
      )}

      <div style={dsGridStyle}>
        <section className="panel">
          <div className="panel__head">
            <h3 className="panel__title title-sm">ganho x perdido por mês</h3>
            <p className="legend">
              <span className="legend__item"><span className="legend__swatch legend__swatch--won" />ganho</span>
              <span className="legend__item"><span className="legend__swatch legend__swatch--lost" />perdido</span>
            </p>
          </div>
          {isLoading ? (
            <span className="skeleton skeleton--block" />
          ) : (
            <>
              <div className="chart">
                {trendData.map((m) => (
                  <div className="chart__col" key={m.month}>
                    <p className="chart__value">{formatCompactBRL(m.revenue)}</p>
                    <div className="chart__bars">
                      <span
                        className="chart__bar chart__bar--won"
                        style={{ height: Math.max(4, (m.revenue / maxTrendValue) * maxBarPx) }}
                        title={`ganho ${formatCompactBRL(m.revenue)}`}
                      />
                      <span
                        className="chart__bar chart__bar--lost"
                        style={{ height: Math.max(4, (m.lostRevenue / maxTrendValue) * maxBarPx) }}
                        title={`perdido ${formatCompactBRL(m.lostRevenue)}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="chart__axis">
                {trendData.map((m) => (
                  <p className="chart__axis-label" key={m.month}>{m.month}</p>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="panel__body">
          <section className="panel panel--inverse">
            <h3 className="label">impacto do agente</h3>
            <div className="impact">
              <p className="impact__value">{monthStats?.total ?? 0} ações<span className="dot-lime">.</span></p>
              <p className="impact__text">
                em {CURRENT_MONTH_LABEL} · {hitl ? hitl.approvalRate.toFixed(0) : 0}% aprovadas sem edição ·{' '}
                {monthStats?.advancedStage ?? 0} avanços de estágio automáticos
              </p>
              <div className="impact__stats">
                <div>
                  <p className="impact__stat-value num">{aiMessageShare.toFixed(0)}%</p>
                  <p className="impact__stat-label">mensagens pela IA</p>
                </div>
                <div>
                  <p className="impact__stat-value num">{formatSeconds(messagingMetrics?.sla.avgFirstResponseSeconds ?? 0)}</p>
                  <p className="impact__stat-label">tempo médio</p>
                </div>
                <div>
                  <p className="impact__stat-value num">{totalHitlDecided}</p>
                  <p className="impact__stat-label">pendências no total</p>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3 className="panel__title title-sm">de onde vieram os deals</h3>
            {funnelData.length === 0 ? (
              <div className="state-empty">
                <p className="state-empty__text">sem estágios configurados neste board.</p>
              </div>
            ) : (
              <div className="funnel">
                {funnelData.map((stage) => (
                  <div className="funnel__row" key={stage.name}>
                    <p className="funnel__label">{stage.name}</p>
                    <div className="bar bar--slim">
                      <div
                        className="bar__fill"
                        style={{ width: `${(stage.count / maxFunnelCount) * 100}%`, background: stage.fill }}
                      />
                    </div>
                    <p className="funnel__count num">{stage.count}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Ciclo de vendas + fechamentos — features reais sem card específico no mock, preservadas */}
      <section className="kpi-grid" aria-label="Ciclo de vendas">
        <article className="card-kpi">
          <h3 className="card-kpi__label">ciclo médio</h3>
          <p className="card-kpi__value num">{avgSalesCycle} dias</p>
          <p className="card-kpi__delta">rápido: {fastestDeal}d · lento: {slowestDeal}d</p>
        </article>
        <article className="card-kpi">
          <h3 className="card-kpi__label">deals fechados</h3>
          <p className="card-kpi__value num">{wonDeals.length} / {lostDeals.length}</p>
          <p className="card-kpi__delta">ganhos / perdidos</p>
        </article>
        <article className="card-kpi">
          <h3 className="card-kpi__label">negócios ativos</h3>
          <p className="card-kpi__value num">{activeSnapshotDeals.length}</p>
          <p className="card-kpi__delta">no pipeline agora</p>
        </article>
        <article className="card-kpi">
          <h3 className="card-kpi__label">taxa de fechamento real</h3>
          <p className="card-kpi__value num">{actualWinRate.toFixed(1)}%</p>
          <p className="card-kpi__delta">ganhos / (ganhos + perdidos)</p>
        </article>
      </section>

      {/* Top vendedores — feature real sem equivalente no mock, preservada */}
      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title title-sm">
            <Trophy size={16} aria-hidden="true" style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
            top vendedores
          </h3>
        </div>
        {leaderboard.length === 0 ? (
          <div className="state-empty">
            <p className="state-empty__text">nenhum deal fechado no período.</p>
          </div>
        ) : (
          <ul className="feed">
            {leaderboard.map((rep, index) => (
              <li className="feed__item" key={rep.id}>
                <span className="actor actor--humano actor--sm" aria-hidden="true">{index + 1}</span>
                <Image
                  src={rep.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${rep.name}`}
                  alt={rep.name}
                  width={28}
                  height={28}
                  style={{ borderRadius: '50%' }}
                  unoptimized
                />
                <div className="feed__body">
                  <p className="feed__text">{rep.name}</p>
                  <p className="feed__meta">{rep.deals} deals</p>
                </div>
                <p className="funnel__value num">{formatBRL(rep.revenue)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ReportsPage;
