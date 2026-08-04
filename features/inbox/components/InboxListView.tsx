import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity } from '@/types';
import { AISuggestion } from '../hooks/useInboxController';
import { InboxSection } from './InboxSection';
import { InboxZeroState } from './InboxZeroState';
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Check,
  ExternalLink,
  X,
  Clock,
} from 'lucide-react';

interface InboxListViewProps {
  // Atividades
  overdueActivities: Activity[];
  todayMeetings: Activity[];
  todayTasks: Activity[];
  upcomingActivities: Activity[];

  // Sugestões
  aiSuggestions: AISuggestion[];

  // Handlers Atividades
  onCompleteActivity: (id: string) => void;
  onSnoozeActivity: (id: string) => void;
  onDiscardActivity: (id: string) => void;

  // Handlers Sugestões
  onAcceptSuggestion: (suggestion: AISuggestion) => void;
  onDismissSuggestion: (id: string) => void;
  onSnoozeSuggestion: (id: string) => void;
  onSelectActivity: (id: string) => void;

  // Presets de UI (ex.: vindo da Visão Geral)
  suggestionsDefaultOpen?: boolean;
  suggestionsDefaultShowAll?: boolean;
}

// Componente de Sugestão Simplificado (linha única)
const SuggestionRow: React.FC<{
  suggestion: AISuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
}> = ({ suggestion, onAccept, onDismiss, onSnooze }) => {
  const router = useRouter();

  const getIcon = () => {
    switch (suggestion.type) {
      case 'STALLED':
        return <AlertTriangle size={15} style={{ color: 'var(--warning)' }} aria-hidden="true" />;
      case 'UPSELL':
        return <TrendingUp size={15} style={{ color: 'var(--success)' }} aria-hidden="true" />;
      default:
        return <AlertTriangle size={15} style={{ color: 'var(--ink-400)' }} aria-hidden="true" />;
    }
  };

  const value = suggestion.data.deal?.value;
  const dealId = suggestion.data.deal?.id;
  const contactId = suggestion.data.contact?.id;

  const navigationTarget = dealId
    ? { href: `/boards?deal=${dealId}`, label: 'Ver negócio' }
    : contactId
      ? { href: `/contacts?contactId=${contactId}`, label: 'Ver contato' }
      : null;

  // Navigate to deal or contact
  const handleNavigate = () => {
    if (!navigationTarget) return;
    router.push(navigationTarget.href);
  };

  return (
    <div className="group flex items-center gap-3" style={{ padding: '9px 0' }}>
      <span className="shrink-0">{getIcon()}</span>

      {/* Clickable area for navigation */}
      <button
        type="button"
        onClick={handleNavigate}
        disabled={!navigationTarget}
        className="flex-1 min-w-0 text-left disabled:opacity-60"
      >
        <span className="card-conv__preview" style={{ display: 'block' }}>
          {suggestion.description}
        </span>
      </button>

      {value && (
        <span className="shrink-0 num" style={{ fontSize: 12.5, fontWeight: 700 }}>
          R$ {(value / 1000).toFixed(0)}k
        </span>
      )}

      {/* Actions */}
      <span className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={onAccept} className="btn btn--quiet" aria-label="Aplicar sugestão" title="Aplicar">
          <Check size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={onSnooze} className="btn btn--quiet" aria-label="Adiar sugestão" title="Adiar">
          <Clock size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={onDismiss} className="btn btn--quiet" aria-label="Descartar sugestão" title="Descartar">
          <X size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleNavigate}
          className="btn btn--quiet"
          aria-label={navigationTarget?.label || 'Abrir'}
          title={navigationTarget?.label || 'Abrir'}
          disabled={!navigationTarget}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
};

// Card de Sugestões IA Colapsável
const MAX_SUGGESTIONS = 5;

const AISuggestionsCard: React.FC<{
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  defaultOpen?: boolean;
  defaultShowAll?: boolean;
}> = ({
  suggestions,
  onAccept,
  onDismiss,
  onSnooze,
  defaultOpen,
  defaultShowAll,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? true);
  const [showAll, setShowAll] = useState(defaultShowAll ?? false);

  useEffect(() => {
    if (defaultOpen !== undefined) {
      setIsOpen(defaultOpen);
    }
  }, [defaultOpen]);

  useEffect(() => {
    if (defaultShowAll !== undefined) {
      setShowAll(defaultShowAll);
    }
  }, [defaultShowAll]);

  if (suggestions.length === 0) return null;

  const visibleSuggestions = showAll ? suggestions : suggestions.slice(0, MAX_SUGGESTIONS);
  const hasMore = suggestions.length > MAX_SUGGESTIONS;

  return (
    <section className="panel">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="panel__head w-full"
        aria-expanded={isOpen}
        style={{ marginBottom: isOpen ? undefined : 0 }}
      >
        <span className="actor actor--ia" aria-hidden="true">
          <Sparkles size={13} />
        </span>
        <span className="title-sm">sugestões da IA</span>
        <span className="badge-count">{suggestions.length}</span>
        <span className="spacer" />
        {isOpen ? (
          <ChevronDown size={16} aria-hidden="true" />
        ) : (
          <ChevronRight size={16} aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="panel__body" style={{ gap: 0 }}>
          {visibleSuggestions.map(suggestion => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => onAccept(suggestion)}
              onDismiss={() => onDismiss(suggestion.id)}
              onSnooze={() => onSnooze(suggestion.id)}
            />
          ))}

          {hasMore && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="btn btn--quiet btn--block">
              ver todas as {suggestions.length} sugestões
            </button>
          )}

          {showAll && hasMore && (
            <button type="button" onClick={() => setShowAll(false)} className="btn btn--quiet btn--block">
              mostrar menos
            </button>
          )}
        </div>
      )}
    </section>
  );
};

/**
 * Componente React `InboxListView`.
 *
 * @param {InboxListViewProps} {
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onCompleteActivity,
  onSnoozeActivity,
  onDiscardActivity,
  onAcceptSuggestion,
  onDismissSuggestion,
  onSnoozeSuggestion,
  onSelectActivity,
  suggestionsDefaultOpen,
  suggestionsDefaultShowAll,
} - Parâmetro `{
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onCompleteActivity,
  onSnoozeActivity,
  onDiscardActivity,
  onAcceptSuggestion,
  onDismissSuggestion,
  onSnoozeSuggestion,
  onSelectActivity,
  suggestionsDefaultOpen,
  suggestionsDefaultShowAll,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const InboxListView: React.FC<InboxListViewProps> = ({
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onCompleteActivity,
  onSnoozeActivity,
  onDiscardActivity,
  onAcceptSuggestion,
  onDismissSuggestion,
  onSnoozeSuggestion,
  onSelectActivity,
  suggestionsDefaultOpen,
  suggestionsDefaultShowAll,
}) => {
  const isEmpty =
    overdueActivities.length === 0
    && todayMeetings.length === 0
    && todayTasks.length === 0
    && upcomingActivities.length === 0
    && aiSuggestions.length === 0;

  if (isEmpty) {
    return <InboxZeroState />;
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
      {/* AI Suggestions (Card único colapsável) */}
      <AISuggestionsCard
        suggestions={aiSuggestions}
        onAccept={onAcceptSuggestion}
        onDismiss={onDismissSuggestion}
        onSnooze={onSnoozeSuggestion}
        defaultOpen={suggestionsDefaultOpen}
        defaultShowAll={suggestionsDefaultShowAll}
      />

      {/* Activities */}
      <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
        <InboxSection
          title="atrasados"
          activities={overdueActivities}
          color="red"
          filterParam="overdue"
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />

        {/* Hoje separado: Reuniões vs Tarefas */}
        <InboxSection
          title="reuniões hoje"
          activities={todayMeetings}
          color="green"
          filterParam="today"
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />

        <InboxSection
          title="tarefas hoje"
          activities={todayTasks}
          color="green"
          filterParam="today"
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />

        <InboxSection
          title="próximos"
          activities={upcomingActivities}
          color="slate"
          filterParam="upcoming"
          defaultOpen={false}
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />
      </div>
    </div>
  );
};
