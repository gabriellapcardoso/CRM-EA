import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { Activity } from '@/types';
import { InboxItem } from './InboxItem';

const MAX_ITEMS = 5;

interface InboxSectionProps {
  title: string;
  activities: Activity[];
  color: 'red' | 'green' | 'slate';
  defaultOpen?: boolean;
  onToggleComplete: (id: string) => void;
  onSnooze?: (id: string) => void;
  onDiscard?: (id: string) => void;
  onSelect?: (id: string) => void;
  filterParam?: string; // e.g., 'overdue', 'today', 'upcoming'
}

/** Cor da régua do `.section-head`, por urgência da seção. */
const SWATCH_COLOR: Record<InboxSectionProps['color'], string> = {
  red: 'var(--danger)',
  green: 'var(--success)',
  slate: 'var(--ink-300)',
};

/**
 * Seção colapsável de atividades do inbox, no vocabulário `.section-head` +
 * `.conv-list`/`.card-conv` do redesign.
 */
export const InboxSection: React.FC<InboxSectionProps> = ({
  title,
  activities,
  color,
  defaultOpen = true,
  onToggleComplete,
  onSnooze,
  onDiscard,
  onSelect,
  filterParam
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (activities.length === 0) return null;

  const visibleActivities = activities.slice(0, MAX_ITEMS);
  const hasMore = activities.length > MAX_ITEMS;

  return (
    <section>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="section-head w-full"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        <span className="section-head__swatch" style={{ background: SWATCH_COLOR[color] }} aria-hidden="true" />
        <span className="section-head__title">{title}</span>
        <span className="badge-count">{activities.length}</span>
      </button>

      {isOpen && (
        <ul className="conv-list" style={{ overflow: 'visible', padding: 0 }}>
          {visibleActivities.map(activity => (
            <li key={activity.id}>
              <InboxItem
                activity={activity}
                onToggleComplete={onToggleComplete}
                onSnooze={onSnooze}
                onDiscard={onDiscard}
                onSelect={onSelect}
              />
            </li>
          ))}

          {hasMore && (
            <li>
              <Link
                href={filterParam ? `/activities?filter=${filterParam}` : '/activities'}
                className="btn btn--ghost btn--block"
              >
                ver todas as {activities.length} atividades
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
};
