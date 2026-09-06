import React from 'react';
import type { ClientsMetrics } from '@/types/clients';

const MOEDA = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
});

interface Props {
    metricas: ClientsMetrics;
    /**
     * A consulta respondeu. Enquanto for falso o cartão mostra travessão, não
     * zero: "R$ 0" é uma afirmação sobre a carteira, e uma consulta que falhou
     * ou nem saiu não autoriza afirmação nenhuma.
     */
    carregado?: boolean;
}

/**
 * Os quatro indicadores da carteira.
 *
 * Usa `.card-kpi`, o vocabulário de indicador que o dashboard e o inbox já
 * falam. `features/dashboard/components/StatCard.tsx` existe e parece servir,
 * mas não tem nenhum consumidor no repositório e traz variante `dark:` num
 * app que é claro-só — reusar seria ressuscitar código morto.
 *
 * A grade é `.kpi-grid--fluid`, não `.kpi-grid`: a original é
 * `repeat(4, 1fr)` fixo e estoura pro lado quando a barra lateral e o painel
 * de IA estão abertos juntos. Modificador novo em vez de mexer na original,
 * que o dashboard e o inbox usam e ninguém mediu.
 *
 * O subtexto de receita diz quantos clientes ficaram de fora por não ter
 * contrato. Sem isso o número menor passa por resultado, e ninguém descobre
 * que metade da carteira nunca teve o comercial preenchido.
 */
export const ClientsMetricsBar: React.FC<Props> = ({ metricas, carregado }) => {
    const { semContrato, clientesAtivos } = metricas;
    const avisoContrato =
        semContrato > 0
            ? `${semContrato} ${semContrato === 1 ? 'cliente sem contrato cadastrado' : 'clientes sem contrato cadastrado'}`
            // Carteira vazia não tem "todos com contrato": não há ninguém pra
            // ter ou não ter. A frase só faz sentido com alguém dentro.
            : clientesAtivos > 0
                ? 'Todos com contrato cadastrado'
                : 'Nenhum cliente na carteira ainda';

    return (
        <section className="kpi-grid kpi-grid--fluid" aria-label="Indicadores da carteira">
            <article className="card-kpi">
                <h3 className="card-kpi__label">Receita Mensal</h3>
                {!carregado ? <p className="card-kpi__value num">—</p> : (
                    <>
                        <p className="card-kpi__value num">{MOEDA.format(metricas.receitaMensal)}</p>
                        <p className="card-kpi__delta">{avisoContrato}</p>
                    </>
                )}
            </article>

            <article className="card-kpi">
                <h3 className="card-kpi__label">Clientes Ativos</h3>
                {!carregado ? <p className="card-kpi__value num">—</p> : (
                    <>
                        <p className="card-kpi__value num">{metricas.clientesAtivos}</p>
                        <p className="card-kpi__delta">Fora os que deram churn</p>
                    </>
                )}
            </article>

            <article className="card-kpi">
                <h3 className="card-kpi__label">LTV Médio</h3>
                {!carregado ? <p className="card-kpi__value num">—</p> : (
                    <>
                        <p className="card-kpi__value num">{MOEDA.format(metricas.ltvMedio)}</p>
                        <p className="card-kpi__delta">Realizado até hoje, não projetado</p>
                    </>
                )}
            </article>

            <article className="card-kpi">
                <h3 className="card-kpi__label">Alertas de Renovação</h3>
                {!carregado ? <p className="card-kpi__value num">—</p> : (
                    <>
                        <p className="card-kpi__value num">{metricas.alertasRenovacao}</p>
                        <p className="card-kpi__delta">Vencem nos próximos 90 dias</p>
                    </>
                )}
            </article>
        </section>
    );
};
