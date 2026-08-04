import React, { useState } from 'react';
import { Activity } from '@/types';
import { CheckCircle2, Clock, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InboxItemProps {
  activity: Activity;
  onToggleComplete: (id: string) => void;
  onSnooze?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onSelect?: (id: string) => void;
}

/** Sigla do tipo de atividade, exibida no `.badge-channel` do card. */
const TYPE_BADGE: Record<string, { letter: string; color: string; label: string }> = {
  CALL: { letter: 'L', color: 'var(--purple-500)', label: 'Ligação' },
  MEETING: { letter: 'R', color: 'var(--purple-700)', label: 'Reunião' },
  EMAIL: { letter: 'E', color: 'var(--channel-email)', label: 'E-mail' },
  TASK: { letter: 'T', color: 'var(--ink-500)', label: 'Tarefa' },
};

/**
 * Performance: Inbox pode ter muitas linhas; `React.memo` evita re-render em massa
 * quando apenas 1 item muda (ex.: abrir/fechar menu local).
 */
const InboxItemComponent: React.FC<InboxItemProps> = ({
  activity,
  onToggleComplete,
  onSnooze,
  onDiscard,
  onSelect
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const isMeeting = activity.type === 'MEETING' || activity.type === 'CALL';
  const date = new Date(activity.date);
  const timeString = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const badge = TYPE_BADGE[activity.type] ?? TYPE_BADGE.TASK;

  return (
    <div className={cn('card-conv group', activity.completed && 'opacity-60')}>
      {/* Avatar: tipo da atividade + botão de concluir */}
      <span className="card-conv__avatar">
        <button
          type="button"
          onClick={() => onToggleComplete(activity.id)}
          aria-label={activity.completed ? 'Marcar como pendente' : 'Marcar como concluído'}
          className="avatar avatar--md"
          style={{
            background: activity.completed ? 'var(--success)' : 'var(--ink-100)',
            color: activity.completed ? '#fff' : 'var(--ink-600)',
          }}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
        </button>
        <span className="badge-channel badge-channel--sm" style={{ background: badge.color }} title={badge.label}>
          {badge.letter}
        </span>
      </span>

      {/* Corpo */}
      <span className="card-conv__body">
        <span className="card-conv__top">
          <button
            type="button"
            onClick={() => onSelect?.(activity.id)}
            className="card-conv__name text-left"
            style={activity.completed ? { textDecoration: 'line-through' } : undefined}
          >
            {activity.title}
          </button>
          {isMeeting && <span className="card-conv__time num">{timeString}</span>}
        </span>

        {activity.dealTitle && <span className="card-conv__org">{activity.dealTitle}</span>}

        {activity.description && (
          <span className="card-conv__preview">{activity.description}</span>
        )}

        {!activity.dealTitle && onSelect && (
          <button
            type="button"
            onClick={() => onSelect(activity.id)}
            className="btn btn--quiet"
            style={{ padding: 0, marginTop: 4, justifyContent: 'flex-start' }}
          >
            ver detalhes
          </button>
        )}
      </span>

      {/* Menu de ações */}
      <span className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Menu de opções"
          aria-expanded={showMenu}
          aria-haspopup="true"
          className="btn btn--quiet opacity-0 group-hover:opacity-100"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>

        {showMenu && (
          <>
            <span className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <span
              className="panel absolute right-0 top-full mt-1 z-20"
              style={{ padding: 'var(--space-2)', minWidth: 160, boxShadow: 'var(--shadow-lg)' }}
            >
              {isMeeting && (
                <button
                  type="button"
                  onClick={() => { onToggleComplete(activity.id); setShowMenu(false); }}
                  className="btn btn--quiet btn--block"
                  style={{ justifyContent: 'flex-start' }}
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  concluir
                </button>
              )}
              {onSnooze && (
                <button
                  type="button"
                  onClick={() => { onSnooze(activity.id); setShowMenu(false); }}
                  className="btn btn--quiet btn--block"
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Clock size={14} aria-hidden="true" />
                  adiar 1 dia
                </button>
              )}
              {onDiscard && (
                <button
                  type="button"
                  onClick={() => { onDiscard(activity.id); setShowMenu(false); }}
                  className="btn btn--quiet btn--block"
                  style={{ justifyContent: 'flex-start', color: 'var(--danger)' }}
                >
                  <X size={14} aria-hidden="true" />
                  remover
                </button>
              )}
            </span>
          </>
        )}
      </span>
    </div>
  );
};

export const InboxItem = React.memo(InboxItemComponent);
