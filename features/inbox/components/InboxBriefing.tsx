import React from 'react';
import { Sparkles } from 'lucide-react';

interface InboxBriefingProps {
  briefing: string | null;
  isLoading: boolean;
  stats: {
    overdueCount: number;
    todayCount: number;
    suggestionsCount: number;
    totalPending: number;
  };
}

/**
 * Componente React `InboxBriefing`.
 *
 * @param {InboxBriefingProps} { 
  briefing, 
  isLoading,
  stats 
} - Parâmetro `{ 
  briefing, 
  isLoading,
  stats 
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const InboxBriefing: React.FC<InboxBriefingProps> = ({ 
  briefing, 
  isLoading,
  stats 
}) => {
  return (
    <section className="panel panel--inverse">
      <div className="panel__head">
        <span className="actor actor--ia" aria-hidden="true">
          <Sparkles size={13} />
        </span>
        <h2 className="panel__title title-sm">seu briefing diário</h2>
      </div>

      <div className="panel__body">
        {isLoading ? (
          <p className="loading-more" style={{ paddingTop: 0, justifyContent: 'flex-start' }}>
            <span className="spinner" aria-hidden="true" />
            analisando seu dia…
          </p>
        ) : (
          <p>{briefing || 'vamos começar o dia! confira suas atividades abaixo.'}</p>
        )}

        <div className="chip-row">
          {stats.overdueCount > 0 && (
            <span className="status-chip status-chip--off">
              {stats.overdueCount} atrasado{stats.overdueCount > 1 ? 's' : ''}
            </span>
          )}
          {stats.todayCount > 0 && (
            <span className="status-chip status-chip--on">{stats.todayCount} para hoje</span>
          )}
          {stats.suggestionsCount > 0 && (
            <span className="status-chip status-chip--ia">
              ✦ {stats.suggestionsCount} sugest{stats.suggestionsCount > 1 ? 'ões' : 'ão'}
            </span>
          )}
          {stats.totalPending === 0 && (
            <span className="status-chip status-chip--on">inbox zerada</span>
          )}
        </div>
      </div>
    </section>
  );
};
