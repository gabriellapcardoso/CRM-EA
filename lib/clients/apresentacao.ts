/**
 * Formatação compartilhada da carteira — tabela, cartões e kanban.
 *
 * Extraído do `ClientsList` na F3, quando a grade de cartões e o kanban viraram
 * o segundo e o terceiro consumidor. Duplicar a leitura de data aqui seria
 * especialmente caro: ela tem uma armadilha de fuso embutida, e a terceira cópia
 * é onde alguém "simplifica" para `new Date(iso)` e reintroduz o bug.
 */

import type { ClientView } from '@/types/clients';

export const MOEDA = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
});

export type EstadoDaRenovacao = 'vazio' | 'atrasada' | 'proxima' | 'ok';

/**
 * Data de renovação por extenso, com o estado.
 *
 * A data vem do banco como `YYYY-MM-DD` e é formatada por CORTE DE STRING, não
 * por `new Date(iso)`: o construtor lê data pura como UTC meia-noite e, em
 * GMT-3, mostra o dia anterior. A comparação também é entre strings ISO, que
 * ordenam igual à data.
 */
export function renovacao(
    dataISO: string | undefined,
    hoje: string,
    limite30: string,
): { texto: string; estado: EstadoDaRenovacao } {
    if (!dataISO) return { texto: '—', estado: 'vazio' };
    const [ano, mes, dia] = dataISO.split('-');
    const texto = `${dia}/${mes}/${ano}`;
    if (dataISO < hoje) return { texto, estado: 'atrasada' };
    if (dataISO <= limite30) return { texto, estado: 'proxima' };
    return { texto, estado: 'ok' };
}

/**
 * MRR do cliente, ou o texto de ausência.
 *
 * "Sem contrato" e "R$ 0" são coisas diferentes: a primeira é cadastro
 * incompleto, a segunda é um contrato de valor zero. A carteira soma as duas
 * como zero, mas a tela não pode confundi-las.
 */
export function mrrDoCliente(c: ClientView): string | null {
    return c.activeContract ? MOEDA.format(c.activeContract.monthlyValue) : null;
}
