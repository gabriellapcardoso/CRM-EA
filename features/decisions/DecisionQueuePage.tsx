'use client'

/**
 * Decision Queue Page
 * Central de Decisões — visual `.card-approval`/`.auto-log` (handoff ia.html)
 */

import React, { useMemo } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { DecisionCard } from './components/DecisionCard';
import { useDecisionQueue } from './hooks/useDecisionQueue';
import decisionQueueService from './services/decisionQueueService';
import { Decision, DecisionStatus } from './types';

// Performance: reuse formatter instances.
const PT_BR_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const PT_BR_HOUR_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function relativeLabel(iso?: string): string {
  if (!iso) return 'nunca analisado';
  const ts = Date.parse(iso);
  const diffMinutes = Math.floor((Date.now() - ts) / (1000 * 60));
  if (diffMinutes < 1) return 'agora mesmo';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffMinutes < 1440) return `há ${Math.floor(diffMinutes / 60)} h`;
  return PT_BR_DATE_TIME_FORMATTER.format(new Date(ts));
}

/** "09:41" pra hoje, "ontem 16:40" pra ontem, senão data curta — só com timestamp real. */
function historyTimeLabel(iso?: string): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return PT_BR_HOUR_FORMATTER.format(date);
  if (isYesterday) return `ontem ${PT_BR_HOUR_FORMATTER.format(date)}`;
  return PT_BR_DATE_TIME_FORMATTER.format(date);
}

const HISTORY_STATUS_LABEL: Partial<Record<DecisionStatus, string>> = {
  approved: 'aprovada',
  rejected: 'recusada',
};

const HISTORY_BADGE_CLASS: Partial<Record<DecisionStatus, string>> = {
  approved: 'badge-confidence--executada',
  rejected: 'badge-confidence--arquivada',
};

function isSameMonth(iso: string | undefined, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

/**
 * Componente React `DecisionQueuePage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const DecisionQueuePage: React.FC = () => {
  const {
    decisions,
    stats,
    lastAnalyzedAt,
    isAnalyzing,
    executingIds,
    runAnalyzers,
    approveDecision,
    rejectDecision,
    snoozeDecision,
  } = useDecisionQueue();

  const lastAnalyzedLabel = useMemo(() => relativeLabel(lastAnalyzedAt), [lastAnalyzedAt]);

  // Baixo risco = medium + low priority — só esse subconjunto entra no "aprovar em lote".
  const lowRiskIds = useMemo(
    () => decisions.filter((d) => d.priority === 'medium' || d.priority === 'low').map((d) => d.id),
    [decisions]
  );

  const handleApproveLowRisk = () => {
    for (const id of lowRiskIds) approveDecision(id);
  };

  // Histórico real (decidido de fato) — não é "executado automaticamente" nesta feature:
  // todo item passa por aprovação humana. A seção reflete decisões já aprovadas/recusadas.
  const history = useMemo<Decision[]>(() => {
    return decisionQueueService
      .getQueue()
      .filter((d) => d.status === 'approved' || d.status === 'rejected')
      .sort((a, b) => Date.parse(b.decidedAt ?? b.createdAt) - Date.parse(a.decidedAt ?? a.createdAt))
      .slice(0, 8);
    // Recalcula sempre que a fila pendente muda (aprovar/recusar altera o estado global do serviço).
  }, [decisions]);

  const approvedThisMonth = useMemo(() => {
    const now = new Date();
    return decisionQueueService
      .getQueue()
      .filter((d) => d.status === 'approved' && isSameMonth(d.decidedAt, now)).length;
  }, [decisions]);

  return (
    <div className="screen__inner screen__inner--wide">
      <div className="panel__head">
        <div>
          <h2 className="title-xl">decisões da IA</h2>
          <p className="muted">
            o agente analisa deals parados e atividades atrasadas e te chama quando a decisão exige
            julgamento humano — é o que aparece abaixo. Nada é executado sem sua aprovação.
          </p>
        </div>
        <span className="spacer" />
        <button className="btn btn--ghost" type="button" onClick={runAnalyzers} disabled={isAnalyzing}>
          {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          analisar agora
        </button>
      </div>

      <section className="panel ai-summary" aria-label="Como o agente decide">
        <div className="ai-summary__bands">
          <h3 className="label">como o agente decide</h3>
          <div className="confidence-bands">
            <span className="confidence-bands__band--low" style={{ width: '50%' }} />
            <span className="confidence-bands__band--hitl" style={{ width: '30%' }} />
            <span className="confidence-bands__band--auto" style={{ width: '20%' }} />
          </div>
          <p className="confidence-legend">
            <span className="confidence-legend__item">
              <span className="confidence-legend__swatch stage-swatch--frio" />baixo risco: pode ir em lote
            </span>
            <span className="confidence-legend__item confidence-legend__item--hitl">
              <span className="confidence-legend__swatch confidence-legend__swatch--hitl" />prioridade média/alta: você decide
            </span>
            <span className="confidence-legend__item">
              <span className="confidence-legend__swatch confidence-legend__swatch--auto" />crítico: pede atenção hoje
            </span>
          </p>
        </div>
        <div className="ai-summary__stat">
          <p className="ai-summary__value num">{stats.total}</p>
          <p className="ai-summary__label">na sua fila</p>
        </div>
        <div className="ai-summary__stat">
          <p className="ai-summary__value num">{approvedThisMonth}</p>
          <p className="ai-summary__label">aprovadas este mês</p>
        </div>
        <div className="ai-summary__stat">
          <p className="ai-summary__value">{lastAnalyzedLabel}</p>
          <p className="ai-summary__label">última análise</p>
        </div>
      </section>

      <section id="fila-aguardando">
        <div className="section-head">
          <span className="section-head__swatch section-head__swatch--hitl" aria-hidden="true" />
          <h2 className="section-head__title">aguardando você</h2>
          <span className="badge-count">{stats.total}</span>
          <span className="spacer" />
          {lowRiskIds.length > 0 && (
            <p className="chip-row">
              <button className="btn btn--primary" type="button" onClick={handleApproveLowRisk}>
                aprovar as {lowRiskIds.length} de baixo risco
              </button>
              <a className="btn btn--ghost" href="#fila-aguardando">
                revisar uma a uma
              </a>
            </p>
          )}
        </div>

        {decisions.length === 0 ? (
          <div className="state-empty state-empty--boxed">
            <h3 className="state-empty__title">
              nada esperando você<span className="dot-accent">.</span>
            </h3>
            <p className="state-empty__text">
              o agente está rodando e vai te chamar só quando a decisão exigir seu julgamento. o
              histórico de decisões já tomadas está no painel abaixo.
            </p>
            <div className="state-empty__actions">
              <button className="btn btn--primary" type="button" onClick={runAnalyzers} disabled={isAnalyzing}>
                {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                analisar meu CRM agora
              </button>
            </div>
          </div>
        ) : (
          <ul className="approval-list">
            {decisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onApprove={approveDecision}
                onReject={rejectDecision}
                onSnooze={snoozeDecision}
                isExecuting={executingIds.has(decision.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="section-head">
          <span className="section-head__swatch section-head__swatch--auto" aria-hidden="true" />
          <h2 className="section-head__title">decidido recentemente</h2>
          <p className="meta">histórico real do que você já aprovou ou recusou — não precisa de nova ação</p>
        </div>
        {history.length === 0 ? (
          <div className="state-empty state-empty--boxed">
            <p className="state-empty__text">ainda sem histórico de decisões aprovadas ou recusadas.</p>
          </div>
        ) : (
          <ul className="auto-log panel panel--flush">
            {history.map((decision) => (
              <li className="auto-log__item" key={decision.id}>
                <span className={`badge-confidence ${HISTORY_BADGE_CLASS[decision.status] ?? 'badge-confidence--arquivada'}`}>
                  {HISTORY_STATUS_LABEL[decision.status] ?? decision.status}
                </span>
                <div className="auto-log__body">
                  <p className="auto-log__what">{decision.title}</p>
                  <p className="auto-log__note">{decision.description}</p>
                </div>
                <span className="meta nowrap">{historyTimeLabel(decision.decidedAt)}</span>
                {decision.dealId && <a href={`/deals/${decision.dealId}/cockpit-v2`}>ver</a>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default DecisionQueuePage;
