import React, { useMemo } from 'react';
import { Activity, Deal, Contact, Company } from '@/types';
import { ActivityRow } from './ActivityRow';
import { dataLocalISO } from '@/lib/utils/dataLocal';

interface ActivitiesListProps {
    activities: Activity[];
    deals: Deal[];
    contacts: Contact[];
    companies: Company[];
    onToggleComplete: (id: string) => void;
    onEdit: (activity: Activity) => void;
    onDelete: (id: string) => void;
    selectedActivities?: Set<string>;
    onSelectActivity?: (id: string, selected: boolean) => void;
    onAddActivity?: () => void;
}

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

/** Chave/label do grupo de dia ("hoje", "ontem" ou data formatada). */
function dayGroupKey(dateString: string, now: Date): { key: string; label: string } {
    const date = new Date(dateString);
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

    const key = dataLocalISO(dateDay);
    if (diffDays === 0) return { key, label: 'hoje' };
    if (diffDays === 1) return { key, label: 'ontem' };
    return { key, label: DAY_LABEL_FORMATTER.format(date) };
}

/**
 * Timeline agrupada por dia (`.timeline__group` / `.timeline__day` sticky, redesign 2026-08
 * — ver `atividades.html`). Substitui a lista de cards antiga preservando toda a lógica
 * (completar/editar/excluir/selecionar) — só o markup mudou.
 */
export const ActivitiesList: React.FC<ActivitiesListProps> = ({
    activities,
    deals,
    contacts,
    companies,
    onToggleComplete,
    onEdit,
    onDelete,
    selectedActivities = new Set(),
    onSelectActivity,
    onAddActivity,
}) => {
    // Performance: Activities pode ser uma lista grande; evitamos `find` por linha (O(N*M)).
    const dealById = useMemo(() => {
        const map = new Map<string, Deal>();
        for (const d of deals) map.set(d.id, d);
        return map;
    }, [deals]);

    const contactById = useMemo(() => {
        const map = new Map<string, Contact>();
        for (const c of contacts) map.set(c.id, c);
        return map;
    }, [contacts]);

    const companyById = useMemo(() => {
        const map = new Map<string, Company>();
        for (const c of companies) map.set(c.id, c);
        return map;
    }, [companies]);

    const now = useMemo(() => new Date(), []);

    const groups = useMemo(() => {
        const map = new Map<string, { label: string; items: Activity[] }>();
        for (const activity of activities) {
            const { key, label } = dayGroupKey(activity.date, now);
            const group = map.get(key);
            if (group) group.items.push(activity);
            else map.set(key, { label, items: [activity] });
        }
        // Dentro de cada dia, mais recente primeiro (a lista global vem em ordem
        // crescente do controller, útil pra visão calendário — aqui invertemos só
        // a exibição da timeline, sem alterar a ordenação compartilhada).
        for (const group of map.values()) {
            group.items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
        }
        return Array.from(map.entries())
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([key, group]) => ({ key, ...group }));
    }, [activities, now]);

    if (activities.length === 0) {
        return (
            <div className="state-empty">
                <h3 className="state-empty__title">nenhuma atividade encontrada</h3>
                <p className="state-empty__text">tente ajustar os filtros ou crie uma atividade pra começar a acompanhar seu trabalho.</p>
                {onAddActivity && (
                    <p className="state-empty__actions">
                        <button type="button" className="btn btn--primary" onClick={onAddActivity}>nova atividade</button>
                    </p>
                )}
            </div>
        );
    }

    return (
        <>
            {groups.map(group => (
                <section className="timeline__group" key={group.key}>
                    <h2 className="timeline__day">{group.label}</h2>
                    <ul className="timeline panel panel--flush">
                        {group.items.map(activity => (
                            <ActivityRow
                                key={activity.id}
                                activity={activity}
                                deal={activity.dealId ? dealById.get(activity.dealId) : undefined}
                                contact={activity.contactId ? contactById.get(activity.contactId) : undefined}
                                company={activity.clientCompanyId ? companyById.get(activity.clientCompanyId) : undefined}
                                onToggleComplete={onToggleComplete}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                isSelected={selectedActivities.has(activity.id)}
                                onSelect={onSelectActivity}
                            />
                        ))}
                    </ul>
                </section>
            ))}
        </>
    );
};
