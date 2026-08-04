import React from 'react';
import Link from 'next/link';
import { Trash2, Edit2, CheckCircle2, Building2, Users } from 'lucide-react';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
import { Activity, Deal, Contact, Company } from '@/types';

interface ActivityRowProps {
    activity: Activity;
    deal?: Deal;
    contact?: Contact;
    company?: Company;
    onToggleComplete: (id: string) => void;
    onEdit: (activity: Activity) => void;
    onDelete: (id: string) => void;
    isSelected?: boolean;
    onSelect?: (id: string, selected: boolean) => void;
}

/**
 * Item de timeline (`.timeline__item`, redesign 2026-08 — ver `atividades.html`).
 *
 * Performance: essa linha aparece em listas grandes (activities).
 * `React.memo` ajuda a evitar re-render de todas as linhas quando apenas seleção/1 item muda.
 */
const ActivityRowComponent: React.FC<ActivityRowProps> = ({
    activity,
    deal,
    contact,
    company,
    onToggleComplete,
    onEdit,
    onDelete,
    isSelected = false,
    onSelect
}) => {
    const { data: boards = [] } = useBoards();

    const translateStatus = (status: string) => {
        // Se não parece ser um UUID, retorna direto (já é um label legível)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(status)) {
            return status;
        }

        // Procura em TODOS os boards, não só no ativo
        for (const board of boards) {
            const stage = board.stages.find(s => s.id === status);
            if (stage) return stage.label;
        }

        // Fallback para mapeamento legado
        const map: Record<string, string> = {
            'NEW': 'Novas Oportunidades',
            'CONTACTED': 'Contatado',
            'PROPOSAL': 'Proposta',
            'NEGOTIATION': 'Negociação',
            'CLOSED_WON': 'Ganho',
            'CLOSED_LOST': 'Perdido',
            'LEAD': 'Lead',
            'MQL': 'Lead Qualificado',
            'PROSPECT': 'Oportunidade',
            'CUSTOMER': 'Cliente'
        };

        // Se ainda é UUID e não encontrou, mostra fallback amigável
        return map[status] || 'Estágio não identificado';
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    };

    const formatTitle = (title: string) => {
        if (title.includes('Moveu para')) {
            const status = title.replace('Moveu para ', '');
            return `movido para ${translateStatus(status)}`;
        }
        if (title === 'Negócio Criado') return 'negócio criado';
        return title;
    };

    // Não há campo real de "gerado por IA" no schema — STATUS_CHANGE é o único
    // tipo de atividade gerado automaticamente (webhook/trigger), o resto é humano.
    const isAutomated = activity.type === 'STATUS_CHANGE';
    const actorInitials = (activity.user?.name || 'Eu')
        .split(' ')
        .map(p => p.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase();
    const isOverdue = new Date(activity.date) < new Date() && !activity.completed;

    return (
        <li className={`timeline__item ${isOverdue ? 'timeline__item--pending' : ''}`}>
            {onSelect && (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(activity.id, e.target.checked)}
                    aria-label={`Selecionar ${activity.title}`}
                    style={{ flex: 'none' }}
                />
            )}
            <span className="timeline__time num">{formatTime(activity.date)}</span>
            <span className={`actor ${isAutomated ? 'actor--auto' : 'actor--humano'}`} aria-hidden="true">
                {isAutomated ? '⚡' : actorInitials}
            </span>
            <div className="timeline__body">
                <p className="timeline__text" style={{ textDecoration: activity.completed ? 'line-through' : undefined }}>
                    {formatTitle(activity.title)}
                    {!deal && contact && (
                        <>
                            {' · '}
                            <Link href={`/contacts?contactId=${contact.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Users size={11} /> {contact.name}
                            </Link>
                        </>
                    )}
                    {!deal && !contact && company && (
                        <>
                            {' · '}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Building2 size={11} /> {company.name}
                            </span>
                        </>
                    )}
                </p>
                <p className="timeline__meta">
                    {deal ? deal.title : null}
                    {isOverdue && (deal ? ' · atrasado' : 'atrasado')}
                </p>
            </div>
            {!isAutomated && (
                <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
                    <button
                        type="button"
                        onClick={() => onToggleComplete(activity.id)}
                        className="btn btn--ghost"
                        style={{ padding: '3px 6px' }}
                        title={activity.completed ? 'reabrir' : 'concluir'}
                        aria-label={activity.completed ? `Reabrir ${activity.title}` : `Concluir ${activity.title}`}
                    >
                        <CheckCircle2 size={13} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onEdit(activity)}
                        className="btn btn--ghost"
                        style={{ padding: '3px 6px' }}
                        title="editar"
                        aria-label={`Editar ${activity.title}`}
                    >
                        <Edit2 size={13} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(activity.id)}
                        className="btn btn--ghost"
                        style={{ padding: '3px 6px' }}
                        title="excluir"
                        aria-label={`Excluir ${activity.title}`}
                    >
                        <Trash2 size={13} aria-hidden="true" />
                    </button>
                </span>
            )}
        </li>
    );
};

export const ActivityRow = React.memo(ActivityRowComponent);
