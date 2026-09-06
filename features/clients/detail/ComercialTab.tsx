'use client';

import React from 'react';
import { useClientContracts, useSaveContract } from '@/lib/query/hooks/useClientsQuery';
import { estadoDaConsulta } from '@/lib/clients/estadoDaConsulta';
import { formatarDocumento } from '@/lib/clients/documento';
import { ContractForm } from '../components/ContractForm';
import type { ContractFormData } from '@/lib/validations/schemas';
import type { ClientContract, ContractStatus, DocumentType } from '@/types/clients';

const MOEDA = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
});

/** `YYYY-MM-DD` por corte de string: `new Date(iso)` lê como UTC e, em GMT-3, mostra o dia anterior. */
function dataBR(iso?: string): string {
    if (!iso) return '—';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
}

/**
 * Aba Comercial: contratos do cliente, com vigência e dados cadastrais.
 *
 * Extraída da ficha na F2, quando a barra de abas entrou — inline eram 100
 * linhas dentro de um arquivo que passaria de 400.
 */
export const ComercialTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const contratos = useClientContracts(companyId);
    const salvar = useSaveContract();

    const [editando, setEditando] = React.useState<ClientContract | null>(null);
    const [criandoNovo, setCriandoNovo] = React.useState(false);

    const lista = contratos.data ?? [];
    const vigente = lista.find(c => c.status === 'vigente');
    const emEdicao = criandoNovo ? null : (editando ?? vigente ?? null);

    const estadoContratos = estadoDaConsulta({
        isSuccess: contratos.isSuccess,
        isError: contratos.isError,
        isFetching: contratos.isFetching,
        temDados: !!contratos.data,
        quantidade: lista.length,
    });

    const aoSalvar = async (dados: ContractFormData) => {
        await salvar.mutateAsync({
            id: emEdicao?.id,
            companyId,
            monthlyValue: Number(dados.monthlyValue),
            startsAt: dados.startsAt,
            endsAt: dados.endsAt || undefined,
            renewalDate: dados.renewalDate || undefined,
            status: dados.status as ContractStatus,
            paymentMethod: dados.paymentMethod || undefined,
            documentType: (dados.documentType || undefined) as DocumentType | undefined,
            documentNumber: dados.documentNumber || undefined,
            addressZip: dados.addressZip || undefined,
            addressStreet: dados.addressStreet || undefined,
            addressNumber: dados.addressNumber || undefined,
            addressComplement: dados.addressComplement || undefined,
            addressDistrict: dados.addressDistrict || undefined,
            addressCity: dados.addressCity || undefined,
            addressState: dados.addressState || undefined,
        });
        setCriandoNovo(false);
        setEditando(null);
    };

    return (
        <section className="section-card">
            <h2 className="title-md">Comercial</h2>

            {estadoContratos === 'carregando' && (
                <p className="muted">Carregando contratos…</p>
            )}

            {estadoContratos === 'indefinido' && (
                <p className="muted">
                    Os contratos não chegaram. Recarregue a página — isto não quer
                    dizer que não há contrato.
                </p>
            )}

            {estadoContratos === 'erro' && (
                <p className="muted">
                    Não foi possível carregar os contratos:{' '}
                    {(contratos.error as Error)?.message}
                </p>
            )}

            {estadoContratos === 'com-dados' && (
                <div className="table-list__scroll">
                    <table className="table-list table-list--fit">
                        <thead>
                            <tr>
                                <th scope="col">Situação</th>
                                <th scope="col" className="cell-num">Mensal</th>
                                <th scope="col">Início</th>
                                <th scope="col">Renovação</th>
                                <th scope="col">Documento</th>
                                <th scope="col"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lista.map(c => (
                                <tr key={c.id}>
                                    <td>
                                        {c.status === 'vigente' ? 'Vigente'
                                            : c.status === 'encerrado' ? 'Encerrado' : 'Rascunho'}
                                    </td>
                                    <td className="cell-num num">{MOEDA.format(c.monthlyValue)}</td>
                                    <td>{dataBR(c.startsAt)}</td>
                                    <td>{dataBR(c.renewalDate)}</td>
                                    <td>
                                        {c.documentNumber
                                            ? formatarDocumento(c.documentType, c.documentNumber)
                                            : '—'}
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="btn btn--quiet"
                                            onClick={() => {
                                                setCriandoNovo(false);
                                                setEditando(c);
                                            }}
                                        >
                                            Editar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {estadoContratos === 'vazio' && (
                <p className="muted">
                    Nenhum contrato cadastrado. Sem ele o cliente entra como zero no MRR
                    da carteira.
                </p>
            )}

            <div className="list-toolbar">
                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                        setCriandoNovo(true);
                        setEditando(null);
                    }}
                >
                    Novo Contrato
                </button>
                {emEdicao && (
                    <span className="meta">
                        Editando o contrato iniciado em {dataBR(emEdicao.startsAt)}.
                    </span>
                )}
            </div>

            <ContractForm
                contrato={emEdicao}
                salvando={salvar.isPending}
                onSubmit={aoSalvar}
            />

            {salvar.isError && (
                <p className="muted">
                    Não foi possível salvar: {(salvar.error as Error)?.message}
                </p>
            )}
        </section>
    );
};
