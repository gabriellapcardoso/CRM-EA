'use client';

/**
 * @fileoverview Pending Advances Section
 *
 * Seção do inbox para mostrar pending stage advances (HITL).
 * Mostra lista compacta com opção de abrir sheet para resolver.
 *
 * @module features/inbox/components/PendingAdvancesSection
 */

import { useState } from 'react';
import { Brain, ArrowRight, X } from 'lucide-react';
import {
  usePendingAdvancesQuery,
  useResolvePendingAdvanceMutation,
  type PendingAdvanceListItem,
} from '@/lib/query/hooks';
import { useBoards } from '@/lib/query/hooks';
import { Sheet } from '@/components/ui/Sheet';
import { StageAdvanceSuggestion } from '@/features/messaging/components/StageAdvanceSuggestion';
import type { StageAdvanceSuggestion as SuggestionType, UserEdits } from '@/lib/ai/agent/hitl-stage-advance';

// =============================================================================
// Helper: Convert DB record to UI type
// =============================================================================

function mapToSuggestion(item: PendingAdvanceListItem): SuggestionType {
  return {
    dealId: item.deal_id,
    dealTitle: item.deals?.title || 'Deal',
    currentStageId: item.current_stage_id,
    currentStageName: item.current_stage?.name || 'Estágio atual',
    targetStageId: item.suggested_stage_id,
    targetStageName: item.suggested_stage?.name || 'Próximo estágio',
    confidence: item.confidence,
    reason: item.reason,
    criteriaEvaluation: item.criteria_evaluation.map((c) => ({
      criterion: c.criterion,
      met: c.met,
      confidence: c.confidence,
      evidence: c.evidence,
    })),
    conversationId: item.conversation_id || undefined,
  };
}

// =============================================================================
// Compact Row Component
// =============================================================================

interface PendingAdvanceRowProps {
  item: PendingAdvanceListItem;
  onClick: () => void;
}

function PendingAdvanceRow({ item, onClick }: PendingAdvanceRowProps) {
  const confidencePercent = Math.round(item.confidence * 100);

  return (
    <button type="button" onClick={onClick} className="feed__item w-full text-left">
      <span className="actor actor--pendente shrink-0" aria-hidden="true">
        <Brain size={12} />
      </span>
      <span className="feed__body">
        <span className="feed__text truncate">{item.deals?.title || 'Deal'}</span>
        <span className="feed__meta truncate">
          {item.current_stage?.name} → {item.suggested_stage?.name}
        </span>
      </span>
      <span className="badge-confidence badge-confidence--pendente shrink-0">{confidencePercent}%</span>
    </button>
  );
}

// =============================================================================
// Main Section Component
// =============================================================================

interface PendingAdvancesSectionProps {
  /** Limite de itens a mostrar (default: 5) */
  limit?: number;
  /** Callback quando resolver um item */
  onResolved?: () => void;
}

export function PendingAdvancesSection({ limit = 5, onResolved }: PendingAdvancesSectionProps) {
  const { data: pendingAdvances = [], isLoading } = usePendingAdvancesQuery({ status: 'pending' });
  const { data: boards = [] } = useBoards();
  const resolveMutation = useResolvePendingAdvanceMutation();

  const [selectedItem, setSelectedItem] = useState<PendingAdvanceListItem | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Get stages for the selected item's board
  const selectedStages = selectedItem
    ? boards.find((b) => b.stages?.some((s) => s.id === selectedItem.current_stage_id))?.stages || []
    : [];

  const handleOpenItem = (item: PendingAdvanceListItem) => {
    setSelectedItem(item);
    setIsSheetOpen(true);
  };

  const handleResolve = async (edits: UserEdits) => {
    if (!selectedItem) return;

    await resolveMutation.mutateAsync({
      pendingAdvanceId: selectedItem.id,
      userEdits: edits,
    });

    setIsSheetOpen(false);
    setSelectedItem(null);
    onResolved?.();
  };

  const handleDismiss = () => {
    setIsSheetOpen(false);
    setSelectedItem(null);
  };

  // Don't render if no pending advances
  if (!isLoading && pendingAdvances.length === 0) {
    return null;
  }

  const displayItems = pendingAdvances.slice(0, limit);
  const hasMore = pendingAdvances.length > limit;

  return (
    <>
      <section className="panel">
        {/* Header */}
        <div className="panel__head">
          <span className="actor actor--pendente" aria-hidden="true">
            <Brain size={12} />
          </span>
          <h3 className="title-sm">avanços pendentes</h3>
          <span className="badge-count">{pendingAdvances.length}</span>
          <span className="spacer" />
          {hasMore && (
            <button
              type="button"
              onClick={() => {/* TODO: Navigate to full list */}}
              className="btn btn--quiet"
            >
              ver todos
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="loading-more">
            <span className="spinner" aria-hidden="true" />
            carregando…
          </div>
        ) : (
          <div className="feed">
            {displayItems.map((item) => (
              <PendingAdvanceRow
                key={item.id}
                item={item}
                onClick={() => handleOpenItem(item)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Resolution Sheet */}
      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} ariaLabel="Confirmar Avanço de Estágio">
        <div className="max-h-[85vh] overflow-y-auto" style={{ padding: 'var(--space-4)' }}>
          <div className="panel__head">
            <h2 className="title-md">confirmar avanço de estágio</h2>
            <span className="spacer" />
            <button
              type="button"
              onClick={() => setIsSheetOpen(false)}
              className="btn btn--quiet"
              aria-label="Fechar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {selectedItem && (
            <StageAdvanceSuggestion
              suggestion={mapToSuggestion(selectedItem)}
              stages={selectedStages.map((s) => ({
                id: s.id,
                name: s.label,
              }))}
              onSubmit={handleResolve}
              onDismiss={handleDismiss}
              isLoading={resolveMutation.isPending}
            />
          )}
        </div>
      </Sheet>
    </>
  );
}

// =============================================================================
// Stat Card for Overview
// =============================================================================

interface PendingAdvancesStatCardProps {
  count: number;
  onClick?: () => void;
}

export function PendingAdvancesStatCard({ count, onClick }: PendingAdvancesStatCardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="card-kpi w-full text-left"
      style={count > 0 ? { background: 'var(--hitl-surface)' } : undefined}
    >
      <span className="card-kpi__label flex items-center gap-1.5">
        <Brain size={12} aria-hidden="true" />
        aprovações IA
      </span>
      <span
        className="card-kpi__value num"
        style={{ color: count > 0 ? 'var(--hitl-ink)' : 'var(--text-strong)' }}
      >
        {count}
      </span>
      <span className="meta">{count > 0 ? 'aguardando sua decisão' : 'nenhuma pendência'}</span>
    </Component>
  );
}
