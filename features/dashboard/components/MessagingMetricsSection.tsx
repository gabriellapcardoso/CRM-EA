/**
 * @fileoverview Messaging Metrics Section
 *
 * Exibe métricas de messaging no Dashboard: mensagens enviadas,
 * novos contatos, First Response Time, e taxa de resposta.
 * Suporta filtro por vendedor via dropdown.
 *
 * @module features/dashboard/components/MessagingMetricsSection
 */

import React, { useState } from 'react';
import { Send, UserPlus, Clock, CheckCircle, Inbox } from 'lucide-react';
import { useMessagingMetricsQuery, useOrgMembersQuery } from '@/lib/query/hooks';
import type { PeriodFilter } from '../hooks/useDashboardMetrics';

// =============================================================================
// Helpers
// =============================================================================

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '--';
  if (seconds < 60) return '< 1min';
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return sec > 0 ? `${min}min ${sec}s` : `${min}min`;
  }
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return min > 0 ? `${hours}h ${min}min` : `${hours}h`;
}

// =============================================================================
// Metric Card
// =============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'primary' | 'green' | 'amber' | 'purple' | 'blue';
}) {
  return (
    <article className="card-kpi">
      <h3 className="card-kpi__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={14} aria-hidden="true" />
        {label}
      </h3>
      <p className="card-kpi__value num">{value}</p>
      {subtext && <p className="card-kpi__delta">{subtext}</p>}
    </article>
  );
}

// =============================================================================
// Distribution Bar
// =============================================================================

function SenderDistributionBar({
  byType,
  total,
}: {
  byType: Record<string, number>;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2">
        <div className="bg-slate-300 dark:bg-slate-600 h-full rounded-full w-full opacity-30" />
      </div>
    );
  }

  const userCount = (byType.user ?? 0);
  const aiCount = (byType.ai ?? 0) + (byType.agent ?? 0);
  const systemCount = byType.system ?? 0;
  const unknownCount = byType.unknown ?? 0;

  const userPct = (userCount / total) * 100;
  const aiPct = (aiCount / total) * 100;
  const systemPct = (systemCount / total) * 100;
  const unknownPct = (unknownCount / total) * 100;

  return (
    <div className="space-y-2">
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden flex">
        <div
          className="bg-green-500 h-full"
          style={{ width: `${userPct}%` }}
          title={`Humanos: ${userCount}`}
        />
        <div
          className="bg-purple-500 h-full"
          style={{ width: `${aiPct}%` }}
          title={`IA: ${aiCount}`}
        />
        <div
          className="bg-blue-500 h-full"
          style={{ width: `${systemPct}%` }}
          title={`Sistema: ${systemCount}`}
        />
        {unknownPct > 0 && (
          <div
            className="bg-slate-400 h-full"
            style={{ width: `${unknownPct}%` }}
            title={`Não atribuído: ${unknownCount}`}
          />
        )}
      </div>
      <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Humanos ({userCount})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          IA ({aiCount})
        </div>
        {systemCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Sistema ({systemCount})
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Section
// =============================================================================

export function MessagingMetricsSection({ period }: { period: PeriodFilter }) {
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const userId = selectedUserId === 'all' ? undefined : selectedUserId;

  const { data, isLoading, error } = useMessagingMetricsQuery(period, userId);
  const { data: members = [] } = useOrgMembersQuery();

  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title title-sm">performance de mensagens</h3>
        </div>
        <div className="skeleton-stack">
          <span className="skeleton skeleton--kpi" />
          <span className="skeleton skeleton--kpi" />
        </div>
      </section>
    );
  }

  if (!data || data.messagesSent.total === 0) {
    return (
      <section className="panel">
        <div className="panel__head">
          <h3 className="panel__title title-sm">performance de mensagens</h3>
        </div>
        <div className="state-empty">
          <Inbox size={24} aria-hidden="true" />
          <p className="state-empty__text">
            nenhuma mensagem registrada neste período — as métricas aparecem quando mensagens forem enviadas pelo sistema.
          </p>
        </div>
      </section>
    );
  }

  const { messagesSent, contacts, sla, responseRate } = data;
  const humanCount = messagesSent.byType.user ?? 0;
  const aiCount = (messagesSent.byType.ai ?? 0) + (messagesSent.byType.agent ?? 0);

  return (
    <section className="panel">
      <div className="panel__head">
        <h3 className="panel__title title-sm">performance de mensagens</h3>
        <span className="spacer" />
        {members.length > 1 && (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="input"
            style={{ width: 'auto' }}
            aria-label="Filtrar por vendedor"
          >
            <option value="all">Todos os vendedores</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="kpi-grid">
        <MetricCard
          icon={Send}
          label="mensagens enviadas"
          value={messagesSent.total}
          subtext={`${humanCount} humanos, ${aiCount} IA`}
        />

        <MetricCard
          icon={UserPlus}
          label="novos contatos"
          value={contacts.new}
          subtext={`${contacts.followUp} follow-ups`}
        />

        <MetricCard
          icon={Clock}
          label="1ª resposta"
          value={formatSeconds(sla.avgFirstResponseSeconds)}
          subtext={`${sla.conversationsWithFRT} conversas medidas`}
        />

        <MetricCard
          icon={CheckCircle}
          label="taxa de resposta"
          value={`${responseRate.rate}%`}
          subtext={`${responseRate.responded} de ${responseRate.total} conversas`}
        />
      </div>

      {/* Sender Distribution */}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <p className="meta" style={{ marginBottom: 'var(--space-2)' }}>distribuição por remetente</p>
        <SenderDistributionBar byType={messagesSent.byType} total={messagesSent.total} />
      </div>
    </section>
  );
}
