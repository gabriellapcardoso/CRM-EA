'use client';

import React from 'react';
import { useDealsView, useActivities, useContacts } from '@/lib/query/hooks';
import { useClientEvents } from '@/lib/query/hooks/useClientsQuery';
import { montarTimeline } from '@/lib/clients/timeline';
import { estadoDaConsulta, type EstadoDaConsulta } from '@/lib/clients/estadoDaConsulta';
import type { ClientTimelineItem } from '@/types/clients';

interface Resultado {
    itens: ClientTimelineItem[];
    estado: EstadoDaConsulta;
    erro?: Error;
    /** Deals da empresa, que a Visão Geral também usa. */
    idsDeDeal: Set<string>;
    /**
     * As fontes param em 1000 linhas cada (`useActivities`, `useDealsView`,
     * `useContacts`). Numa base grande a timeline sai truncada sem avisar.
     * Registrado no `TODOS.md`; hoje a base está muito abaixo do teto.
     */
    podeEstarTruncada: boolean;
}

/**
 * Compõe a linha do tempo do cliente a partir das quatro fontes.
 *
 * A ligação atividade → empresa é por join (deal ou contato), **nunca** pela
 * coluna `activities.client_company_id` — ela existe e está vazia em toda a
 * base. Ver `lib/clients/timeline.ts`.
 */
export function useClientTimeline(companyId?: string): Resultado {
    const deals = useDealsView();
    const contatos = useContacts();
    const atividades = useActivities();
    const marcos = useClientEvents(companyId);

    const idsDeDeal = React.useMemo(
        () =>
            new Set(
                (deals.data ?? [])
                    .filter(d => d.clientCompanyId === companyId)
                    .map(d => d.id),
            ),
        [deals.data, companyId],
    );

    const idsDeContato = React.useMemo(
        () =>
            new Set(
                (contatos.data ?? [])
                    .filter(c => c.clientCompanyId === companyId)
                    .map(c => c.id),
            ),
        [contatos.data, companyId],
    );

    const itens = React.useMemo(
        () =>
            montarTimeline({
                atividades: atividades.data ?? [],
                marcos: marcos.data ?? [],
                idsDeDeal,
                idsDeContato,
            }),
        [atividades.data, marcos.data, idsDeDeal, idsDeContato],
    );

    const fontes = [deals, contatos, atividades, marcos];

    // Uma fonte que não respondeu torna a timeline incompleta, e incompleta não
    // pode aparecer como "não há nada". Só afirma vazio quando as quatro
    // responderam.
    const estado = estadoDaConsulta({
        isSuccess: fontes.every(f => f.isSuccess),
        isError: fontes.some(f => f.isError),
        isFetching: fontes.some(f => f.isFetching),
        temDados: fontes.every(f => !!f.data),
        quantidade: itens.length,
    });

    return {
        itens,
        estado,
        erro: fontes.find(f => f.isError)?.error as Error | undefined,
        idsDeDeal,
        podeEstarTruncada:
            (deals.data?.length ?? 0) >= 1000 ||
            (contatos.data?.length ?? 0) >= 1000 ||
            (atividades.data?.length ?? 0) >= 1000,
    };
}
