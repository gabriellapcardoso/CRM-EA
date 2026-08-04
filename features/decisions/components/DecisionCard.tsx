/**
 * Decision Card Component
 * Card individual para uma decisão na fila — visual `.card-approval` (handoff ia.html)
 */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Decision, SuggestedAction, PRIORITY_LABELS, CATEGORY_LABELS } from '../types';

export interface DecisionCardProps {
  decision: Decision;
  onApprove: (id: string, action?: SuggestedAction) => void;
  onReject: (id: string) => void;
  onSnooze: (id: string, hours?: number) => void;
  isExecuting?: boolean;
}

// Performance: reuse formatter instance across renders.
const PT_BR_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "há 12 min" / "há 1 h" / data curta — sempre a partir de um timestamp real. */
function relativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMinutes = Math.floor((Date.now() - ts) / (1000 * 60));
  if (diffMinutes < 1) return 'agora mesmo';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffMinutes < 1440) return `há ${Math.floor(diffMinutes / 60)} h`;
  return PT_BR_TIME_FORMATTER.format(new Date(ts));
}

/** "em 3 dias" / "em 2 h" — para timestamps futuros (ex.: expiração). */
function timeUntil(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMinutes = Math.floor((ts - Date.now()) / (1000 * 60));
  if (diffMinutes <= 0) return 'já expirou';
  if (diffMinutes < 60) return `em ${diffMinutes} min`;
  if (diffMinutes < 1440) return `em ${Math.floor(diffMinutes / 60)} h`;
  return `em ${Math.floor(diffMinutes / 1440)} dias`;
}

/**
 * O modelo real de decisão não tem canal fixo (só `send_message` carrega
 * `payload.channel`). Quando existe, reaproveita `.badge-channel` do handoff;
 * quando a ação é outra coisa (agendar, mover deal, concluir), mostra o rótulo
 * textual do tipo de ação em vez de inventar um canal que não existe.
 */
function getChannelInfo(action: SuggestedAction): { badgeClass?: string; letter?: string; label: string } {
  if (action.type === 'send_message') {
    const channel = action.payload.channel;
    if (channel === 'whatsapp') return { badgeClass: 'badge-channel--whatsapp', letter: 'W', label: 'WhatsApp' };
    if (channel === 'email') return { badgeClass: 'badge-channel--email', letter: 'E', label: 'E-mail' };
    return { label: 'SMS' };
  }
  const activityType = action.payload.activityType;
  if (action.type === 'move_deal') return { label: 'mudança de estágio' };
  if (action.type === 'dismiss') return { label: 'atividade' };
  if (activityType === 'CALL') return { label: 'ligação' };
  if (activityType === 'MEETING') return { label: 'reunião' };
  if (activityType === 'EMAIL') return { badgeClass: 'badge-channel--email', letter: 'E', label: 'e-mail' };
  return { label: 'tarefa' };
}

/** Preview textual da ação sugerida — sempre derivado de dado real, nunca de mensagem inventada. */
function getPreviewText(action: SuggestedAction): string | null {
  if (action.type === 'send_message' && action.payload.messageTemplate) {
    return action.payload.messageTemplate;
  }
  if (action.preview?.title && action.preview?.scheduledFor) {
    const when = PT_BR_TIME_FORMATTER.format(new Date(action.preview.scheduledFor));
    return `${action.label} — ${action.preview.title} (${when})`;
  }
  if (action.payload.activityTitle) {
    return `${action.label} — ${action.payload.activityTitle}`;
  }
  return null;
}

/**
 * Componente React `DecisionCard` — um `.card-approval` da fila HITL.
 */
export const DecisionCard: React.FC<DecisionCardProps> = ({
  decision,
  onApprove,
  onReject,
  onSnooze,
  isExecuting = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAction, setSelectedAction] = useState<SuggestedAction>(decision.suggestedAction);

  const channelInfo = getChannelInfo(selectedAction);
  const previewText = getPreviewText(selectedAction);
  const hasAlternatives = Boolean(decision.alternativeActions && decision.alternativeActions.length > 0);

  return (
    <li className="card-approval">
      <div className="card-approval__main">
        <div className="card-approval__head">
          <span className="tag-pending"><span className="dot dot--pulse" />aguardando sua aprovação</span>
          <span className="meta">{relativeTime(decision.createdAt)}</span>
          {channelInfo.badgeClass && (
            <span className={`badge-channel ${channelInfo.badgeClass}`} aria-hidden="true">{channelInfo.letter}</span>
          )}
          <span className="meta">{channelInfo.label}</span>
        </div>

        <div>
          <h3 className="card-approval__what">{decision.title}</h3>
          <p className="card-approval__who">{decision.description}</p>
        </div>

        {previewText && <blockquote className="card-approval__preview">{previewText}</blockquote>}

        <dl className="card-approval__why">
          <dt>por que sugerimos:</dt>
          <dd>{decision.reasoning}</dd>
        </dl>

        {isEditing && hasAlternatives && (
          <div className="chip-row" role="group" aria-label="Ações alternativas">
            <span className="meta mr-1">usar em vez disso:</span>
            {[decision.suggestedAction, ...(decision.alternativeActions ?? [])].map((action) => (
              <button
                key={action.id}
                type="button"
                className={selectedAction.id === action.id ? 'chip chip--active' : 'chip'}
                onClick={() => setSelectedAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <p className="card-approval__actions">
          <button
            className="btn btn--primary"
            type="button"
            disabled={isExecuting}
            onClick={() => onApprove(decision.id, selectedAction)}
          >
            {isExecuting && <Loader2 size={14} className="animate-spin" />}
            aprovar e executar
          </button>
          {hasAlternatives && (
            <button className="btn btn--ghost" type="button" disabled={isExecuting} onClick={() => setIsEditing((v) => !v)}>
              editar antes
            </button>
          )}
          <button className="btn btn--ghost" type="button" disabled={isExecuting} onClick={() => onReject(decision.id)}>
            recusar
          </button>
          <button className="btn btn--quiet" type="button" disabled={isExecuting} onClick={() => onSnooze(decision.id, 2)}>
            adiar 2 h
          </button>
        </p>
      </div>

      <div className="card-approval__side">
        <h4 className="label">prioridade da IA</h4>
        <p className="confidence">
          <span className="confidence__value">{PRIORITY_LABELS[decision.priority]}</span>{' '}
          <span className="confidence__of">· {CATEGORY_LABELS[decision.category]}</span>
        </p>
        <p className="confidence__note">
          está na <strong>faixa de decisão humana</strong> — o agente não executa nada sem o seu toque.
        </p>
        <p className="meta">
          {decision.expiresAt ? `expira ${timeUntil(decision.expiresAt)}` : 'sem prazo de expiração'}
        </p>
      </div>
    </li>
  );
};

export default DecisionCard;
