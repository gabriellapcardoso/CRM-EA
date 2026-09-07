import React from 'react';
import Link from 'next/link';
import { hojeLocalISO, dataLocalISOEmDias } from '@/lib/utils/dataLocal';
import { faixaDeSaude, rotuloDaFaixa } from '@/lib/clients/health';
import type { ClientView } from '@/types/clients';
import { rotuloDoNicho, rotuloDaCategoria } from '@/lib/clients/vocabulario';
import { MOEDA, renovacao } from '@/lib/clients/apresentacao';

interface Props {
    clientes: ClientView[];
}

export const ClientsList: React.FC<Props> = ({ clientes }) => {
    const hoje = hojeLocalISO();
    const limite30 = dataLocalISOEmDias(30);

    return (
        <div className="table-list__scroll">
            <table className="table-list table-list--fit">
                <thead>
                    <tr>
                        <th scope="col">Cliente</th>
                        <th scope="col">Nicho</th>
                        <th scope="col">Categoria</th>
                        <th scope="col">Saúde</th>
                        <th scope="col" style={{ textAlign: 'right' }}>MRR</th>
                        <th scope="col">Renovação</th>
                    </tr>
                </thead>
                <tbody>
                    {clientes.map(cliente => {
                        const banda = faixaDeSaude(cliente.healthScore);
                        const contrato = cliente.activeContract;
                        const r = renovacao(contrato?.renewalDate, hoje, limite30);

                        return (
                            <tr key={cliente.id}>
                                <td>
                                    <div className="cell-name__stack">
                                        <div className="cell-name__top">
                                            <Link
                                                className="table-list__link"
                                                href={`/clients/${cliente.id}`}
                                            >
                                                {cliente.name}
                                            </Link>
                                        </div>
                                        <div className="cell-name__co">
                                            <span className="cell-name__co-text">
                                                {cliente.industry || 'Setor não informado'}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td>{rotuloDoNicho(cliente.niche)}</td>
                                <td>{rotuloDaCategoria(cliente.category)}</td>
                                <td>
                                    {/* Sem pontuação é estado próprio, diferente de zero:
                                        cliente novo ainda não foi avaliado, e zero é churn. */}
                                    {cliente.healthScore === undefined
                                        ? <span className="muted">Sem avaliação</span>
                                        : `${cliente.healthScore} · ${rotuloDaFaixa(banda)}`}
                                </td>
                                <td className="cell-num num">
                                    {contrato
                                        ? MOEDA.format(contrato.monthlyValue)
                                        : <span className="muted">Sem contrato</span>}
                                </td>
                                <td>
                                    {r.texto}
                                    {r.estado === 'atrasada' && (
                                        <span className="meta"> · Atrasada</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
