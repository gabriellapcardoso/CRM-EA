/**
 * Filtros combináveis e ordenação da carteira (F3).
 *
 * A carteira em produção tem ZERO clientes (medido em 2026-09-07), e todas as
 * dimensões que a F3 desenha — ciclo de vida, categoria, nicho, saúde,
 * contrato — estão vazias. A tela não consegue provar nada sobre esta lógica,
 * então a prova é aqui.
 */
import { describe, expect, it } from 'vitest';
import { aplicarFiltros, ordenarClientes } from '@/lib/clients/filtros';
import type { ClientView } from '@/types/clients';

const HOJE = '2026-09-07';

function cliente(over: Partial<ClientView> & { name: string }): ClientView {
    return {
        id: over.name.toLowerCase(),
        name: over.name,
        isClient: true,
        healthSource: 'manual',
        createdAt: '2026-01-01T00:00:00Z',
        ...over,
    };
}

function comContrato(monthlyValue: number, renewalDate?: string): ClientView['activeContract'] {
    return {
        id: 'c1',
        companyId: 'e1',
        monthlyValue,
        startsAt: '2026-01-01',
        renewalDate,
        status: 'vigente',
        organizationId: 'o1',
        createdAt: '2026-01-01T00:00:00Z',
    } as ClientView['activeContract'];
}

describe('aplicarFiltros', () => {
    const carteira = [
        cliente({ name: 'Alfa', lifecycleStage: 'em_operacao', category: 'ouro', healthScore: 90 }),
        cliente({ name: 'Beta', lifecycleStage: 'kickoff', category: 'prata', healthScore: 45 }),
        cliente({ name: 'Gama', lifecycleStage: 'em_operacao', category: 'bronze' }),
    ];

    it('sem filtros devolve tudo', () => {
        expect(aplicarFiltros(carteira, undefined, HOJE)).toHaveLength(3);
        expect(aplicarFiltros(carteira, {}, HOJE)).toHaveLength(3);
    });

    it("'todos' não filtra nada", () => {
        const r = aplicarFiltros(carteira, { stage: 'todos', category: 'todos', band: 'todos' }, HOJE);
        expect(r).toHaveLength(3);
    });

    it('filtra por estágio do ciclo de vida', () => {
        const r = aplicarFiltros(carteira, { stage: 'em_operacao' }, HOJE);
        expect(r.map(c => c.name)).toEqual(['Alfa', 'Gama']);
    });

    it('os filtros se combinam — é a promessa da fase', () => {
        // Estágio E categoria ao mesmo tempo: Gama também é em_operacao, mas é
        // bronze. Um filtro que ignorasse o outro devolveria dois.
        const r = aplicarFiltros(carteira, { stage: 'em_operacao', category: 'ouro' }, HOJE);
        expect(r.map(c => c.name)).toEqual(['Alfa']);
    });

    it('cliente sem pontuação não cai em nenhuma faixa de saúde', () => {
        // Sem avaliação é estado legítimo e NÃO é churn. Classificá-lo como
        // detrator ou churn marcaria cliente novo como perdido.
        expect(aplicarFiltros(carteira, { band: 'promotor' }, HOJE).map(c => c.name)).toEqual(['Alfa']);
        expect(aplicarFiltros(carteira, { band: 'neutro' }, HOJE).map(c => c.name)).toEqual(['Beta']);
        expect(aplicarFiltros(carteira, { band: 'churn' }, HOJE)).toHaveLength(0);
    });

    describe('janelas de renovação', () => {
        const comDatas = [
            cliente({ name: 'Vencida', activeContract: comContrato(100, '2026-09-01') }),
            cliente({ name: 'Em10', activeContract: comContrato(100, '2026-09-17') }),
            cliente({ name: 'Em45', activeContract: comContrato(100, '2026-10-22') }),
            cliente({ name: 'SemData', activeContract: comContrato(100) }),
            cliente({ name: 'SemContrato' }),
        ];

        it('atrasada pega só o que já venceu', () => {
            expect(aplicarFiltros(comDatas, { renewal: 'atrasada' }, HOJE).map(c => c.name))
                .toEqual(['Vencida']);
        });

        it('próximos 30 não inclui o que venceu nem o que passa de 30', () => {
            expect(aplicarFiltros(comDatas, { renewal: 'proximos_30' }, HOJE).map(c => c.name))
                .toEqual(['Em10']);
        });

        it('próximos 60 inclui o de 45 dias', () => {
            expect(aplicarFiltros(comDatas, { renewal: 'proximos_60' }, HOJE).map(c => c.name))
                .toEqual(['Em10', 'Em45']);
        });

        it('sem data de renovação fica fora de TODAS as janelas', () => {
            // Ausência de informação não é "não vence nos próximos 30 dias".
            for (const janela of ['atrasada', 'proximos_30', 'proximos_60'] as const) {
                const nomes = aplicarFiltros(comDatas, { renewal: janela }, HOJE).map(c => c.name);
                expect(nomes, `janela ${janela}`).not.toContain('SemData');
                expect(nomes, `janela ${janela}`).not.toContain('SemContrato');
            }
        });

        it('a janela é medida a partir do `hoje` recebido, não do relógio', () => {
            // Mesma lista, outro `hoje`: o que estava a 10 dias passa a estar
            // vencido. Uma função que lesse `new Date()` por dentro devolveria
            // o mesmo nos dois casos e passaria só enquanto a data real
            // coincidisse com a fixada.
            const depois = aplicarFiltros(comDatas, { renewal: 'atrasada' }, '2026-09-20');
            expect(depois.map(c => c.name)).toEqual(['Vencida', 'Em10']);
        });
    });
});

describe('ordenarClientes', () => {
    const carteira = [
        cliente({ name: 'Gama', healthScore: 30, activeContract: comContrato(500, '2026-12-01') }),
        cliente({ name: 'Alfa', healthScore: 90, activeContract: comContrato(1500, '2026-10-01') }),
        cliente({ name: 'Beta', activeContract: comContrato(800) }),
    ];

    it('nome usa ordem do português', () => {
        expect(ordenarClientes(carteira, 'nome').map(c => c.name)).toEqual(['Alfa', 'Beta', 'Gama']);
    });

    it('MRR vem do maior pro menor', () => {
        expect(ordenarClientes(carteira, 'mrr').map(c => c.name)).toEqual(['Alfa', 'Beta', 'Gama']);
    });

    it('saúde vem do pior pro melhor, e sem avaliação vai pro fim', () => {
        // A lista por saúde serve pra achar quem está mal. Cliente sem nota no
        // topo faria a tela sugerir problema onde só falta avaliação.
        expect(ordenarClientes(carteira, 'saude').map(c => c.name)).toEqual(['Gama', 'Alfa', 'Beta']);
    });

    it('renovação vem da mais próxima, e sem data vai pro fim', () => {
        expect(ordenarClientes(carteira, 'renovacao').map(c => c.name)).toEqual(['Alfa', 'Gama', 'Beta']);
    });

    it('não muta o array recebido', () => {
        // `sort` ordena no lugar. Mutar o array que veio do cache do TanStack
        // Query muda a lista sob os pés de quem ainda lê aquela referência.
        const original = [...carteira];
        ordenarClientes(carteira, 'nome');
        expect(carteira.map(c => c.name)).toEqual(original.map(c => c.name));
    });
});
