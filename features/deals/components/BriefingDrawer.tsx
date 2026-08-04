/**
 * @fileoverview Briefing Drawer Component
 *
 * Drawer/sheet that displays the AI-generated meeting briefing.
 * Can be opened from the DealDetailModal header.
 *
 * @module features/deals/components/BriefingDrawer
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, FileText, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';
import { useBriefingQuery, useGenerateBriefing } from '@/lib/query/hooks/useBriefingQuery';
import { BriefingCard } from './BriefingCard';

interface BriefingDrawerProps {
  dealId: string;
  dealTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Loading state skeleton.
 */
function BriefingSkeleton() {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton skeleton--text" />
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--block" />
    </div>
  );
}

/**
 * Error state component.
 */
function BriefingError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="state-empty">
      <AlertCircle className="w-6 h-6" style={{ color: 'var(--danger)' }} aria-hidden="true" />
      <h4 className="state-empty__title">não foi possível gerar o briefing</h4>
      <p className="state-empty__text">{error}</p>
      <p className="state-empty__actions">
        <button type="button" onClick={onRetry} className="btn btn--ghost">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          tentar de novo
        </button>
      </p>
    </div>
  );
}

/**
 * Empty state when no messages exist.
 */
function BriefingEmpty({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="state-empty">
      <Sparkles className="w-6 h-6" style={{ color: 'var(--purple-600)' }} aria-hidden="true" />
      <h4 className="state-empty__title">preparar para a conversa</h4>
      <p className="state-empty__text">
        Gere um briefing com insights da IA para chegar preparada na próxima interação com este
        lead.
      </p>
      <p className="state-empty__actions">
        <button type="button" onClick={onGenerate} className="btn btn--primary">
          <FileText className="w-4 h-4" aria-hidden="true" />
          gerar briefing
        </button>
      </p>
    </div>
  );
}

export function BriefingDrawer({
  dealId,
  dealTitle,
  isOpen,
  onClose,
}: BriefingDrawerProps) {
  useFocusReturn({ enabled: isOpen });

  // Query for cached briefing
  const {
    data: briefing,
    isLoading,
    error,
    refetch,
  } = useBriefingQuery(isOpen ? dealId : null);

  // Mutation for generating/refreshing
  const { mutate: generate, isPending: isGenerating } = useGenerateBriefing();

  const handleGenerate = () => {
    generate(dealId);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <FocusTrap active={isOpen} onEscape={onClose} returnFocus>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[10000] md:left-[var(--app-sidebar-width,0px)]"
            style={{ background: 'rgba(33,0,50,.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          >
            {/* Drawer Panel */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Briefing: ${dealTitle}`}
              className={cn('absolute right-0 top-0 bottom-0', 'w-full max-w-lg', 'flex flex-col overflow-hidden')}
              style={{
                background: 'var(--surface-card)',
                borderLeft: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-lg)',
              }}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="thread__head shrink-0"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <span className="actor actor--ia" aria-hidden="true">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="thread__name">preparar conversa</h2>
                  <p className="thread__sub truncate">{dealTitle}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn--quiet"
                  aria-label="Fechar briefing"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoading || isGenerating ? (
                  <>
                    <p className="loading-more">
                      <span className="spinner" aria-hidden="true" />
                      analisando histórico e gerando briefing…
                    </p>
                    <BriefingSkeleton />
                  </>
                ) : error ? (
                  <BriefingError
                    error={error instanceof Error ? error.message : 'Erro desconhecido'}
                    onRetry={handleGenerate}
                  />
                ) : briefing ? (
                  <BriefingCard
                    briefing={briefing}
                    onRefresh={handleRefresh}
                    isRefreshing={isLoading}
                  />
                ) : (
                  <BriefingEmpty onGenerate={handleGenerate} />
                )}
              </div>
            </motion.div>
          </motion.div>
        </FocusTrap>
      )}
    </AnimatePresence>
  );
}
