import React, { useCallback, useMemo, useState } from 'react';
import { DealView, BoardStage, Board } from '@/types';
import { DealCard } from './DealCard';
import { isDealRotting, getActivityStatus } from '@/features/boards/hooks/useBoardsController';
import { MoveToStageModal } from '../Modals/MoveToStageModal';
import { useLifecycleStages } from '@/lib/query/hooks/useLifecycleStagesQuery';
import { usePendingAdvancesQuery } from '@/lib/query/hooks/usePendingAdvancesQuery';
import { buildStageGroupMap } from '@/features/boards/stageGroups';
import { formatCurrencyBRL } from '@/features/boards/cardFormat';

interface KanbanBoardProps {
  stages: BoardStage[];
  filteredDeals: DealView[];
  draggingId: string | null;
  handleDragStart: (e: React.DragEvent, id: string, title: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, stageId: string) => void;
  setSelectedDealId: (id: string | null) => void;
  openActivityMenuId: string | null;
  setOpenActivityMenuId: (id: string | null) => void;
  handleQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  /** Callback to move a deal to a new stage (for keyboard accessibility) */
  onMoveDealToStage?: (dealId: string, newStageId: string) => void;
  /** Exibe skeleton cards enquanto os dados carregam */
  isLoading?: boolean;
  /** Board ativo — usado para resolver os estágios de ganho/perda no mapa de cor. */
  board?: Board | null;
  /** Abre o modal de novo deal a partir de uma coluna vazia. */
  onNewDeal?: () => void;
}

/**
 * Componente React `KanbanBoard` — kanban full-bleed do redesign 2026-08.
 *
 * Markup segue `board.css`/`card-deal.css` do handoff (`.board`, `.board__col`,
 * `.col-head`, `.board__cards`, `.col-empty`). Toda a lógica de drag-and-drop
 * (HTML5 nativo, via `handleDragStart`/`handleDragOver`/`handleDrop`) e de cache
 * permanece intocada — só o markup mudou.
 */
export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  stages,
  filteredDeals,
  draggingId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  onMoveDealToStage,
  isLoading = false,
  board = null,
  onNewDeal,
}) => {
  const { data: lifecycleStages = [] } = useLifecycleStages();
  const { data: pendingAdvances = [] } = usePendingAdvancesQuery({ status: 'pending' });
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // State for move-to-stage modal (keyboard accessibility alternative to drag-and-drop)
  const [moveToStageModal, setMoveToStageModal] = useState<{
    isOpen: boolean;
    deal: DealView;
    currentStageId: string;
  } | null>(null);

  /**
   * Performance: o Kanban renderiza listas grandes. Evitamos padrões O(S*N) no render:
   * - Antes: para cada stage, fazia `filteredDeals.filter(...)` + `reduce(...)`.
   * - Agora: agrupamos 1 vez (O(N)) e só lemos por stage (O(S)).
   */
  const dealsByStageId = useMemo(() => {
    const map = new Map<string, DealView[]>();
    const totals = new Map<string, number>();
    for (const deal of filteredDeals) {
      const list = map.get(deal.status);
      if (list) list.push(deal);
      else map.set(deal.status, [deal]);

      totals.set(deal.status, (totals.get(deal.status) ?? 0) + (deal.value ?? 0));
    }
    return { map, totals };
  }, [filteredDeals]);

  // Performance: evita `find` por stage (O(S*L)). Map é O(1) por lookup.
  const lifecycleStageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ls of lifecycleStages ?? []) {
      if (ls?.id && ls?.name) map.set(ls.id, ls.name);
    }
    return map;
  }, [lifecycleStages]);

  // Redesign: 14 estágios reais → 5 grupos de cor do handoff.
  const stageGroups = useMemo(() => buildStageGroupMap(stages, board), [stages, board]);

  // HITL: pendência real por deal (`ai_pending_stage_advances`).
  const pendingByDealId = useMemo(() => {
    const map = new Map<string, { suggestedStageName: string; confidence: number }>();
    for (const adv of pendingAdvances ?? []) {
      if (adv?.status !== 'pending' || !adv.deal_id) continue;
      map.set(adv.deal_id, {
        suggestedStageName: adv.suggested_stage?.name ?? 'próximo estágio',
        confidence: adv.confidence ?? 0,
      });
    }
    return map;
  }, [pendingAdvances]);

  // Performance: index deals by id once so callbacks can stay stable across menu toggles.
  const dealsById = useMemo(() => new Map(filteredDeals.map(d => [d.id, d])), [filteredDeals]);

  // Performance: keep selection callback stable so DealCard can be memoized.
  const handleSelectDeal = useCallback(
    (dealId: string) => {
      setSelectedDealId(dealId);
    },
    [setSelectedDealId]
  );

  // Handler to open move-to-stage modal (stable across re-renders when only menu state changes)
  const handleOpenMoveToStage = useCallback(
    (dealId: string) => {
      const deal = dealsById.get(dealId);
      if (deal) {
        setMoveToStageModal({
          isOpen: true,
          deal,
          currentStageId: deal.status,
        });
      }
    },
    [dealsById]
  );

  // Handler to confirm move to a new stage
  const handleConfirmMoveToStage = useCallback(
    (dealId: string, newStageId: string) => {
      if (onMoveDealToStage) {
        onMoveDealToStage(dealId, newStageId);
      }
      setMoveToStageModal(null);
    },
    [onMoveDealToStage]
  );

  return (
    <div className="board" role="list" aria-label="Colunas do pipeline">
      {stages.map(stage => {
        const stageDeals = dealsByStageId.map.get(stage.id) ?? [];
        const stageValue = dealsByStageId.totals.get(stage.id) ?? 0;
        const isOver = dragOverStage === stage.id && draggingId !== null;
        const group = stageGroups.get(stage.id) ?? 'frio';
        const pendingCount = stageDeals.reduce(
          (acc, d) => acc + (pendingByDealId.has(d.id) ? 1 : 0),
          0
        );

        // Resolve linked stage name
        const linkedStageName = stage.linkedLifecycleStage
          ? (lifecycleStageNameById.get(stage.linkedLifecycleStage) ?? null)
          : null;

        return (
          <section
            key={stage.id}
            role="listitem"
            aria-label={`Coluna ${stage.label}: ${stageDeals.length} negócio${stageDeals.length !== 1 ? 's' : ''}`}
            className="board__col"
            onDragOver={e => {
              handleDragOver(e);
              setDragOverStage(stage.id);
            }}
            onDrop={e => {
              handleDrop(e, stage.id);
              setDragOverStage(null);
            }}
            onDragEnter={() => setDragOverStage(stage.id)}
            onDragLeave={() => setDragOverStage(null)}
          >
            <header className={`col-head col-head--${group}`}>
              <div className="col-head__top">
                <span className={`stage-swatch stage-swatch--${group}`} aria-hidden="true" />
                <h3 className="col-head__name">{stage.label}</h3>
                <span className="col-head__count num">{stageDeals.length}</span>
              </div>
              <div className="col-head__meta">
                <span className="num">{formatCurrencyBRL(stageValue)}</span>
                {pendingCount > 0 ? (
                  <span className="tag-pending">
                    {pendingCount} p/ aprovar
                  </span>
                ) : null}
              </div>
              {linkedStageName ? (
                <p className="meta" title={`Promove o contato para ${linkedStageName}`}>
                  promove para {linkedStageName}
                </p>
              ) : null}
              <span className="col-head__rule" aria-hidden="true" />
            </header>

            <ul
              className="board__cards"
              aria-label={`Negócios em ${stage.label}`}
              style={
                isOver
                  ? {
                      outline: '2px dashed var(--lime-500)',
                      outlineOffset: '4px',
                      borderRadius: 'var(--radius-cta)',
                      minHeight: '72px',
                    }
                  : { minHeight: '8px' }
              }
            >
              {isLoading ? (
                <>
                  <li className="skeleton skeleton--card" aria-hidden="true" />
                  <li className="skeleton skeleton--card" aria-hidden="true" />
                </>
              ) : null}

              {!isLoading && stageDeals.length === 0 ? (
                <li>
                  <div className="col-empty">
                    {isOver ? (
                      'solte aqui'
                    ) : (
                      <>
                        nenhum deal aqui
                        {onNewDeal ? (
                          <button type="button" className="col-empty__action" onClick={onNewDeal}>
                            criar deal
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              ) : null}

              {!isLoading &&
                stageDeals.map(deal => (
                  <li key={deal.id}>
                    <DealCard
                      deal={deal}
                      isRotting={isDealRotting(deal) && !deal.isWon && !deal.isLost}
                      activityStatus={getActivityStatus(deal)}
                      isDragging={draggingId === deal.id}
                      onDragStart={handleDragStart}
                      onSelect={handleSelectDeal}
                      // Performance: avoid passing openMenuId (string) to all cards.
                      // Only 1–2 cards will flip `isMenuOpen` when the menu is toggled.
                      isMenuOpen={openActivityMenuId === deal.id}
                      setOpenMenuId={setOpenActivityMenuId}
                      onQuickAddActivity={handleQuickAddActivity}
                      setLastMouseDownDealId={setLastMouseDownDealId}
                      onMoveToStage={onMoveDealToStage ? handleOpenMoveToStage : undefined}
                      stageGroup={group}
                      pendingAdvance={pendingByDealId.get(deal.id) ?? null}
                    />
                  </li>
                ))}
            </ul>
          </section>
        );
      })}

      {/* Keyboard-accessible modal for moving deals between stages */}
      {moveToStageModal && (
        <MoveToStageModal
          isOpen={moveToStageModal.isOpen}
          onClose={() => setMoveToStageModal(null)}
          onMove={handleConfirmMoveToStage}
          deal={moveToStageModal.deal}
          stages={stages}
          currentStageId={moveToStageModal.currentStageId}
        />
      )}
    </div>
  );
};
