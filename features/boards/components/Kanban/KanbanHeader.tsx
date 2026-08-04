import React from 'react';
import Link from 'next/link';
import { Settings, Download, Lightbulb, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Board } from '@/types';
import { BoardSelector } from '../BoardSelector';

interface KanbanHeaderProps {
  // Boards
  boards: Board[];
  activeBoard: Board;
  onSelectBoard: (id: string) => void;
  onCreateBoard: () => void;
  onEditBoard?: (board: Board) => void;
  onDeleteBoard?: (id: string) => void;
  onExportTemplates?: () => void;
  // View
  viewMode: 'kanban' | 'list';
  setViewMode: (mode: 'kanban' | 'list') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  ownerFilter: 'all' | 'mine';
  setOwnerFilter: (filter: 'all' | 'mine') => void;
  statusFilter: 'open' | 'won' | 'lost' | 'all';
  setStatusFilter: (filter: 'open' | 'won' | 'lost' | 'all') => void;
  onNewDeal: () => void;
  /** Quantidade de deals atualmente visíveis (após filtros). */
  visibleDealCount?: number;
  /** Pendências HITL abertas na organização (`ai_pending_stage_advances`). */
  pendingCount?: number;
}

/**
 * Toolbar do board (`.board-toolbar` do handoff redesign 2026-08).
 *
 * Adaptações em relação ao mockup `pipeline.html`:
 * - O mockup tem 3 filtros fixos ("todos os deals", "meus", "aguardando você").
 *   O app real só tem filtro de dono (todos/meus), então "aguardando você"
 *   virou um link para a fila de decisões (`/decisions`) com a contagem real —
 *   não existe filtro de HITL no controller e inventar um mudaria comportamento.
 * - Os controles que o mockup não previa (seletor de board, alternância
 *   kanban/lista, filtro de status, busca, configurações do board) foram
 *   mantidos, usando o vocabulário `.chip`/`.input`/`.filter-group`.
 */
export const KanbanHeader: React.FC<KanbanHeaderProps> = ({
  boards,
  activeBoard,
  onSelectBoard,
  onCreateBoard,
  onEditBoard,
  onDeleteBoard,
  onExportTemplates,
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  ownerFilter,
  setOwnerFilter,
  statusFilter,
  setStatusFilter,
  onNewDeal,
  visibleDealCount,
  pendingCount = 0,
}) => {
  const stageCount = activeBoard.stages?.length ?? 0;

  return (
    <div className="board-toolbar">
      <div className="board-toolbar__title">
        <BoardSelector
          boards={boards}
          activeBoard={activeBoard}
          onSelectBoard={onSelectBoard}
          onCreateBoard={onCreateBoard}
          onEditBoard={onEditBoard}
          onDeleteBoard={onDeleteBoard}
        />
        <span className="badge-stage badge-stage--proposta">
          {stageCount} {stageCount === 1 ? 'estágio' : 'estágios'}
        </span>
      </div>

      <div className="filter-group" role="group" aria-label="Filtros de deal">
        <button
          type="button"
          className={`filter-group__item${ownerFilter === 'all' ? ' filter-group__item--active' : ''}`}
          aria-pressed={ownerFilter === 'all'}
          onClick={() => setOwnerFilter('all')}
        >
          todos os deals
          {ownerFilter === 'all' && typeof visibleDealCount === 'number' ? (
            <span className="filter-group__count num">{visibleDealCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`filter-group__item${ownerFilter === 'mine' ? ' filter-group__item--active' : ''}`}
          aria-pressed={ownerFilter === 'mine'}
          onClick={() => setOwnerFilter('mine')}
        >
          meus
          {ownerFilter === 'mine' && typeof visibleDealCount === 'number' ? (
            <span className="filter-group__count num">{visibleDealCount}</span>
          ) : null}
        </button>
        {pendingCount > 0 ? (
          <Link className="filter-group__item filter-group__item--hitl" href="/decisions">
            aguardando você <span className="filter-group__count num">{pendingCount}</span>
          </Link>
        ) : null}
      </div>

      <div className="filter-group" role="group" aria-label="Modo de visualização">
        <button
          type="button"
          className={`filter-group__item${viewMode === 'kanban' ? ' filter-group__item--active' : ''}`}
          aria-label="Visualização em quadro Kanban"
          aria-pressed={viewMode === 'kanban'}
          onClick={() => setViewMode('kanban')}
        >
          <LayoutGrid size={14} aria-hidden="true" /> quadro
        </button>
        <button
          type="button"
          className={`filter-group__item${viewMode === 'list' ? ' filter-group__item--active' : ''}`}
          aria-label="Visualização em lista"
          aria-pressed={viewMode === 'list'}
          onClick={() => setViewMode('list')}
        >
          <TableIcon size={14} aria-hidden="true" /> lista
        </button>
      </div>

      <label className="field" style={{ minWidth: 220 }}>
        <span className="sr-only">Filtrar negócios ou empresas</span>
        <input
          className="input"
          type="search"
          placeholder="filtrar negócios ou empresas…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '7px 12px' }}
        />
      </label>

      <select
        className="input"
        style={{ width: 'auto', padding: '7px 12px' }}
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as 'open' | 'won' | 'lost' | 'all')}
        aria-label="Filtrar por status"
      >
        <option value="open">em aberto</option>
        <option value="won">ganhos</option>
        <option value="lost">perdidos</option>
        <option value="all">todos</option>
      </select>

      <span className="spacer" />

      {onEditBoard && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onEditBoard(activeBoard)}
          title="Configurações do board"
          aria-label="Configurações do board"
        >
          <Settings size={15} aria-hidden="true" />
        </button>
      )}

      {onExportTemplates && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onExportTemplates}
          title="Exportar template (comunidade)"
          aria-label="Exportar template"
        >
          <Download size={15} aria-hidden="true" />
        </button>
      )}

      {activeBoard.automationSuggestions && activeBoard.automationSuggestions.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="btn btn--ghost" type="button" title="Automações sugeridas">
              <Lightbulb size={15} aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="panel" style={{ border: 0 }}>
              <div className="panel__head">
                <h4 className="panel__title title-sm">automações sugeridas</h4>
              </div>
              <ul className="panel__body">
                {activeBoard.automationSuggestions.map((suggestion, idx) => (
                  <li key={idx} className="feed__item">
                    <span className="actor actor--ia actor--sm" aria-hidden="true">
                      ✦
                    </span>
                    <span className="feed__text">{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <button className="btn btn--primary" type="button" onClick={onNewDeal}>
        novo deal
      </button>
    </div>
  );
};
