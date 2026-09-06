import type { Activity } from '@/types';
import type { ClientEvent, ClientTimelineItem } from '@/types/clients';

/**
 * Monta a linha do tempo do cliente.
 *
 * **A timeline é derivada, e a derivação é por join — nunca por
 * `activities.client_company_id`.** Essa coluna existe e está preenchida em
 * ZERO das 78 atividades da base, embora 40 delas sejam deriváveis pelo deal ou
 * pelo contato (medido em 2026-09-06). Ela só é escrita quando alguém cria uma
 * atividade pela tela de Atividades com um deal ou contato que já tem empresa;
 * linha histórica e linha criada por webhook nunca receberam valor. Filtrar por
 * ela devolveria uma timeline vazia para todo cliente, para sempre, sem erro
 * nenhum na tela. Guarda: `test/clientesTimeline.test.ts`.
 *
 * `deal_stage_events` também fica de fora, ao contrário do que o plano dizia:
 * é o outbox dos webhooks, tem linha só para os slugs que disparam integração
 * (`perdido`, `proposta-pronta`, `topou-proposta`) e mostraria um recorte
 * enviesado do histórico. A mudança de estágio já chega aqui como atividade do
 * tipo `STATUS_CHANGE`.
 */
export function montarTimeline({
    atividades,
    marcos,
    idsDeDeal,
    idsDeContato,
}: {
    atividades: Activity[];
    marcos: ClientEvent[];
    idsDeDeal: Set<string>;
    idsDeContato: Set<string>;
}): ClientTimelineItem[] {
    const daEmpresa = atividades.filter(
        a =>
            (a.dealId && idsDeDeal.has(a.dealId)) ||
            (a.contactId && idsDeContato.has(a.contactId)),
    );

    const itens: ClientTimelineItem[] = [
        ...daEmpresa.map(a => ({
            id: `atividade:${a.id}`,
            origem: 'atividade' as const,
            ocorridoEm: a.date,
            titulo: a.title,
            detalhe: a.description || undefined,
            tipo: a.type,
            deal: a.dealTitle || undefined,
            autor: a.user?.name || undefined,
        })),
        ...marcos.map(m => ({
            id: `marco:${m.id}`,
            origem: 'marco' as const,
            ocorridoEm: m.occurredAt,
            titulo: m.title,
            detalhe: m.body || undefined,
        })),
    ];

    // Mais recente primeiro. Empate desfeito pelo id, senão a ordem varia entre
    // renders e a lista "pula" sem nada ter mudado.
    return itens.sort((a, b) => {
        const diferenca = new Date(b.ocorridoEm).getTime() - new Date(a.ocorridoEm).getTime();
        return diferenca !== 0 ? diferenca : a.id.localeCompare(b.id);
    });
}

const ROTULO_DE_TIPO: Record<string, string> = {
    CALL: 'Ligação',
    MEETING: 'Reunião',
    EMAIL: 'E-mail',
    TASK: 'Tarefa',
    NOTE: 'Nota',
    STATUS_CHANGE: 'Mudança de Estágio',
};

export function rotuloDoItem(item: ClientTimelineItem): string {
    if (item.origem === 'marco') return 'Marco';
    return (item.tipo && ROTULO_DE_TIPO[item.tipo]) || 'Atividade';
}
