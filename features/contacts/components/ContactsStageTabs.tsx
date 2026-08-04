import React from 'react';
import { ContactStage } from '@/types';
import { Users, UserCheck, Handshake, Crown, Archive } from 'lucide-react';

interface StageCounts {
  LEAD: number;
  MQL: number;
  PROSPECT: number;
  CUSTOMER: number;
  OTHER: number;
}

interface ContactsStageTabs {
  activeStage: ContactStage | 'ALL';
  onStageChange: (stage: ContactStage | 'ALL') => void;
  counts: StageCounts;
}

const STAGE_CONFIG = {
  LEAD: {
    label: 'Leads',
    icon: Users,
    color: 'bg-slate-500',
    activeColor:
      'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-500/30',
  },
  MQL: {
    label: 'MQL',
    icon: UserCheck,
    color: 'bg-blue-500',
    activeColor:
      'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/30',
  },
  PROSPECT: {
    label: 'Prospects',
    icon: Handshake,
    color: 'bg-purple-500',
    activeColor:
      'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30',
  },
  CUSTOMER: {
    label: 'Clientes',
    icon: Crown,
    color: 'bg-green-500',
    activeColor:
      'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/30',
  },
  OTHER: {
    label: 'Outros / Perdidos',
    icon: Archive,
    color: 'bg-slate-500',
    activeColor:
      'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-500/30',
  },
};

/**
 * Componente React `ContactsStageTabs`.
 *
 * @param {ContactsStageTabs} {
  activeStage,
  onStageChange,
  counts,
} - Parâmetro `{
  activeStage,
  onStageChange,
  counts,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ContactsStageTabs: React.FC<ContactsStageTabs> = ({
  activeStage,
  onStageChange,
  counts,
}) => {
  const total = counts.LEAD + counts.MQL + counts.PROSPECT + counts.CUSTOMER + (counts.OTHER || 0);

  return (
    <div className="chip-row">
      <button
        type="button"
        onClick={() => onStageChange('ALL')}
        className={`chip ${activeStage === 'ALL' ? 'chip--active' : ''}`}
      >
        todos · {total}
      </button>

      {Object.entries(STAGE_CONFIG).map(([stage, config]) => {
        const count = counts[stage as keyof StageCounts];
        const isActive = activeStage === stage;

        return (
          <button
            key={stage}
            type="button"
            onClick={() => onStageChange(stage as ContactStage)}
            className={`chip ${isActive ? 'chip--active' : ''}`}
          >
            {config.label.toLowerCase()} · {count}
          </button>
        );
      })}
    </div>
  );
};

// Badge de estágio para usar nas rows
/**
 * Componente React `StageBadge`.
 *
 * @param {{ stage: string; }} { stage } - Parâmetro `{ stage }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const StageBadge: React.FC<{ stage: ContactStage | string }> = ({ stage }) => {
  const config = STAGE_CONFIG[stage];

  if (!config) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        {stage}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${config.activeColor}`}
    >
      {config.label}
    </span>
  );
};
