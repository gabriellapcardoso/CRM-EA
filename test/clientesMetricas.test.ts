/**
 * Os quatro indicadores da carteira, e o quinto número que impede os outros
 * de mentir por omissão.
 *
 * Cliente sem contrato entra como zero em toda soma — é o estado real de quem
 * foi cadastrado e ainda não teve o comercial preenchido. O que seria erro é o
 * painel mostrar um MRR menor sem dizer por quê, então `semContrato` sai junto.
 */
import { describe, expect, it } from 'vitest';
import { calcularMetricas, mesesDecorridos, estaNaCarteira, somarDias } from '@/lib/clients/metricas';
import type { ClientView, ClientContract } from '@/types/clients';

const HOJE = '2026-09-05';

function contrato(over: Partial<ClientContract> = {}): ClientContract {
    return {
        id: 'c1',
        companyId: 'e1',
        monthlyValue: 1000,
        startsAt: '2026-03-05',
        status: 'vigente',
        scope: [],
        createdAt: '2026-03-05T00:00:00Z',
        ...over,
    };
}

function cliente(over: Partial<ClientView> = {}): ClientView {
    return {
        id: 'e1',
        name: 'Cliente',
        isClient: true,
        healthSource: 'manual',
        createdAt: '2026-01-01T00:00:00Z',
        ...over,
    };
}

describe('mesesDecorridos', () => {
    it('conta meses inteiros e não meses começados', () => {
        expect(mesesDecorridos('2026-03-05', '2026-09-05')).toBe(6);
        expect(mesesDecorridos('2026-03-06', '2026-09-05')).toBe(5);
        expect(mesesDecorridos('2025-09-05', '2026-09-05')).toBe(12);
    });

    it('nunca é negativo — contrato com início no futuro vale zero mês', () => {
        expect(mesesDecorridos('2026-12-01', HOJE)).toBe(0);
    });
});

describe('estaNaCarteira', () => {
    it('exclui quem não é cliente e quem deu churn', () => {
        expect(estaNaCarteira(cliente())).toBe(true);
        expect(estaNaCarteira(cliente({ isClient: false }))).toBe(false);
        expect(estaNaCarteira(cliente({ lifecycleStage: 'churn' }))).toBe(false);
    });
});

describe('calcularMetricas', () => {
    it('soma o MRR só dos contratos vigentes de quem está na carteira', () => {
        const m = calcularMetricas(
            [
                cliente({ id: 'a', activeContract: contrato({ monthlyValue: 1000 }) }),
                cliente({ id: 'b', activeContract: contrato({ monthlyValue: 2500 }) }),
                cliente({ id: 'c', lifecycleStage: 'churn', activeContract: contrato({ monthlyValue: 9999 }) }),
                cliente({ id: 'd', isClient: false, activeContract: contrato({ monthlyValue: 8888 }) }),
            ],
            HOJE,
        );
        expect(m.receitaMensal).toBe(3500);
        expect(m.clientesAtivos).toBe(2);
    });

    it('conta quem está sem contrato em vez de deixar o zero passar por resultado', () => {
        const m = calcularMetricas(
            [
                cliente({ id: 'a', activeContract: contrato({ monthlyValue: 1000 }) }),
                cliente({ id: 'b' }),
                cliente({ id: 'c' }),
            ],
            HOJE,
        );
        expect(m.receitaMensal).toBe(1000);
        expect(m.clientesAtivos).toBe(3);
        expect(m.semContrato).toBe(2);
    });

    it('tira o LTV médio só de quem tem contrato — sem contrato não é LTV zero', () => {
        const m = calcularMetricas(
            [
                // 6 meses × 1000 = 6000
                cliente({ id: 'a', activeContract: contrato({ monthlyValue: 1000, startsAt: '2026-03-05' }) }),
                cliente({ id: 'b' }),
            ],
            HOJE,
        );
        // Se o cliente sem contrato entrasse na média, ela cairia pra 3000 e o
        // LTV da carteira pareceria metade do que é.
        expect(m.ltvMedio).toBe(6000);
    });

    it('conta renovação nos próximos 90 dias, e deixa a atrasada de fora', () => {
        const m = calcularMetricas(
            [
                cliente({ id: 'a', activeContract: contrato({ renewalDate: '2026-10-01' }) }),
                cliente({ id: 'b', activeContract: contrato({ renewalDate: '2026-12-04' }) }),
                // 91 dias: fora da janela
                cliente({ id: 'c', activeContract: contrato({ renewalDate: '2026-12-06' }) }),
                // Já venceu: tem filtro próprio na listagem. Somar aqui
                // esconderia o vencido dentro do "vence em breve".
                cliente({ id: 'd', activeContract: contrato({ renewalDate: '2026-08-01' }) }),
                cliente({ id: 'e', activeContract: contrato({ renewalDate: undefined }) }),
            ],
            HOJE,
        );
        expect(m.alertasRenovacao).toBe(2);
    });

    // Prova que a janela sai do PARÂMETRO e não do relógio: com `hoje` fixado
    // um ano à frente, as mesmas datas de renovação saem todas da janela. Sem
    // isso, o teste acima passaria só enquanto a data real coincidisse com a
    // fixada — verde hoje, vermelho amanhã, sem código nenhum ter mudado.
    it('respeita o hoje recebido em vez do relógio da máquina', () => {
        const clientes = [
            cliente({ id: 'a', activeContract: contrato({ renewalDate: '2026-10-01' }) }),
            cliente({ id: 'b', activeContract: contrato({ renewalDate: '2026-12-04' }) }),
        ];
        expect(calcularMetricas(clientes, HOJE).alertasRenovacao).toBe(2);
        expect(calcularMetricas(clientes, '2027-09-05').alertasRenovacao).toBe(0);
        // De 2026-07-05 a janela vai até 2026-10-03: pega a de outubro, não a de dezembro.
        expect(calcularMetricas(clientes, '2026-07-05').alertasRenovacao).toBe(1);
        // De 2026-06-01 a janela fecha em 2026-08-30: nenhuma das duas entra.
        expect(calcularMetricas(clientes, '2026-06-01').alertasRenovacao).toBe(0);
    });

    it('carteira vazia devolve zeros, não NaN', () => {
        const m = calcularMetricas([], HOJE);
        expect(m).toEqual({
            receitaMensal: 0,
            clientesAtivos: 0,
            ltvMedio: 0,
            alertasRenovacao: 0,
            semContrato: 0,
        });
    });
});

describe('somarDias', () => {
    it('soma sem escorregar de dia por causa de fuso', () => {
        expect(somarDias('2026-09-05', 90)).toBe('2026-12-04');
        expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
        // Ano bissexto
        expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    });
});
