/**
 * @fileoverview Meeting Briefing Card Component
 *
 * Displays a complete AI-generated meeting briefing with:
 * - Executive summary
 * - BANT status grid
 * - Pending points
 * - Recommended approach
 * - Alerts
 *
 * @module features/deals/components/BriefingCard
 */

import React from 'react';
import {
  FileText,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BANTStatusGrid } from './BANTStatusGrid';
import type { BriefingResponse } from '@/lib/ai/briefing/schemas';

interface BriefingCardProps {
  briefing: BriefingResponse;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

/**
 * Redesign 2026-08: prioridade usa `.tag`/`.tag--pink` e `.status-chip--*`
 * (o handoff não tem escala própria de prioridade).
 */
function getPriorityBadge(priority: 'high' | 'medium' | 'low') {
  switch (priority) {
    case 'high':
      return 'status-chip status-chip--off';
    case 'medium':
      return 'status-chip status-chip--warn';
    case 'low':
      return 'status-chip status-chip--muted';
  }
}

/**
 * Alertas: reaproveitam `.banner--error`/`.banner--info` + o lime do HITL para
 * oportunidade, que é a única cor "positiva forte" do design system.
 */
function getAlertConfig(type: 'warning' | 'opportunity' | 'risk') {
  switch (type) {
    case 'warning':
      return {
        icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
        className: 'banner',
        style: {
          background: 'var(--warning-soft)',
          border: '1px solid #ecd79a',
          color: '#8a6200',
        } as React.CSSProperties,
      };
    case 'opportunity':
      return {
        icon: <Lightbulb className="w-4 h-4" aria-hidden="true" />,
        className: 'banner',
        style: {
          background: 'var(--lime-100)',
          border: '1px solid var(--lime-300)',
          color: 'var(--ink-800)',
        } as React.CSSProperties,
      };
    case 'risk':
      return {
        icon: <TrendingUp className="w-4 h-4 rotate-180" aria-hidden="true" />,
        className: 'banner banner--error',
        style: undefined as React.CSSProperties | undefined,
      };
  }
}

export function BriefingCard({
  briefing,
  onRefresh,
  isRefreshing,
  className,
}: BriefingCardProps) {
  const formattedDate = new Date(briefing.generatedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('panel__body', className)}>
      {/* Header */}
      <div className="col-head__top">
        <span className="actor actor--ia" aria-hidden="true">
          <FileText className="w-3.5 h-3.5" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="title-sm">briefing pré-conversa</h3>
          <p className="meta">
            gerado em {formattedDate} · {briefing.basedOnMessages} mensagens analisadas
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn btn--ghost"
            title="Atualizar briefing"
            aria-label="Atualizar briefing"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Confidence indicator */}
      <div className="confidence">
        <div className="confidence__track">
          <span
            className="confidence__marker"
            style={{ left: `${Math.min(100, Math.max(0, briefing.confidence * 100))}%` }}
          />
        </div>
        <p className="confidence__scale">
          <span>0%</span>
          <span className="confidence__of">
            {Math.round(briefing.confidence * 100)}% de confiança
          </span>
          <span>100%</span>
        </p>
      </div>

      {/* Executive Summary */}
      <section className="cockpit__block">
        <h4 className="label">resumo executivo</h4>
        <p className="card-approval__preview">{briefing.executiveSummary}</p>
      </section>

      {/* BANT Status */}
      <section className="cockpit__block">
        <h4 className="label">status BANT</h4>
        <BANTStatusGrid bantStatus={briefing.bantStatus} />
      </section>

      {/* Pending Points */}
      {briefing.pendingPoints.length > 0 && (
        <section className="cockpit__block">
          <h4 className="label">pontos pendentes</h4>
          <ul className="feed">
            {briefing.pendingPoints.map((point, idx) => (
              <li key={idx} className="feed__item">
                <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                <div className="feed__body">
                  <p className="chip-row">
                    <span className="feed__text" style={{ fontWeight: 600 }}>
                      {point.point}
                    </span>
                    <span className={getPriorityBadge(point.priority)}>
                      {point.priority === 'high'
                        ? 'alta'
                        : point.priority === 'medium'
                          ? 'média'
                          : 'baixa'}
                    </span>
                  </p>
                  <p className="feed__meta">{point.context}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recommended Approach */}
      <section className="note-purple">
        <h4 className="label" style={{ color: 'var(--purple-700)' }}>
          abordagem recomendada
        </h4>

        <div className="panel__body" style={{ marginTop: 'var(--space-2)' }}>
          <div>
            <p className="chip-row">
              <MessageSquare className="w-3 h-3" aria-hidden="true" />
              <span className="label">abertura</span>
            </p>
            <p>{briefing.recommendedApproach.opening}</p>
          </div>

          {briefing.recommendedApproach.keyQuestions.length > 0 && (
            <div>
              <p className="label">perguntas-chave</p>
              <ol className="checklist">
                {briefing.recommendedApproach.keyQuestions.map((q, idx) => (
                  <li key={idx} className="checklist__item">
                    <span className="num" style={{ fontWeight: 700 }}>
                      {idx + 1}.
                    </span>
                    {q}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {briefing.recommendedApproach.objectionsToAnticipate.length > 0 && (
            <div>
              <p className="label">objeções a antecipar</p>
              <ul className="checklist">
                {briefing.recommendedApproach.objectionsToAnticipate.map((obj, idx) => (
                  <li key={idx} className="checklist__item">
                    <AlertTriangle
                      className="w-3 h-3 shrink-0"
                      style={{ color: 'var(--warning)' }}
                      aria-hidden="true"
                    />
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--purple-100)', paddingTop: 'var(--space-2)' }}>
            <p className="chip-row">
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
              <span className="label">próximo passo</span>
            </p>
            <p>{briefing.recommendedApproach.suggestedNextStep}</p>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {briefing.alerts.length > 0 && (
        <div className="panel__body">
          {briefing.alerts.map((alert, idx) => {
            const config = getAlertConfig(alert.type);
            return (
              <p key={idx} className={config.className} style={config.style}>
                {config.icon}
                <span className="banner__text">{alert.message}</span>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
