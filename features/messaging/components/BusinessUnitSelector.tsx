'use client';

import React, { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { Building2, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBusinessUnits } from '@/lib/query/hooks/useBusinessUnitsQuery';
import type { BusinessUnit } from '@/lib/messaging/types';

interface BusinessUnitSelectorProps {
  selectedUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  showAllOption?: boolean;
  allLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const BusinessUnitSelector = memo(function BusinessUnitSelector({
  selectedUnitId,
  onSelect,
  showAllOption = true,
  allLabel = 'Todas as unidades',
  placeholder = 'Selecionar unidade',
  className,
  disabled = false,
}: BusinessUnitSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: units = [], isLoading } = useBusinessUnits();

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId),
    [units, selectedUnitId]
  );

  const handleSelect = (unitId: string | null) => {
    onSelect(unitId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    },
    [isOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'btn btn--ghost btn--block justify-between',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">
            {isLoading
              ? 'Carregando...'
              : selectedUnit
                ? selectedUnit.name
                : showAllOption && selectedUnitId === null
                  ? allLabel
                  : placeholder}
          </span>
        </div>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selectedUnitId && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar seleção"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          )}
          <ChevronDown
            className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Options */}
          <div
            role="listbox"
            className="panel absolute z-20 w-full mt-1 max-h-60 overflow-y-auto"
            style={{ padding: 'var(--space-2)', boxShadow: 'var(--shadow-lg)' }}
          >
            {showAllOption && (
              <button
                type="button"
                role="option"
                aria-selected={selectedUnitId === null}
                onClick={() => handleSelect(null)}
                className={cn('btn btn--quiet btn--block justify-between', selectedUnitId === null && 'chip--active')}
              >
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" aria-hidden="true" />
                  {allLabel}
                </span>
                {selectedUnitId === null && <Check className="w-4 h-4" aria-hidden="true" />}
              </button>
            )}

            {units.length === 0 && !isLoading && (
              <p className="meta" style={{ textAlign: 'center', padding: 'var(--space-3)' }}>
                nenhuma unidade encontrada
              </p>
            )}

            {units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                role="option"
                aria-selected={selectedUnitId === unit.id}
                onClick={() => handleSelect(unit.id)}
                className={cn('btn btn--quiet btn--block justify-between', selectedUnitId === unit.id && 'chip--active')}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{unit.name}</span>
                  {unit.key && <span className="meta">({unit.key})</span>}
                </span>
                {selectedUnitId === unit.id && <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default BusinessUnitSelector;
