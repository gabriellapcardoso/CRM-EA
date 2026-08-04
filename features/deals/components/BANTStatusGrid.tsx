/**
 * @fileoverview BANT Status Grid Component
 *
 * Visual grid showing Budget, Authority, Need, Timeline qualification status.
 * Each quadrant shows the status with appropriate colors and icons.
 *
 * @module features/deals/components/BANTStatusGrid
 */

import React from 'react';
import { DollarSign, Users, Target, Clock, CheckCircle2, HelpCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BantStatus } from '@/lib/ai/briefing/schemas';

interface BANTStatusGridProps {
  bantStatus: BantStatus;
  className?: string;
}

type StatusLevel = 'unknown' | 'partial' | 'complete';

interface StatusConfig {
  level: StatusLevel;
  label: string;
  /** Classe `.status-chip--*` do redesign 2026-08. */
  chip: string;
}

/**
 * Get status configuration based on status string.
 *
 * Redesign 2026-08: as 4 paletas ad-hoc (verde/âmbar/vermelho/azul) foram
 * mapeadas para os `.status-chip--*` do handoff — não há outras cores de
 * estado no design system.
 */
function getStatusConfig(status: string): StatusConfig {
  switch (status) {
    case 'confirmed':
    case 'validated':
      return { level: 'complete', label: 'confirmado', chip: 'status-chip--on' };
    case 'mentioned':
    case 'expressed':
      return { level: 'partial', label: 'mencionado', chip: 'status-chip--warn' };
    case 'identified':
      return { level: 'partial', label: 'identificado', chip: 'status-chip--warn' };
    case 'negotiating':
      return { level: 'partial', label: 'em negociação', chip: 'status-chip--warn' };
    case 'urgent':
      return { level: 'complete', label: 'urgente', chip: 'status-chip--off' };
    case 'flexible':
      return { level: 'partial', label: 'flexível', chip: 'status-chip--ia' };
    default:
      return { level: 'unknown', label: 'desconhecido', chip: 'status-chip--muted' };
  }
}

function StatusIcon({ level }: { level: StatusLevel }) {
  switch (level) {
    case 'complete':
      return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} aria-hidden="true" />;
    case 'partial':
      return <AlertCircle className="w-4 h-4" style={{ color: 'var(--warning)' }} aria-hidden="true" />;
    default:
      return <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-faint)' }} aria-hidden="true" />;
  }
}

interface BANTItemProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  value: string | null;
  notes: string;
}

function BANTItem({ icon, title, status, value, notes }: BANTItemProps) {
  const config = getStatusConfig(status);

  return (
    <div className="card-deal" style={{ borderLeftColor: 'var(--stage-proposta)' }}>
      <div className="card-deal__head">
        <h4 className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ color: 'var(--purple-600)' }}>
            {icon}
          </span>
          {title}
        </h4>
        <StatusIcon level={config.level} />
      </div>

      <div className="chip-row">
        <span className={`status-chip ${config.chip}`}>{config.label}</span>
        {value && <span className="card-deal__value num">{value}</span>}
      </div>

      {notes && <p className="meta line-clamp-2">{notes}</p>}
    </div>
  );
}

export function BANTStatusGrid({ bantStatus, className }: BANTStatusGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <BANTItem
        icon={<DollarSign className="w-4 h-4" />}
        title="Orçamento"
        status={bantStatus.budget.status}
        value={bantStatus.budget.value}
        notes={bantStatus.budget.notes}
      />
      <BANTItem
        icon={<Users className="w-4 h-4" />}
        title="Autoridade"
        status={bantStatus.authority.status}
        value={bantStatus.authority.decisionMaker}
        notes={bantStatus.authority.notes}
      />
      <BANTItem
        icon={<Target className="w-4 h-4" />}
        title="Necessidade"
        status={bantStatus.need.status}
        value={
          bantStatus.need.painPoints.length > 0
            ? `${bantStatus.need.painPoints.length} dores`
            : null
        }
        notes={bantStatus.need.notes}
      />
      <BANTItem
        icon={<Clock className="w-4 h-4" />}
        title="Prazo"
        status={bantStatus.timeline.status}
        value={bantStatus.timeline.deadline}
        notes={bantStatus.timeline.notes}
      />
    </div>
  );
}
