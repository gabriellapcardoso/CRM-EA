/**
 * Filtros combináveis e ordenação da carteira (F3).
 *
 * **Client-side por decisão da F1, não por descuido.** `clientsService.listar()`
 * documenta: a busca por nome é server-side, o resto é aplicado sobre a página
 * carregada porque depende de faixa derivada (saúde) e de janela de data
 * relativa (renovação), e a carteira de uma agência cabe numa página. Vira
 * server-side quando passar de mil — e aí estas funções puras viram o teste de
 * paridade do que o SQL tiver que reproduzir.
 *
 * Funções puras de propósito: a carteira em produção está vazia (zero clientes
 * em 2026-09-07), então a tela não prova nada sobre esta lógica. Aqui o teste
 * prova.
 */

import type { ClientView, ClientsFilters, ClientsSort } from '@/types/clients';
import { faixaDeSaude } from './health';
import { diasAte } from './metricas';

// `filtros.status` NÃO é aplicado aqui, e isso é deliberado. "Arquivado"
// significa `is_client = false` (ver `estaNaCarteira` em `metricas.ts`), e a
// consulta da carteira filtra `is_client = true` no servidor: nenhum cliente
// arquivado chega a esta lista. Implementar o filtro devolveria lista vazia
// sempre, com cara de "não há" — o defeito que este módulo passou a fase
// inteira evitando. Mostrar arquivados exige mudar `listar()`; está no TODOS.

function passaNaFaixa(c: ClientView, band: ClientsFilters['band']): boolean {
    if (!band || band === 'todos') return true;
    // Sem pontuação é estado legítimo e NÃO é churn — `faixaDeSaude` devolve
    // null pra isso. Cliente sem avaliação some de qualquer filtro de faixa,
    // que é o correto: ele não pertence a nenhuma.
    return faixaDeSaude(c.healthScore) === band;
}

function passaNaRenovacao(
    c: ClientView,
    renewal: ClientsFilters['renewal'],
    hoje: string,
): boolean {
    if (!renewal || renewal === 'todos') return true;

    const data = c.activeContract?.renewalDate;
    // Sem data de renovação não é "não vence nos próximos 30 dias": é ausência
    // de informação. Fica de fora de todas as janelas, inclusive "atrasada".
    if (!data) return false;

    const dias = diasAte(data, hoje);
    if (renewal === 'atrasada') return dias < 0;
    if (renewal === 'proximos_30') return dias >= 0 && dias <= 30;
    return dias >= 0 && dias <= 60;
}

/**
 * Aplica os filtros combináveis sobre a página carregada.
 *
 * `hoje` é PARÂMETRO, não `new Date()` interno: as janelas de renovação são
 * relativas, e uma função que lê o relógio por dentro passa no teste enquanto a
 * data real coincidir com a fixada e quebra amanhã. Mesma lição de
 * `calcularMetricas`.
 */
export function aplicarFiltros(
    clientes: ClientView[],
    filtros: ClientsFilters | undefined,
    hoje: string,
): ClientView[] {
    if (!filtros) return clientes;

    return clientes.filter(c => {
        if (filtros.stage && filtros.stage !== 'todos' && c.lifecycleStage !== filtros.stage) {
            return false;
        }
        if (filtros.category && filtros.category !== 'todos' && c.category !== filtros.category) {
            return false;
        }
        if (!passaNaFaixa(c, filtros.band)) return false;
        if (!passaNaRenovacao(c, filtros.renewal, hoje)) return false;
        return true;
    });
}

/** Sem valor vai pro fim em qualquer ordenação: ausência não compete com número. */
const NO_FIM = Number.POSITIVE_INFINITY;

/**
 * Ordena a página carregada.
 *
 * `ClientsSort` existia em `types/clients.ts` desde a F1 **sem nenhum
 * consumidor** — a consulta fixava `.order('name')` e nada mais ordenava. Esta
 * é a função que dá call site ao tipo.
 *
 * Devolve array novo: `Array.prototype.sort` ordena no lugar, e mutar o array
 * que veio do cache do TanStack Query faz a lista mudar sob os pés de quem
 * ainda está lendo aquela referência.
 */
export function ordenarClientes(clientes: ClientView[], sort: ClientsSort): ClientView[] {
    const copia = [...clientes];

    if (sort === 'nome') {
        return copia.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    if (sort === 'mrr') {
        // Maior primeiro: quem pergunta "ordena por MRR" quer ver o topo.
        return copia.sort(
            (a, b) => (b.activeContract?.monthlyValue ?? 0) - (a.activeContract?.monthlyValue ?? 0),
        );
    }

    if (sort === 'saude') {
        // Menor primeiro: a lista por saúde serve pra achar quem está mal.
        // Sem avaliação vai pro fim, não pro topo — cliente novo não é problema.
        return copia.sort((a, b) => (a.healthScore ?? NO_FIM) - (b.healthScore ?? NO_FIM));
    }

    // Renovação: a mais próxima primeiro, e sem data por último. Comparar
    // `YYYY-MM-DD` como string funciona e evita `new Date(iso)`, que lê como UTC
    // e em GMT-3 devolve o dia anterior.
    return copia.sort((a, b) => {
        const da = a.activeContract?.renewalDate;
        const db = b.activeContract?.renewalDate;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
    });
}
