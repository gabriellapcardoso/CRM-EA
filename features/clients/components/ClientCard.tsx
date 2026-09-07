import React from 'react';
import Link from 'next/link';
import { faixaDeSaude, rotuloDaFaixa } from '@/lib/clients/health';
import { rotuloDoNicho, rotuloDaCategoria } from '@/lib/clients/vocabulario';
import { renovacao, mrrDoCliente } from '@/lib/clients/apresentacao';
import type { ClientView } from '@/types/clients';

interface Props {
    cliente: ClientView;
    hoje: string;
    limite30: string;
    /** Só o kanban arrasta; na grade o cartão é estático. */
    arrastavel?: boolean;
    movendo?: boolean;
    onDragStart?: (e: React.DragEvent, clienteId: string) => void;
}

/**
 * Cartão do cliente — usado na grade e no kanban.
 *
 * Um componente para as duas vistas de propósito: são a mesma informação em
 * arranjos diferentes, e duas implementações divergiriam no dia em que alguém
 * acrescentasse um campo em uma só.
 *
 * Nunca mostra "R$ 0" para quem não tem contrato: ausência de cadastro e
 * contrato de valor zero somam igual na carteira e significam coisas
 * diferentes para quem olha.
 */
export const ClientCard: React.FC<Props> = ({
    cliente,
    hoje,
    limite30,
    arrastavel,
    movendo,
    onDragStart,
}) => {
    const banda = faixaDeSaude(cliente.healthScore);
    const r = renovacao(cliente.activeContract?.renewalDate, hoje, limite30);
    const mrr = mrrDoCliente(cliente);

    return (
        <li
            className={`client-card${movendo ? ' client-card--movendo' : ''}`}
            draggable={arrastavel && !movendo}
            onDragStart={e => onDragStart?.(e, cliente.id)}
        >
            {/* `draggable={false}` porque âncora é arrastável por padrão: sem
                isto, agarrar o card pelo título faz o navegador iniciar um
                arraste de LINK em vez do arraste do cartão, e o título é
                exatamente onde a mão vai. */}
            <Link
                href={`/clients/${cliente.id}?from=clientes`}
                className="client-card__nome"
                draggable={false}
            >
                {cliente.name}
            </Link>

            <div className="client-card__chips">
                {cliente.niche && <span className="chip">{rotuloDoNicho(cliente.niche)}</span>}
                {cliente.category && (
                    <span className="chip">{rotuloDaCategoria(cliente.category)}</span>
                )}
            </div>

            <div className="client-card__linha">
                <span className="meta">MRR</span>
                <span className="num">{mrr ?? <span className="muted">Sem contrato</span>}</span>
            </div>

            <div className="client-card__linha">
                <span className="meta">Saúde</span>
                {/* Sem pontuação é estado próprio, diferente de zero: cliente
                    novo ainda não foi avaliado, e zero significa churn. */}
                {cliente.healthScore === undefined ? (
                    <span className="muted">Sem avaliação</span>
                ) : (
                    <span>
                        {cliente.healthScore} · {rotuloDaFaixa(banda)}
                    </span>
                )}
            </div>

            <div className="client-card__linha">
                <span className="meta">Renovação</span>
                <span>
                    {r.texto}
                    {r.estado === 'atrasada' && <span className="status-chip status-chip--off"> Atrasada</span>}
                </span>
            </div>
        </li>
    );
};
