import React, { useCallback, useMemo, useState } from 'react';
import { DealView, CustomFieldDefinition, BoardStage, Board } from '@/types';
import { ActivityStatusIcon } from './ActivityStatusIcon';
import { getActivityStatus } from '@/features/boards/hooks/useBoardsController';
import { MoveToStageModal } from '../Modals/MoveToStageModal';
import { type StageGroup, buildStageGroupMap } from '@/features/boards/stageGroups';
import { formatCurrencyBRL, getInitials } from '@/features/boards/cardFormat';

type QuickAddType = 'CALL' | 'MEETING' | 'EMAIL';

type KanbanListRowProps = {
  deal: DealView;
  stageLabel: string;
  stageGroup: StageGroup;
  stages: BoardStage[];
  customFieldDefinitions: CustomFieldDefinition[];
  isMenuOpen: boolean;
  onSelect: (dealId: string) => void;
  onToggleMenu: (e: React.MouseEvent, dealId: string) => void;
  onQuickAdd: (dealId: string, type: QuickAddType, dealTitle: string) => void;
  onCloseMenu: () => void;
  onMoveDealToStage?: (dealId: string, newStageId: string) => void;
};

/**
 * Performance: tabela pode ter muitas linhas.
 * `React.memo` + `isMenuOpen` por-linha evita re-render em massa ao alternar o menu.
 */
const KanbanListRow = React.memo(function KanbanListRow({
  deal,
  stageLabel,
  stageGroup,
  stages,
  customFieldDefinitions,
  isMenuOpen,
  onSelect,
  onToggleMenu,
  onQuickAdd,
  onCloseMenu,
  onMoveDealToStage,
}: KanbanListRowProps) {
  const [moveToStageOpen, setMoveToStageOpen] = useState(false);

  return (
    <>
      <tr onClick={() => onSelect(deal.id)} style={{ cursor: 'pointer' }}>
        <td style={{ width: 34 }}>
          <ActivityStatusIcon
            status={getActivityStatus(deal)}
            type={deal.nextActivity?.type}
            dealId={deal.id}
            dealTitle={deal.title}
            isOpen={isMenuOpen}
            onToggle={(e) => onToggleMenu(e, deal.id)}
            onQuickAdd={(type) => onQuickAdd(deal.id, type, deal.title)}
            onRequestClose={onCloseMenu}
          />
        </td>
        <td>
          <span className="cell-name">
            <span className="avatar avatar--sm avatar--muted" aria-hidden="true">
              {getInitials(deal.contactName || deal.companyName || deal.title)}
            </span>
            <span className="cell-name__text">{deal.title}</span>
          </span>
        </td>
        <td className="muted">{deal.companyName}</td>
        <td>
          {onMoveDealToStage ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMoveToStageOpen(true);
              }}
              className={`badge-stage badge-stage--${stageGroup}`}
              style={{ border: 0 }}
              aria-label="Mover estágio"
              title="Mover estágio"
            >
              {stageLabel}
            </button>
          ) : (
            <span className={`badge-stage badge-stage--${stageGroup}`}>{stageLabel}</span>
          )}
        </td>
        <td className="cell-num num">{formatCurrencyBRL(deal.value)}</td>
        <td>
          <span className="cell-name">
            <span className="avatar avatar--sm" aria-hidden="true">
              {getInitials(deal.owner?.name)}
            </span>
            <span className="muted">{deal.owner?.name}</span>
          </span>
        </td>
        {/* Custom Fields Cells */}
        {customFieldDefinitions.map((field) => (
          <td key={field.id} className="cell-num">
            {deal.customFields?.[field.key] || '-'}
          </td>
        ))}
      </tr>

      {onMoveDealToStage && moveToStageOpen ? (
        <MoveToStageModal
          isOpen={moveToStageOpen}
          onClose={() => setMoveToStageOpen(false)}
          onMove={(dealId, newStageId) => {
            onMoveDealToStage(dealId, newStageId);
            setMoveToStageOpen(false);
          }}
          deal={deal}
          stages={stages}
          currentStageId={deal.status}
        />
      ) : null}
    </>
  );
});

interface KanbanListProps {
  stages: BoardStage[];
  filteredDeals: DealView[];
  customFieldDefinitions: CustomFieldDefinition[];
  setSelectedDealId: (id: string | null) => void;
  openActivityMenuId: string | null;
  setOpenActivityMenuId: (id: string | null) => void;
  handleQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  /** Keyboard-accessible handler to move a deal to a new stage */
  onMoveDealToStage?: (dealId: string, newStageId: string) => void;
  /** Board ativo — resolve os estágios de ganho/perda no mapa de cor. */
  board?: Board | null;
}

/**
 * Componente React `KanbanList`.
 *
 * @param {KanbanListProps} {
  stages,
  filteredDeals,
  customFieldDefinitions,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
} - Parâmetro `{
  stages,
  filteredDeals,
  customFieldDefinitions,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const KanbanList: React.FC<KanbanListProps> = ({
  stages,
  filteredDeals,
  customFieldDefinitions,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
  onMoveDealToStage,
  board = null,
}) => {
  // Performance: evitar `find` por linha (O(N*S)) ao renderizar tabela.
  const stageLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages) {
      if (s?.id) map.set(s.id, s.label);
    }
    return map;
  }, [stages]);

  // Redesign: 14 estágios reais → 5 grupos de cor do handoff.
  const stageGroups = useMemo(() => buildStageGroupMap(stages, board), [stages, board]);

  // Performance: callbacks estáveis evitam re-render de subcomponentes memoizados.
  const handleRowClick = useCallback(
    (dealId: string) => {
      setSelectedDealId(dealId);
    },
    [setSelectedDealId]
  );

  const handleToggleMenu = useCallback(
    (e: React.MouseEvent, dealId: string) => {
      e.stopPropagation();
      setOpenActivityMenuId(openActivityMenuId === dealId ? null : dealId);
    },
    [openActivityMenuId, setOpenActivityMenuId]
  );

  const handleCloseMenu = useCallback(() => setOpenActivityMenuId(null), [setOpenActivityMenuId]);

  const handleQuickAdd = useCallback(
    (dealId: string, type: QuickAddType, dealTitle: string) => {
      handleQuickAddActivity(dealId, type, dealTitle);
    },
    [handleQuickAddActivity]
  );

  return (
    <table className="table-list">
      <thead>
        <tr>
          <th aria-label="Próxima atividade" />
          <th>negócio</th>
          <th>empresa</th>
          <th>estágio</th>
          <th style={{ textAlign: 'right' }}>valor</th>
          <th>dono</th>
          {/* Custom Fields Columns */}
          {customFieldDefinitions.map(field => (
            <th key={field.id} style={{ textAlign: 'right' }}>
              {field.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filteredDeals.map((deal) => (
          <KanbanListRow
            key={deal.id}
            deal={deal}
            stageLabel={stageLabelById.get(deal.status) || deal.status}
            stageGroup={
              deal.isLost
                ? 'perdido'
                : deal.isWon
                  ? 'ganho'
                  : (stageGroups.get(deal.status) ?? 'frio')
            }
            stages={stages}
            customFieldDefinitions={customFieldDefinitions}
            isMenuOpen={openActivityMenuId === deal.id}
            onSelect={handleRowClick}
            onToggleMenu={handleToggleMenu}
            onQuickAdd={handleQuickAdd}
            onCloseMenu={handleCloseMenu}
            onMoveDealToStage={onMoveDealToStage}
          />
        ))}
      </tbody>
    </table>
  );
};
