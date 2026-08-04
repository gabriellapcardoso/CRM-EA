import React from 'react';
import { Filter, Plus, Download } from 'lucide-react';

interface ContactsHeaderProps {
  viewMode: 'people' | 'companies';
  search: string;
  setSearch: (value: string) => void;
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'RISK';
  setStatusFilter: (value: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'RISK') => void;
  isFilterOpen: boolean;
  setIsFilterOpen: (value: boolean) => void;
  openCreateModal: () => void;
  openImportExportModal?: () => void;
}

/**
 * Componente React `ContactsHeader`.
 *
 * @param {ContactsHeaderProps} {
  viewMode,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  isFilterOpen,
  setIsFilterOpen,
  openCreateModal,
} - Parâmetro `{
  viewMode,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  isFilterOpen,
  setIsFilterOpen,
  openCreateModal,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ContactsHeader: React.FC<ContactsHeaderProps> = ({
  viewMode,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  isFilterOpen,
  setIsFilterOpen,
  openCreateModal,
  openImportExportModal,
}) => {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {viewMode === 'people' && (
        <select
          value={statusFilter}
          onChange={e =>
            setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'RISK')
          }
          aria-label="Filtrar por status"
          className="btn btn--ghost"
        >
          <option value="ALL">todos os status</option>
          <option value="ACTIVE">ativos</option>
          <option value="INACTIVE">inativos</option>
          <option value="CHURNED">perdidos (churn)</option>
          <option value="RISK">em risco</option>
        </select>
      )}
      <form className="search" role="search" onSubmit={e => e.preventDefault()}>
        <label className="sr-only" htmlFor="contacts-search">buscar</label>
        <input
          id="contacts-search"
          className="search__input"
          type="search"
          placeholder={viewMode === 'people' ? 'buscar nomes, e-mails...' : 'buscar empresas, setor...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </form>
      <button
        type="button"
        onClick={() => setIsFilterOpen(!isFilterOpen)}
        aria-label={isFilterOpen ? 'Fechar filtros avançados' : 'Abrir filtros avançados'}
        aria-expanded={isFilterOpen}
        className={`btn ${isFilterOpen ? 'btn--primary' : 'btn--ghost'}`}
      >
        <Filter size={16} aria-hidden="true" />
      </button>
      {viewMode === 'people' && (
        <button
          type="button"
          onClick={openImportExportModal}
          aria-label="Importar/Exportar contatos"
          className="btn btn--ghost"
        >
          <Download size={16} aria-hidden="true" />
        </button>
      )}
      <span className="spacer" />
      <button type="button" onClick={openCreateModal} className="btn btn--primary">
        <Plus size={16} aria-hidden="true" /> {viewMode === 'people' ? 'novo contato' : 'nova empresa'}
      </button>
    </div>
  );
};
