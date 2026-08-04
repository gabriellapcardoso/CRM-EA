import React from 'react';
import { PeriodFilter, PERIOD_LABELS } from '@/features/dashboard/hooks/useDashboardMetrics';

interface PeriodFilterSelectProps {
    value: PeriodFilter;
    onChange: (period: PeriodFilter) => void;
    className?: string;
    'aria-label'?: string;
}

/**
 * Componente de seleção de período compartilhado.
 * Usado em Dashboard, Reports e outras páginas que precisam filtrar por período.
 */
export const PeriodFilterSelect: React.FC<PeriodFilterSelectProps> = ({
    value,
    onChange,
    className = '',
    'aria-label': ariaLabel = 'Selecionar Período',
}) => {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value as PeriodFilter)}
            aria-label={ariaLabel}
            className={`input ${className}`}
            style={{ width: 'auto' }}
        >
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                    {label}
                </option>
            ))}
        </select>
    );
};

export default PeriodFilterSelect;
