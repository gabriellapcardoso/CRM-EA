import React from 'react';
import { LayoutDashboard, List, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewMode } from '../hooks/useInboxController';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { id: ViewMode; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: 'overview', label: 'visão geral', icon: LayoutDashboard },
  { id: 'list', label: 'lista', icon: List },
  { id: 'focus', label: 'foco', icon: Target },
];

/**
 * Os 3 modos de visão do inbox no vocabulário `.chip` do redesign
 * (o handoff usa chips para alternar recortes na `.conv-pane__head`).
 */
export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onChange }) => {
  return (
    <div className="chip-row" role="group" aria-label="Modo de visualização">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={mode === id}
          className={cn('chip', mode === id && 'chip--active')}
        >
          <Icon size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
};
