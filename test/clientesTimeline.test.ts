/**
 * Timeline do cliente: derivada por join, nunca pela coluna.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarTimeline, rotuloDoItem } from '@/lib/clients/timeline';
import type { Activity } from '@/types';
import type { ClientEvent } from '@/types/clients';

function atividade(over: Partial<Activity> = {}): Activity {
    return {
        id: 'a1',
        dealId: 'd1',
        dealTitle: 'Deal X',
        type: 'NOTE',
        title: 'Anotação',
        date: '2026-05-01T10:00:00Z',
        user: { name: 'Gabriella', avatar: '' },
        completed: false,
        ...over,
    } as Activity;
}

function marco(over: Partial<ClientEvent> = {}): ClientEvent {
    return {
        id: 'm1',
        companyId: 'e1',
        title: 'Kickoff realizado',
        occurredAt: '2026-06-01T10:00:00Z',
        createdAt: '2026-06-01T10:00:00Z',
        ...over,
    };
}

describe('montarTimeline', () => {
    it('pega atividade pelo deal e pelo contato da empresa', () => {
        const itens = montarTimeline({
            atividades: [
                atividade({ id: 'pelo-deal', dealId: 'd1' }),
                atividade({ id: 'pelo-contato', dealId: 'outro', contactId: 'c1' }),
                atividade({ id: 'de-fora', dealId: 'outro', contactId: 'outro' }),
            ],
            marcos: [],
            idsDeDeal: new Set(['d1']),
            idsDeContato: new Set(['c1']),
        });
        expect(itens.map(i => i.id)).toEqual(
            expect.arrayContaining(['atividade:pelo-deal', 'atividade:pelo-contato']),
        );
        expect(itens).toHaveLength(2);
    });

    it('mistura marcos com atividades, mais recente primeiro', () => {
        const itens = montarTimeline({
            atividades: [
                atividade({ id: 'velha', date: '2026-01-01T00:00:00Z' }),
                atividade({ id: 'nova', date: '2026-08-01T00:00:00Z' }),
            ],
            marcos: [marco({ id: 'meio', occurredAt: '2026-04-01T00:00:00Z' })],
            idsDeDeal: new Set(['d1']),
            idsDeContato: new Set(),
        });
        expect(itens.map(i => i.id)).toEqual([
            'atividade:nova',
            'marco:meio',
            'atividade:velha',
        ]);
    });

    // Sem desempate, dois itens da mesma data trocam de lugar entre renders e a
    // lista "pula" sem nada ter mudado.
    it('desempata por id, então a ordem é estável', () => {
        const entrada = {
            atividades: [
                atividade({ id: 'zzz', date: '2026-05-01T00:00:00Z' }),
                atividade({ id: 'aaa', date: '2026-05-01T00:00:00Z' }),
            ],
            marcos: [],
            idsDeDeal: new Set(['d1']),
            idsDeContato: new Set<string>(),
        };
        const uma = montarTimeline(entrada).map(i => i.id);
        const outra = montarTimeline(entrada).map(i => i.id);
        expect(uma).toEqual(outra);
        expect(uma).toEqual(['atividade:aaa', 'atividade:zzz']);
    });

    it('empresa sem nada devolve lista vazia, não quebra', () => {
        expect(
            montarTimeline({
                atividades: [],
                marcos: [],
                idsDeDeal: new Set(),
                idsDeContato: new Set(),
            }),
        ).toEqual([]);
    });

    it('rotula por origem e por tipo', () => {
        const [item] = montarTimeline({
            atividades: [atividade({ type: 'STATUS_CHANGE' })],
            marcos: [],
            idsDeDeal: new Set(['d1']),
            idsDeContato: new Set(),
        });
        expect(rotuloDoItem(item)).toBe('Mudança de Estágio');
        const [m] = montarTimeline({
            atividades: [],
            marcos: [marco()],
            idsDeDeal: new Set(),
            idsDeContato: new Set(),
        });
        expect(rotuloDoItem(m)).toBe('Marco');
    });
});

describe('a derivação não pode virar filtro de coluna', () => {
    /**
     * `activities.client_company_id` existe e está preenchida em ZERO das 78
     * atividades da base, embora 40 sejam deriváveis (medido em 2026-09-06).
     * Trocar o join por um filtro nessa coluna deixaria a timeline vazia para
     * todo cliente, para sempre, sem erro nenhum na tela — o tipo de mudança
     * que passa em revisão por parecer uma simplificação óbvia.
     */
    const FONTE = readFileSync(join(process.cwd(), 'lib/clients/timeline.ts'), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/^\s*\/\/.*$/, ''))
        .join('\n');

    it('não lê clientCompanyId da atividade', () => {
        expect(FONTE).not.toContain('clientCompanyId');
        expect(FONTE).not.toContain('client_company_id');
    });

    it('filtra por dealId e contactId', () => {
        expect(FONTE).toContain('idsDeDeal.has');
        expect(FONTE).toContain('idsDeContato.has');
    });
});
