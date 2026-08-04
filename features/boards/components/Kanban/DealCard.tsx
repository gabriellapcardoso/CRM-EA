import React, { useState } from 'react';
import { DealView } from '@/types';
import { ActivityStatusIcon } from './ActivityStatusIcon';
import { priorityAriaLabelPtBr } from '@/lib/utils/priority';
import type { StageGroup } from '@/features/boards/stageGroups';
import { formatShortAge, formatCurrencyBRL, getInitials } from '@/features/boards/cardFormat';

interface DealCardProps {
  deal: DealView;
  isRotting: boolean;
  activityStatus: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string, title: string) => void;
  /** Callback de seleção do deal (mantido estável via useCallback no pai para permitir memoização) */
  onSelect: (dealId: string) => void;
  /**
   * Performance: boolean derivado por-card evita prop global mutável.
   * Isso reduz re-render em listas grandes quando o usuário abre/fecha o menu.
   */
  isMenuOpen: boolean;
  setOpenMenuId: (id: string | null) => void;
  onQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  /** Callback to open move-to-stage modal for keyboard accessibility */
  onMoveToStage?: (dealId: string) => void;
  /** Grupo de cor do estágio (redesign — `.card-deal--*`). */
  stageGroup?: StageGroup;
  /**
   * Sugestão da IA aguardando aprovação humana para este deal
   * (`ai_pending_stage_advances`). Só existe quando há pendência real.
   */
  pendingAdvance?: { suggestedStageName: string; confidence: number } | null;
}

// Get priority label for accessibility (PT-BR)
const getPriorityLabel = (priority: string | undefined) => priorityAriaLabelPtBr(priority);

const DealCardComponent: React.FC<DealCardProps> = ({
  deal,
  isRotting,
  activityStatus,
  isDragging,
  onDragStart,
  onSelect,
  isMenuOpen,
  setOpenMenuId,
  onQuickAddActivity,
  setLastMouseDownDealId,
  onMoveToStage,
  stageGroup = 'frio',
  pendingAdvance = null,
}) => {
  const [localDragging, setLocalDragging] = useState(false);
  const isClosed = deal.isWon || deal.isLost;

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(isMenuOpen ? null : deal.id);
  };

  const handleQuickAdd = (type: 'CALL' | 'MEETING' | 'EMAIL') => {
    onQuickAddActivity(deal.id, type, deal.title);
  };

  const handleDragStart = (e: React.DragEvent) => {
    setLocalDragging(true);
    e.dataTransfer.setData('dealId', deal.id);
    // Fallback mapping when optimistic temp id gets replaced mid-drag by a refetch.
    // Do not log title; it can contain PII.
    e.dataTransfer.setData('dealTitle', deal.title || '');
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(e, deal.id, deal.title || '');
  };

  const handleDragEnd = () => {
    setLocalDragging(false);
  };

  /**
   * `.card-deal` tem borda esquerda por grupo de estágio; quando existe pendência
   * HITL o handoff manda a borda virar lime (`--pending`), sobrepondo o grupo.
   */
  const groupModifier = pendingAdvance ? 'pending' : deal.isLost ? 'perdido' : deal.isWon ? 'ganho' : stageGroup;
  const dragging = localDragging || isDragging;

  // Origem do card, ligada a dado real: pendência da IA > dono humano > automação.
  const ownerName = deal.owner?.name && deal.owner.name !== 'Sem Dono' ? deal.owner.name : null;
  const origin: { kind: 'ia' | 'humano' | 'auto'; icon: string; text: string } = pendingAdvance
    ? { kind: 'ia', icon: '✦', text: 'agente IA' }
    : ownerName
      ? { kind: 'humano', icon: '●', text: ownerName.split(' ')[0].toLowerCase() }
      : { kind: 'auto', icon: '⚡', text: 'automação' };

  const age = formatShortAge(deal.lastStageChangeDate || deal.updatedAt);

  // Build accessible label including visible text (tags)
  const getAriaLabel = () => {
    const parts: string[] = [];

    if (deal.isWon) parts.push('ganho');
    if (deal.isLost) parts.push('perdido');

    const shownTags = deal.tags.slice(0, isClosed ? 1 : 2);
    if (shownTags.length > 0) parts.push(...shownTags);

    parts.push(deal.title);
    if (deal.companyName) parts.push(deal.companyName);
    parts.push(formatCurrencyBRL(deal.value));

    const priority = getPriorityLabel(deal.priority);
    if (priority) parts.push(priority);
    if (isRotting && !isClosed) parts.push('estagnado');
    if (pendingAdvance) parts.push('aguardando sua aprovação');

    return parts.join(', ');
  };

  return (
    <div
      data-deal-id={deal.id}
      draggable={!deal.id.startsWith('temp-')}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseDown={() => setLastMouseDownDealId(deal.id)}
      onClick={e => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect(deal.id);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!(e.target as HTMLElement).closest('button')) {
            onSelect(deal.id);
          }
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={getAriaLabel()}
      className={`card-deal card-deal--${groupModifier}`}
      style={{
        cursor: dragging ? 'grabbing' : 'grab',
        opacity: dragging ? 0.5 : isRotting && !isClosed ? 0.85 : 1,
        transform: dragging ? 'rotate(1.5deg) scale(.97)' : undefined,
        borderStyle: isRotting && !isClosed ? 'dashed' : undefined,
      }}
    >
      {/* linha 1 — identidade + valor */}
      <div className="card-deal__head">
        <h4 className="card-deal__title">{deal.title}</h4>
        <p className="card-deal__value num">{formatCurrencyBRL(deal.value)}</p>
      </div>

      {/* linha 2 — pessoa + canal */}
      <div className="card-deal__contact">
        <span className="avatar avatar--sm avatar--muted" aria-hidden="true">
          {getInitials(deal.contactName || deal.companyName || deal.title)}
        </span>
        <p className="card-deal__contact-name">
          {deal.contactName || deal.companyName || 'sem contato'}
        </p>
        {deal.contactEmail ? (
          <span className="badge-channel badge-channel--email badge-channel--sm" title="E-mail">
            E
          </span>
        ) : null}
        <ActivityStatusIcon
          status={activityStatus}
          type={deal.nextActivity?.type}
          dealId={deal.id}
          dealTitle={deal.title}
          isOpen={isMenuOpen}
          onToggle={handleToggleMenu}
          onQuickAdd={handleQuickAdd}
          onRequestClose={() => setOpenMenuId(null)}
          onMoveToStage={onMoveToStage ? () => onMoveToStage(deal.id) : undefined}
        />
      </div>

      {/* linha 3 — pendência (só quando existe sugestão da IA aguardando você) */}
      {pendingAdvance ? (
        <p className="badge-pending">
          <span className="badge-pending__title">
            <span className="dot dot--pulse" />
            aguardando sua aprovação
          </span>
          <span className="badge-pending__text">
            IA quer mover para {pendingAdvance.suggestedStageName} (conf.{' '}
            {pendingAdvance.confidence.toFixed(2)})
          </span>
        </p>
      ) : null}

      {/* linha 4 — origem + idade */}
      <div className="card-deal__foot">
        <span className={`badge-origin badge-origin--${origin.kind}`}>
          <span className="badge-origin__icon" aria-hidden="true">
            {origin.icon}
          </span>
          {origin.text}
        </span>
        {deal.tags.length > 0 ? (
          <span className="tag" title={deal.tags.join(', ')}>
            {deal.tags[0]}
          </span>
        ) : null}
        <span className="card-deal__age">{age}</span>
      </div>
    </div>
  );
};

/**
 * Performance: `DealCard` fica em lista grande (Kanban).
 * Usamos `React.memo` para evitar re-render de TODOS os cards quando apenas o menu de 1 deal muda.
 * Isso depende de props estáveis do pai (ex.: `onSelect` via useCallback e `isMenuOpen` por-card).
 */
export const DealCard = React.memo(DealCardComponent);
