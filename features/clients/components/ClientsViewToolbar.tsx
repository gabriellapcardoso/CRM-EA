'use client';

import React from 'react';
import { LayoutGrid, Table2, Columns3 } from 'lucide-react';
import { ESTAGIOS_DO_CICLO, CATEGORIAS } from '@/lib/clients/vocabulario';
import { FAIXAS_DE_SAUDE } from '@/lib/clients/health';
import type { ClientsFilters, ClientsSort } from '@/types/clients';

export const VISTAS = ['tabela', 'cartoes', 'kanban'] as const;
export type VistaDaCarteira = (typeof VISTAS)[number];

export function ehVistaValida(v: string | null): v is VistaDaCarteira {
    return VISTAS.includes(v as VistaDaCarteira);
}

const ORDENS: ReadonlyArray<{ value: ClientsSort; label: string }> = [
    { value: 'nome', label: 'Nome (A–Z)' },
    { value: 'mrr', label: 'MRR (maior primeiro)' },
    { value: 'saude', label: 'Saúde (pior primeiro)' },
    { value: 'renovacao', label: 'Renovação (mais próxima)' },
];

const JANELAS: ReadonlyArray<{ value: NonNullable<ClientsFilters['renewal']>; label: string }> = [
    { value: 'todos', label: 'Todas' },
    { value: 'atrasada', label: 'Atrasada' },
    { value: 'proximos_30', label: 'Próximos 30 dias' },
    { value: 'proximos_60', label: 'Próximos 60 dias' },
];

interface Props {
    vista: VistaDaCarteira;
    onVista: (v: VistaDaCarteira) => void;
    filtros: ClientsFilters;
    onFiltros: (f: ClientsFilters) => void;
    ordem: ClientsSort;
    onOrdem: (o: ClientsSort) => void;
    /** Quantos a página trouxe e quantos sobraram depois dos filtros. */
    total: number;
    visiveis: number;
}

/**
 * Vistas, filtros combináveis e ordenação da carteira.
 *
 * Os filtros são aplicados sobre a PÁGINA carregada (decisão da F1, ver
 * `lib/clients/filtros.ts`), e a barra diz isso quando algum está ativo: um
 * contador que some de 25 para 3 sem explicar por quê parece perda de dado.
 *
 * A ordenação não aparece no kanban porque lá a posição já significa outra
 * coisa — o estágio. Oferecer um controle que não muda nada na vista aberta é
 * pior do que não oferecer.
 */
export const ClientsViewToolbar: React.FC<Props> = ({
    vista,
    onVista,
    filtros,
    onFiltros,
    ordem,
    onOrdem,
    total,
    visiveis,
}) => {
    const set = (parcial: Partial<ClientsFilters>) => onFiltros({ ...filtros, ...parcial });
    const filtrando = visiveis !== total;

    return (
        <div className="client-toolbar">
            <div className="client-toolbar__grupo">
                <span className="client-toolbar__rotulo">Estágio</span>
                <select
                    className="input"
                    value={filtros.stage ?? 'todos'}
                    onChange={e => set({ stage: e.target.value as ClientsFilters['stage'] })}
                    aria-label="Filtrar por estágio do ciclo de vida"
                >
                    <option value="todos">Todos</option>
                    {ESTAGIOS_DO_CICLO.map(e => (
                        <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                </select>
            </div>

            <div className="client-toolbar__grupo">
                <span className="client-toolbar__rotulo">Categoria</span>
                <select
                    className="input"
                    value={filtros.category ?? 'todos'}
                    onChange={e => set({ category: e.target.value as ClientsFilters['category'] })}
                    aria-label="Filtrar por categoria"
                >
                    <option value="todos">Todas</option>
                    {CATEGORIAS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
            </div>

            <div className="client-toolbar__grupo">
                <span className="client-toolbar__rotulo">Saúde</span>
                <select
                    className="input"
                    value={filtros.band ?? 'todos'}
                    onChange={e => set({ band: e.target.value as ClientsFilters['band'] })}
                    aria-label="Filtrar por faixa de saúde"
                >
                    <option value="todos">Todas</option>
                    {FAIXAS_DE_SAUDE.map(f => (
                        <option key={f.band} value={f.band}>{f.label}</option>
                    ))}
                </select>
            </div>

            <div className="client-toolbar__grupo">
                <span className="client-toolbar__rotulo">Renovação</span>
                <select
                    className="input"
                    value={filtros.renewal ?? 'todos'}
                    onChange={e => set({ renewal: e.target.value as ClientsFilters['renewal'] })}
                    aria-label="Filtrar por janela de renovação"
                >
                    {JANELAS.map(j => (
                        <option key={j.value} value={j.value}>{j.label}</option>
                    ))}
                </select>
            </div>

            {vista !== 'kanban' && (
                <div className="client-toolbar__grupo">
                    <span className="client-toolbar__rotulo">Ordenar por</span>
                    <select
                        className="input"
                        value={ordem}
                        onChange={e => onOrdem(e.target.value as ClientsSort)}
                        aria-label="Ordenar a carteira"
                    >
                        {ORDENS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="client-toolbar__acoes" role="group" aria-label="Vista da carteira">
                {([
                    ['tabela', Table2, 'Tabela'],
                    ['cartoes', LayoutGrid, 'Cartões'],
                    ['kanban', Columns3, 'Kanban'],
                ] as const).map(([id, Icone, titulo]) => (
                    <button
                        key={id}
                        type="button"
                        className={`chip${vista === id ? ' chip--active' : ''}`}
                        aria-pressed={vista === id}
                        onClick={() => onVista(id)}
                        title={`Ver como ${titulo.toLowerCase()}`}
                    >
                        <Icone size={14} aria-hidden /> {titulo}
                    </button>
                ))}
            </div>

            {filtrando && (
                <p className="meta" style={{ flexBasis: '100%' }}>
                    Mostrando {visiveis} de {total} cliente{total === 1 ? '' : 's'} desta página. Os
                    filtros valem sobre a página carregada, não sobre a carteira inteira.
                </p>
            )}
        </div>
    );
};
