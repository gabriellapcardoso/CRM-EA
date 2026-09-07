/**
 * Vocabulário do Módulo Clientes — fonte única.
 *
 * Os três conjuntos abaixo são fixados por CHECK no banco
 * (`crm_companies_lifecycle_check`, `_niche_check`, `_category_check`), então
 * valor fora daqui não entra: o insert falha. O que este arquivo acrescenta é o
 * RÓTULO e, no caso do ciclo de vida, a ORDEM.
 *
 * Existia em duas cópias até 2026-09-07 — um `Record` no `ClientDetailPage` e um
 * array de `{value,label}` no `ClientFormModal`, iguais por coincidência. O
 * kanban da F3 seria a terceira, e três cópias de uma lista que o banco já
 * governa é uma divergência esperando acontecer: basta alguém renomear "Setup
 * Concluído" num arquivo. Aqui a lista é uma; as duas formas saem dela.
 */

import type { ClientCategory, ClientLifecycleStage, ClientNiche } from '@/types/clients';

interface Termo<T extends string> {
    value: T;
    label: string;
}

/**
 * Ordem do ciclo de vida, e ela é semântica: é a sequência das colunas do
 * kanban e a direção do progresso da conta. `churn` fica no fim porque é saída,
 * não um estágio a mais — mover para lá é o único movimento que tira o cliente
 * das contas da carteira (`estaNaCarteira`, em `metricas.ts`).
 */
export const ESTAGIOS_DO_CICLO: ReadonlyArray<Termo<ClientLifecycleStage>> = [
    { value: 'lead', label: 'Lead' },
    { value: 'contrato_assinado', label: 'Contrato Assinado' },
    { value: 'kickoff', label: 'Kickoff' },
    { value: 'setup_concluido', label: 'Setup Concluído' },
    { value: 'em_operacao', label: 'Em Operação' },
    { value: 'churn', label: 'Churn' },
];

export const NICHOS: ReadonlyArray<Termo<ClientNiche>> = [
    { value: 'local', label: 'Negócio Local' },
    { value: 'ecommerce', label: 'E-commerce' },
    { value: 'infoproduto', label: 'Infoproduto' },
    { value: 'servicos_digitais', label: 'Serviços Digitais' },
    { value: 'politico_mandato', label: 'Político · Mandato' },
    { value: 'politico_eleitoral', label: 'Político · Eleitoral' },
];

export const CATEGORIAS: ReadonlyArray<Termo<ClientCategory>> = [
    { value: 'ouro', label: 'Ouro' },
    { value: 'prata', label: 'Prata' },
    { value: 'bronze', label: 'Bronze' },
];

function rotulo<T extends string>(lista: ReadonlyArray<Termo<T>>, valor?: T | null): string {
    if (!valor) return '—';
    // Valor fora da lista é dado que o CHECK deveria ter barrado. Devolver o
    // valor cru em vez de "—" faz a anomalia aparecer na tela em vez de virar
    // um traço indistinguível de campo vazio.
    return lista.find(t => t.value === valor)?.label ?? valor;
}

export const rotuloDoEstagio = (v?: ClientLifecycleStage | null) => rotulo(ESTAGIOS_DO_CICLO, v);
export const rotuloDoNicho = (v?: ClientNiche | null) => rotulo(NICHOS, v);
export const rotuloDaCategoria = (v?: ClientCategory | null) => rotulo(CATEGORIAS, v);
