import React from 'react';
import { Plus, LayoutList, Calendar as CalendarIcon } from 'lucide-react';

interface ActivitiesHeaderProps {
  viewMode: 'list' | 'calendar';
  setViewMode: (mode: 'list' | 'calendar') => void;
  onNewActivity: () => void;
  dateFilter?: 'ALL' | 'overdue' | 'today' | 'upcoming';
}

/**
 * Componente React `ActivitiesHeader`.
 *
 * @param {ActivitiesHeaderProps} {
  viewMode,
  setViewMode,
  onNewActivity,
  dateFilter = 'ALL',
} - Parâmetro `{
  viewMode,
  setViewMode,
  onNewActivity,
  dateFilter = 'ALL',
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesHeader: React.FC<ActivitiesHeaderProps> = ({
  viewMode,
  setViewMode,
  onNewActivity,
  dateFilter = 'ALL',
}) => {
  const filterLabel =
    dateFilter === 'overdue'
      ? 'Atrasados'
      : dateFilter === 'today'
        ? 'Hoje'
        : dateFilter === 'upcoming'
          ? 'Próximos'
          : null;

  return (
    <div className="panel__head">
      <div className="chip-row">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`chip ${viewMode === 'list' ? 'chip--active' : ''}`}
        >
          <LayoutList size={14} /> lista
        </button>
        <button
          type="button"
          onClick={() => setViewMode('calendar')}
          className={`chip ${viewMode === 'calendar' ? 'chip--active' : ''}`}
        >
          <CalendarIcon size={14} /> calendário
        </button>
        {filterLabel && <span className="chip chip--active">filtro: {filterLabel.toLowerCase()}</span>}
      </div>
      <span className="spacer" />
      <button type="button" onClick={onNewActivity} className="btn btn--primary">
        <Plus size={16} /> nova atividade
      </button>
    </div>
  );
};
