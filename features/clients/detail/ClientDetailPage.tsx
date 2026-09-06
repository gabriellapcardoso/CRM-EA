'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useClient, useClientContracts, useSaveContract } from '@/lib/query/hooks/useClientsQuery';
import { resolverOrigem } from '@/lib/navigation/origem';
import { faixaDeSaude, rotuloDaFaixa } from '@/lib/clients/health';
import { formatarDocumento } from '@/lib/clients/documento';
import { estadoDaConsulta } from '@/lib/clients/estadoDaConsulta';
import { ContractForm } from '../components/ContractForm';
import type { ContractFormData } from '@/lib/validations/schemas';
import type { ClientContract, ContractStatus, DocumentType } from '@/types/clients';

const MOEDA = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
});

const NICHOS: Record<string, string> = {
    local: 'Negócio Local',
    ecommerce: 'E-commerce',
    infoproduto: 'Infoproduto',
    servicos_digitais: 'Serviços Digitais',
    politico_mandato: 'Político · Mandato',
    politico_eleitoral: 'Político · Eleitoral',
};

const ESTAGIOS: Record<string, string> = {
    lead: 'Lead',
    contrato_assinado: 'Contrato Assinado',
    kickoff: 'Kickoff',
    setup_concluido: 'Setup Concluído',
    em_operacao: 'Em Operação',
    churn: 'Churn',
};

/** `YYYY-MM-DD` por corte de string: `new Date(iso)` lê como UTC e, em GMT-3, mostra o dia anterior. */
function dataBR(iso?: string): string {
    if (!iso) return '—';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
}

/**
 * Ficha do cliente — F1 entrega a aba Comercial.
 *
 * As outras seis abas chegam nas fases seguintes; até lá não existe barra de
 * abas, porque barra com seis itens mortos é pior que nenhuma.
 */
export default function ClientDetailPage({ companyId }: { companyId: string }) {
    const searchParams = useSearchParams();
    // Sem `?from=`, o voltar é a carteira — não o kanban de negociação, que é
    // o padrão global do resolverOrigem e não tem nada a ver com esta tela.
    const from = searchParams?.get('from');
    const origem = from
        ? resolverOrigem(from, searchParams?.get('fromId'))
        : { href: '/clients', label: '← voltar pra clientes' };

    const {
        data: cliente,
        isSuccess,
        isError,
        error,
        isFetching,
    } = useClient(companyId);
    const contratos = useClientContracts(companyId);
    const salvar = useSaveContract();

    const [editando, setEditando] = React.useState<ClientContract | null>(null);
    const [criandoNovo, setCriandoNovo] = React.useState(false);

    const lista = contratos.data ?? [];
    const vigente = lista.find(c => c.status === 'vigente');
    const emEdicao = criandoNovo ? null : (editando ?? vigente ?? null);

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

    // Só `isSuccess` autoriza dizer que o cliente não existe — senão uma falha
    // de rede vira "cliente não encontrado". Ver `estadoDaConsulta`.
    const estado = estadoDaConsulta({
        isSuccess,
        isError,
        isFetching,
        temDados: !!cliente,
        quantidade: cliente ? 1 : 0,
    });
    const estadoContratos = estadoDaConsulta({
        isSuccess: contratos.isSuccess,
        isError: contratos.isError,
        isFetching: contratos.isFetching,
        temDados: !!contratos.data,
        quantidade: lista.length,
    });

    if (estado === 'carregando') {
        return (
            <div className="screen__inner screen__inner--narrow">
                <p className="muted">Carregando o cliente…</p>
            </div>
        );
    }

    if (estado === 'erro') {
        return (
            <div className="screen__inner screen__inner--narrow">
                <Link className="back-link" href={origem.href}>{origem.label}</Link>
                <p className="muted">
                    Não foi possível carregar este cliente: {(error as Error)?.message}
                </p>
            </div>
        );
    }

    if (estado === 'indefinido') {
        return (
            <div className="screen__inner screen__inner--narrow">
                <Link className="back-link" href={origem.href}>{origem.label}</Link>
                <p className="muted">
                    A ficha não chegou. Confira a conexão e recarregue a página — isto
                    não quer dizer que o cliente não existe.
                </p>
            </div>
        );
    }

    if (!cliente) {
        return (
            <div className="screen__inner screen__inner--narrow">
                <Link className="back-link" href={origem.href}>{origem.label}</Link>
                <div className="state-empty state-empty--boxed">
                    <h3 className="state-empty__title">Cliente não encontrado</h3>
                    <p className="state-empty__text">
                        Ele pode ter sido excluído, ou o endereço está errado.
                    </p>
                </div>
            </div>
        );
    }

    const banda = faixaDeSaude(cliente.healthScore);

    return (
        <div className="screen__inner screen__inner--wide">
            <Link className="back-link" href={origem.href}>{origem.label}</Link>

            <section className="section-card">
                <h2 className="title-md">{cliente.name}</h2>
                <div className="field-grid">
                    <div className="field">
                        <span className="field__label">Nicho</span>
                        <span className="field__value">
                            {cliente.niche ? NICHOS[cliente.niche] : '—'}
                        </span>
                    </div>
                    <div className="field">
                        <span className="field__label">Estágio</span>
                        <span className="field__value">
                            {cliente.lifecycleStage ? ESTAGIOS[cliente.lifecycleStage] : '—'}
                        </span>
                    </div>
                    <div className="field">
                        <span className="field__label">Saúde</span>
                        <span className="field__value">
                            {cliente.healthScore === undefined
                                ? 'Sem avaliação'
                                : `${cliente.healthScore} · ${rotuloDaFaixa(banda)}`}
                        </span>
                    </div>
                    <div className="field">
                        <span className="field__label">Cliente desde</span>
                        <span className="field__value">{dataBR(cliente.clientSince)}</span>
                    </div>
                </div>
            </section>

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
        </div>
    );
}
