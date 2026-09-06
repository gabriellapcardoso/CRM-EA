import type { HealthBand } from '@/types/clients';

/**
 * Faixas de saúde do cliente.
 *
 * A pontuação é digitada por alguém da agência (`health_source = 'manual'`),
 * não vem de pesquisa respondida pelo cliente — decisão de 2026-09-05,
 * PLANO-CLIENTES.md §7.2. O rótulo usa o vocabulário de NPS porque é o que a
 * agência fala; a procedência fica gravada na linha pra que, no dia em que
 * existir pesquisa de verdade, dê pra separar um número do outro.
 */
export const FAIXAS_DE_SAUDE: ReadonlyArray<{
    band: HealthBand;
    label: string;
    min: number;
    max: number;
}> = [
    { band: 'promotor', label: 'Promotor', min: 80, max: 100 },
    { band: 'satisfeito', label: 'Satisfeito', min: 60, max: 79 },
    { band: 'neutro', label: 'Neutro', min: 30, max: 59 },
    { band: 'detrator', label: 'Detrator', min: 10, max: 29 },
    { band: 'churn', label: 'Churn', min: 0, max: 9 },
];

/**
 * Devolve a faixa de uma pontuação, ou `null` quando não há pontuação.
 *
 * Sem pontuação é estado legítimo — cliente recém-cadastrado ainda não foi
 * avaliado — e é diferente de pontuação zero, que significa churn. Devolver
 * `'churn'` para `undefined` classificaria como perdido todo cliente novo.
 */
export function faixaDeSaude(score: number | null | undefined): HealthBand | null {
    if (score === null || score === undefined || Number.isNaN(score)) return null;
    const encontrada = FAIXAS_DE_SAUDE.find(f => score >= f.min && score <= f.max);
    return encontrada?.band ?? null;
}

export function rotuloDaFaixa(band: HealthBand | null): string {
    if (!band) return 'Sem avaliação';
    return FAIXAS_DE_SAUDE.find(f => f.band === band)?.label ?? 'Sem avaliação';
}
