import React from 'react';
import { AISuggestion, AISuggestionType } from '../hooks/useInboxController';
import { 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  Clock,
  Check, 
  X, 
  ChevronRight,
  Zap
} from 'lucide-react';

interface AISuggestionsSectionProps {
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
}

const getTypeConfig = (type: AISuggestionType) => {
  switch (type) {
    case 'UPSELL':
      return { icon: TrendingUp, color: 'var(--success)', label: 'upsell' };
    case 'STALLED':
      return { icon: AlertTriangle, color: 'var(--warning)', label: 'risco' };
    case 'RESCUE':
      return { icon: Zap, color: 'var(--hitl-ink)', label: 'resgate' };
    default:
      return { icon: Sparkles, color: 'var(--purple-700)', label: 'IA' };
  }
};

/**
 * Componente React `AISuggestionsSection`.
 *
 * @param {AISuggestionsSectionProps} {
  suggestions,
  onAccept,
  onDismiss,
  onSnooze
} - Parâmetro `{
  suggestions,
  onAccept,
  onDismiss,
  onSnooze
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const AISuggestionsSection: React.FC<AISuggestionsSectionProps> = ({
  suggestions,
  onAccept,
  onDismiss,
  onSnooze
}) => {
  if (suggestions.length === 0) return null;

  return (
    <section>
      {/* Header */}
      <div className="section-head">
        <span className="actor actor--ia" aria-hidden="true">
          <Sparkles size={13} />
        </span>
        <h2 className="section-head__title">sugestões da IA</h2>
        <span className="badge-count">{suggestions.length}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
        {suggestions.map(suggestion => {
          const config = getTypeConfig(suggestion.type);
          const Icon = config.icon;

          return (
            <article key={suggestion.id} className="panel group">
              <div className="panel__head">
                <span className="actor actor--auto" aria-hidden="true">
                  <Icon size={13} style={{ color: config.color }} />
                </span>
                <span className="eyebrow" style={{ color: config.color }}>{config.label}</span>
                {suggestion.priority === 'high' && (
                  <span className="status-chip status-chip--off">urgente</span>
                )}
                <span className="spacer" />
                <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onSnooze(suggestion.id)}
                    className="btn btn--quiet"
                    aria-label="Adiar sugestão"
                    title="Adiar"
                  >
                    <Clock size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(suggestion.id)}
                    className="btn btn--quiet"
                    aria-label="Descartar sugestão"
                    title="Descartar"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(suggestion)}
                    className="btn btn--primary"
                    aria-label="Aceitar sugestão"
                    title="Aceitar"
                  >
                    <Check size={15} aria-hidden="true" />
                  </button>
                </span>
              </div>

              <div className="panel__body">
                <h3 className="title-sm">{suggestion.title}</h3>
                <p className="meta">{suggestion.description}</p>
                {suggestion.data.deal && (
                  <p className="num" style={{ fontSize: 13, fontWeight: 700 }}>
                    R$ {suggestion.data.deal.value.toLocaleString('pt-BR')}
                  </p>
                )}

                {/* Ação principal em telas estreitas, onde o hover não existe */}
                <button
                  type="button"
                  onClick={() => onAccept(suggestion)}
                  className="btn btn--ghost btn--block md:hidden"
                >
                  aceitar sugestão <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
