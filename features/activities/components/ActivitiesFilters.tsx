import React from 'react';
import { Activity } from '@/types';

interface ActivitiesFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterType: Activity['type'] | 'ALL';
  setFilterType: (type: Activity['type'] | 'ALL') => void;
}

const TYPE_CHIPS: Array<{ value: Activity['type'] | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'tudo' },
  { value: 'STATUS_CHANGE', label: '⚡ automação' },
  { value: 'CALL', label: 'ligações' },
  { value: 'MEETING', label: 'reuniões' },
  { value: 'EMAIL', label: 'e-mails' },
  { value: 'TASK', label: 'tarefas' },
];

/**
 * Componente React `ActivitiesFilters`.
 *
 * @param {ActivitiesFiltersProps} {
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
} - Parâmetro `{
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesFilters: React.FC<ActivitiesFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
}) => {
  return (
    <div className="panel__head">
      <div className="chip-row">
        {TYPE_CHIPS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilterType(value)}
            className={`chip ${filterType === value ? 'chip--active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="spacer" />
      <form className="search" role="search" onSubmit={e => e.preventDefault()}>
        <label className="sr-only" htmlFor="activities-search">buscar</label>
        <input
          id="activities-search"
          className="search__input"
          type="search"
          placeholder="buscar atividades..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </form>
    </div>
  );
};
