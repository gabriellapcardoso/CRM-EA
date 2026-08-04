'use client';

/**
 * @fileoverview Stage Advance Suggestion Component
 *
 * Componente UI editável para aprovar/rejeitar/editar sugestões de avanço de estágio.
 * Segue o padrão Lightfield de HITL onde o usuário pode:
 * 1. Aprovar como está
 * 2. Editar e aprovar (mudar estágio destino, motivo)
 * 3. Rejeitar
 * 4. Decidir depois (dismiss)
 *
 * @module features/messaging/components/StageAdvanceSuggestion
 */

import { useState } from 'react';
import {
  Brain,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StageAdvanceSuggestion as SuggestionType, UserEdits } from '@/lib/ai/agent/hitl-stage-advance';

// =============================================================================
// Types
// =============================================================================

interface BoardStage {
  id: string;
  name: string;
  order?: number;
}

interface StageAdvanceSuggestionProps {
  /** A sugestão da AI */
  suggestion: SuggestionType;
  /** Estágios disponíveis para seleção */
  stages: BoardStage[];
  /** Callback quando usuário submete decisão */
  onSubmit: (edits: UserEdits) => Promise<void>;
  /** Callback quando usuário quer decidir depois */
  onDismiss: () => void;
  /** Se está processando */
  isLoading?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function StageAdvanceSuggestion({
  suggestion,
  stages,
  onSubmit,
  onDismiss,
  isLoading = false,
}: StageAdvanceSuggestionProps) {
  // Estado editável
  const [targetStageId, setTargetStageId] = useState(suggestion.targetStageId);
  const [reason, setReason] = useState(suggestion.reason);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Detectar se foi editado
  const wasEdited =
    targetStageId !== suggestion.targetStageId ||
    reason !== suggestion.reason ||
    additionalNotes.length > 0;

  // Encontrar nome do estágio selecionado
  const selectedStage = stages.find((s) => s.id === targetStageId);

  const handleApprove = async () => {
    await onSubmit({
      approved: true,
      targetStageId: wasEdited ? targetStageId : undefined,
      reason: reason !== suggestion.reason ? reason : undefined,
      additionalNotes: additionalNotes || undefined,
    });
  };

  const handleReject = async () => {
    await onSubmit({
      approved: false,
      additionalNotes: additionalNotes || undefined,
    });
  };

  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceVariant =
    confidencePercent >= 85
      ? 'badge-confidence--executada'
      : confidencePercent >= 70
        ? 'badge-confidence--pendente'
        : 'badge-confidence--arquivada';

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="actor actor--pendente" aria-hidden="true">
          <Brain className="h-3.5 w-3.5" />
        </span>
        <h3 className="title-sm">a IA sugere avançar o lead</h3>
        <span className="spacer" />
        <span className={cn('badge-confidence', confidenceVariant)}>{confidencePercent}%</span>
      </div>

      <div className="panel__body">
        {/* Deal info */}
        <p className="meta flex items-center gap-2 flex-wrap">
          <strong>{suggestion.dealTitle}</strong>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{suggestion.currentStageName}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          <strong>{selectedStage?.name || suggestion.targetStageName}</strong>
        </p>

        {/* Toggle detalhes */}
        <button type="button" onClick={() => setShowDetails(!showDetails)} className="btn btn--quiet">
          {showDetails ? (
            <>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ocultar detalhes
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ver critérios avaliados
            </>
          )}
        </button>

        {/* Critérios avaliados */}
        {showDetails && (
          <div className="checklist">
            {suggestion.criteriaEvaluation.map((c) => (
              <div key={c.criterion} className={cn('checklist__item', c.met && 'checklist__item--done')}>
                <span className="checklist__box" aria-hidden="true">
                  {c.met ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  {c.criterion} <span className="meta">({Math.round(c.confidence * 100)}%)</span>
                  {c.evidence && (
                    <span className="meta block italic">&quot;{c.evidence}&quot;</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Campos editáveis */}
        <div className="field">
          <label htmlFor="targetStage" className="field__label flex items-center gap-1">
            avançar para
            {targetStageId !== suggestion.targetStageId && (
              <Pencil className="h-3 w-3" aria-hidden="true" />
            )}
          </label>
          <select
            id="targetStage"
            value={targetStageId}
            onChange={(e) => setTargetStageId(e.target.value)}
            className="input"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
                {stage.id === suggestion.targetStageId ? ' (sugerido)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="reason" className="field__label flex items-center gap-1">
            motivo
            {reason !== suggestion.reason && <Pencil className="h-3 w-3" aria-hidden="true" />}
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input input--textarea"
            placeholder="motivo do avanço…"
          />
        </div>

        <div className="field">
          <label htmlFor="notes" className="field__label">notas adicionais (opcional)</label>
          <input
            type="text"
            id="notes"
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            className="input"
            placeholder="adicione contexto…"
          />
        </div>

        {wasEdited && (
          <p className="meta flex items-center gap-1">
            <Pencil className="h-3 w-3" aria-hidden="true" />
            você editou a sugestão original
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleApprove} disabled={isLoading} className="btn btn--primary">
            {isLoading ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {wasEdited ? 'aplicar edições' : 'confirmar avanço'}
          </button>

          <button type="button" onClick={handleReject} disabled={isLoading} className="btn btn--ghost">
            <XCircle className="h-4 w-4" aria-hidden="true" />
            rejeitar
          </button>

          <button type="button" onClick={onDismiss} disabled={isLoading} className="btn btn--quiet">
            decidir depois
          </button>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Compact Version (for notification/list view)
// =============================================================================

interface CompactSuggestionProps {
  suggestion: SuggestionType;
  onClick: () => void;
}

export function CompactStageAdvanceSuggestion({ suggestion, onClick }: CompactSuggestionProps) {
  const confidencePercent = Math.round(suggestion.confidence * 100);

  return (
    <button type="button" onClick={onClick} className="card-hitl-note w-full text-left">
      <span className="card-hitl-note__title flex items-center gap-2">
        <Brain className="h-4 w-4" aria-hidden="true" />
        a IA sugere avanço
        <span className="spacer" />
        <span className="badge-confidence badge-confidence--pendente">{confidencePercent}%</span>
      </span>
      <span className="card-hitl-note__text">
        {suggestion.dealTitle}: {suggestion.currentStageName} → {suggestion.targetStageName}
      </span>
    </button>
  );
}
