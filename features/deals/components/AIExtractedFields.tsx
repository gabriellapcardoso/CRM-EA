/**
 * @fileoverview AI Extracted Fields Component
 *
 * Shows automatically extracted BANT fields from conversations.
 * Zero config - displays whatever has been extracted.
 *
 * @module features/deals/components/AIExtractedFields
 */

import React from 'react';
import { DollarSign, Users, Target, Clock, Sparkles, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIExtractedData, AIExtractedField } from '@/lib/ai/extraction/schemas';

interface AIExtractedFieldsProps {
  data: AIExtractedData | null | undefined;
  className?: string;
  compact?: boolean;
}

interface FieldConfig {
  key: keyof Omit<AIExtractedData, 'lastExtractedAt'>;
  label: string;
  icon: React.ReactNode;
}

const FIELD_CONFIG: FieldConfig[] = [
  { key: 'budget', label: 'Orçamento', icon: <DollarSign className="w-3.5 h-3.5" /> },
  { key: 'authority', label: 'Decisor', icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'need', label: 'Necessidade', icon: <Target className="w-3.5 h-3.5" /> },
  { key: 'timeline', label: 'Prazo', icon: <Clock className="w-3.5 h-3.5" /> },
];

/**
 * Redesign 2026-08: confiança usa `.badge-confidence--*` do handoff
 * (executada = alta, pendente = faixa HITL, arquivada = baixa/sem sinal).
 */
function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.85) return 'badge-confidence badge-confidence--executada';
  if (confidence >= 0.7) return 'badge-confidence badge-confidence--pendente';
  return 'badge-confidence badge-confidence--arquivada';
}

function FieldItem({
  config,
  field,
  compact,
}: {
  config: FieldConfig;
  field: AIExtractedField | undefined;
  compact?: boolean;
}) {
  const hasValue = field?.value;

  if (compact) {
    return (
      <div className="feed__item">
        <span className="actor actor--ia actor--sm" aria-hidden="true">
          {config.icon}
        </span>
        <div className="feed__body">
          <p className="label">{config.label}</p>
          <p className={cn('feed__text', !hasValue && 'muted')}>
            {hasValue ? field.value : 'Não identificado'}
          </p>
        </div>
        {hasValue ? (
          <span className={confidenceBadgeClass(field.confidence)}>
            {Math.round(field.confidence * 100)}%
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card-deal" style={{ borderLeftColor: 'var(--stage-proposta)' }}>
      <div className="card-deal__head">
        <h4 className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ color: 'var(--purple-600)' }}>
            {config.icon}
          </span>
          {config.label}
        </h4>
        {hasValue ? (
          <span className={confidenceBadgeClass(field.confidence)}>
            {Math.round(field.confidence * 100)}%
          </span>
        ) : null}
      </div>
      <p className={cn('card-deal__contact-name', !hasValue && 'muted')}>
        {hasValue ? field.value : 'Não identificado ainda'}
      </p>
      {hasValue && field.reasoning ? (
        <p className="meta line-clamp-1">{field.reasoning}</p>
      ) : null}
    </div>
  );
}

export function AIExtractedFields({ data, className, compact }: AIExtractedFieldsProps) {
  const hasAnyData = data && FIELD_CONFIG.some((c) => data[c.key]?.value);

  if (!hasAnyData) {
    return (
      <div className={cn('state-empty', className)}>
        <HelpCircle className="w-5 h-5" style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
        <p className="state-empty__text">
          As informações serão extraídas automaticamente das conversas.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn('feed', className)}>
        {FIELD_CONFIG.map((config) => (
          <FieldItem
            key={config.key}
            config={config}
            field={data?.[config.key]}
            compact
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="col-head__top" style={{ marginBottom: 'var(--space-2)' }}>
        <Sparkles className="w-4 h-4" style={{ color: 'var(--purple-600)' }} aria-hidden="true" />
        <h4 className="label" style={{ flex: 1 }}>
          extraído pela IA
        </h4>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FIELD_CONFIG.map((config) => (
          <FieldItem
            key={config.key}
            config={config}
            field={data?.[config.key]}
          />
        ))}
      </div>
      {data?.lastExtractedAt && (
        <p className="meta" style={{ marginTop: 'var(--space-2)', textAlign: 'right' }}>
          Atualizado em {new Date(data.lastExtractedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}
