'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useClient } from '@/lib/query/hooks/useClientsQuery';
import { resolverOrigem } from '@/lib/navigation/origem';
import { faixaDeSaude, rotuloDaFaixa } from '@/lib/clients/health';
import { estadoDaConsulta } from '@/lib/clients/estadoDaConsulta';
import { ClientTabs, ehAbaValida, type AbaDoCliente } from './ClientTabs';
import { VisaoGeralTab } from './VisaoGeralTab';
import { ComercialTab } from './ComercialTab';
import { TimelineTab } from './TimelineTab';

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
 * Ficha do cliente.
 *
 * A F2 entrega três abas: Visão Geral, Comercial e Timeline. As outras quatro
 * da spec chegam nas F4 e F5, e só aparecem na barra quando existirem.
 */
export default function ClientDetailPage({ companyId }: { companyId: string }) {
    const searchParams = useSearchParams();
    // Sem `?from=`, o voltar é a carteira — não o kanban de negociação, que é
    // o padrão global do resolverOrigem e não tem nada a ver com esta tela.
    const from = searchParams?.get('from');
    const origem = from
        ? resolverOrigem(from, searchParams?.get('fromId'))
        : { href: '/clients', label: '← voltar pra clientes' };

    // A aba vive na URL: recarregar cai na mesma aba, e o endereço pode ser
    // mandado pra outra pessoa. `replaceState` não remonta a árvore do App
    // Router, então trocar de aba não refaz as consultas da página.
    const abaDaUrl = searchParams?.get('aba');
    const [aba, setAba] = React.useState<AbaDoCliente>(
        ehAbaValida(abaDaUrl) ? abaDaUrl : 'visao-geral',
    );

    const trocarAba = React.useCallback((nova: AbaDoCliente) => {
        setAba(nova);
        const params = new URLSearchParams(window.location.search);
        params.set('aba', nova);
        window.history.replaceState(null, '', `?${params.toString()}`);
    }, []);

    const {
        data: cliente,
        isSuccess,
        isError,
        error,
        isFetching,
    } = useClient(companyId);

    // Só `isSuccess` autoriza dizer que o cliente não existe — senão uma falha
    // de rede vira "cliente não encontrado". Ver `estadoDaConsulta`.
    const estado = estadoDaConsulta({
        isSuccess,
        isError,
        isFetching,
        temDados: !!cliente,
        quantidade: cliente ? 1 : 0,
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


            <ClientTabs ativa={aba} onTrocar={trocarAba} />

            {aba === 'visao-geral' && <VisaoGeralTab cliente={cliente} />}
            {aba === 'comercial' && <ComercialTab companyId={companyId} />}
            {aba === 'timeline' && <TimelineTab companyId={companyId} />}
        </div>
    );
}
