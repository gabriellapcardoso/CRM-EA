import { hojeLocalISO } from '@/lib/utils/dataLocal';
import type { ClientView, ClientsMetrics } from '@/types/clients';

/** Meses inteiros entre duas datas ISO (`YYYY-MM-DD`). Nunca negativo. */
export function mesesDecorridos(inicioISO: string, hojeISO: string): number {
    const [ai, mi, di] = inicioISO.split('-').map(Number);
    const [ah, mh, dh] = hojeISO.split('-').map(Number);
    if (!ai || !ah) return 0;
    let meses = (ah - ai) * 12 + (mh - mi);
    if (dh < di) meses -= 1;
    return meses > 0 ? meses : 0;
}

/** Soma dias a uma data ISO (`YYYY-MM-DD`) e devolve outra data ISO. */
export function somarDias(iso: string, dias: number): string {
    const [ano, mes, dia] = iso.split('-').map(Number);
    // Meio-dia UTC: longe de qualquer borda de fuso, então somar dias nunca
    // escorrega pro dia anterior nem pro seguinte.
    const base = new Date(Date.UTC(ano, mes - 1, dia, 12));
    base.setUTCDate(base.getUTCDate() + dias);
    return base.toISOString().slice(0, 10);
}

/** O cliente conta na carteira: é cliente, não foi arquivado, não deu churn. */
export function estaNaCarteira(c: ClientView): boolean {
    return c.isClient && c.lifecycleStage !== 'churn';
}

/**
 * Os quatro indicadores do topo da tela, mais a contagem de quem não tem
 * contrato.
 *
 * Cliente sem contrato entra como zero em toda soma. Isso não é erro — é o
 * estado real de quem foi cadastrado e ainda não teve o comercial preenchido.
 * O que seria erro é o painel mostrar um MRR menor sem dizer por quê, então
 * `semContrato` sai junto e a tela mostra os dois. Vazio não é resultado.
 */
export function calcularMetricas(
    clientes: ClientView[],
    hoje: string = hojeLocalISO(),
): ClientsMetrics {
    const naCarteira = clientes.filter(estaNaCarteira);
    const comContrato = naCarteira.filter(c => c.activeContract);

    const receitaMensal = comContrato.reduce(
        (soma, c) => soma + (c.activeContract?.monthlyValue ?? 0),
        0,
    );

    const ltvs = comContrato.map(c => {
        const contrato = c.activeContract!;
        return contrato.monthlyValue * mesesDecorridos(contrato.startsAt, hoje);
    });
    const ltvMedio = ltvs.length ? ltvs.reduce((a, b) => a + b, 0) / ltvs.length : 0;

    // Janela de 90 dias a partir de `hoje` — o PARÂMETRO, não o relógio.
    // `dataLocalISOEmDias(90)` conta a partir de `new Date()`, e usar isso aqui
    // faria a função ignorar o `hoje` recebido: o teste passaria enquanto a
    // data real coincidisse com a fixada e quebraria amanhã, sem nada ter
    // mudado no código.
    const limite = somarDias(hoje, 90);
    const alertasRenovacao = comContrato.filter(c => {
        const r = c.activeContract?.renewalDate;
        return !!r && r >= hoje && r <= limite;
    }).length;

    return {
        receitaMensal,
        clientesAtivos: naCarteira.length,
        ltvMedio,
        alertasRenovacao,
        semContrato: naCarteira.length - comContrato.length,
    };
}
