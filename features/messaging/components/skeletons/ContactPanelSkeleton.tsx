'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

interface ContactPanelSkeletonProps {
  className?: string;
}

export const ContactPanelSkeleton = memo(function ContactPanelSkeleton({ className }: ContactPanelSkeletonProps) {
  return (
    <aside className={cn('context-pane', className)} aria-label="Carregando contexto da conversa">
      <div className="detail-pane__head">
        <div className="flex items-start gap-3">
          <span className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flex: 'none' }} />
          <div className="flex-1 skeleton-stack">
            <span className="skeleton" style={{ display: 'block', height: 18, width: '70%' }} />
            <span className="skeleton" style={{ display: 'block', height: 13, width: '50%' }} />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 'var(--space-3)' }}>
          <span className="skeleton" style={{ flex: 1, height: 34, borderRadius: 'var(--radius-button)' }} />
          <span className="skeleton" style={{ flex: 1, height: 34, borderRadius: 'var(--radius-button)' }} />
        </div>
      </div>

      {[0, 1].map((section) => (
        <section key={section} className="detail-pane__section">
          <span className="skeleton" style={{ display: 'block', height: 11, width: 90 }} />
          <div className="skeleton-stack" style={{ marginTop: 'var(--space-2)' }}>
            {[0, 1, 2].map((row) => (
              <span key={row} className="skeleton" style={{ display: 'block', height: 15 }} />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
});

export default ContactPanelSkeleton;
