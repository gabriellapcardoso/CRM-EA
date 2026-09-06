'use client';

import React from 'react';
import Link from 'next/link';
import { useClientAIActions } from '@/lib/query/hooks/useClientsQuery';
import { diasAte } from '@/lib/clients/metricas';
import { hojeLocalISO } from '@/lib/utils/dataLocal';
import { ClientTeamBlock } from './ClientTeamBlock';
import { TimelineList } from './TimelineList';
import { useClientTimeline } from './useClientTimeline';
import type { ClientView } from '@/types/clients';

const MOEDA = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
});

/** Prazo em texto, com o sinal do atraso explícito. */
function prazoDeRenovacao(dataISO: string | undefined, hoje: string) {
    if (!dataISO) return { valor: '—', nota: 'Sem data de renovação no contrato' };
    const dias = diasAte(dataISO, hoje);
    const [ano, mes, dia] = dataISO.split('-');
    const formatada = `${dia}/${mes}/${ano}`;
    if (dias < 0) {
        const atraso = Math.abs(dias);
        return {
            valor: `${atraso} ${atraso === 1 ? 'dia' : 'dias'} em atraso`,
            nota: `Venceu em ${formatada}`,
        };
    }
    if (dias === 0) return { valor: 'Hoje', nota: `Renova em ${formatada}` };
    return {
        valor: `${dias} ${dias === 1 ? 'dia' : 'dias'}`,
        nota: `Renova em ${formatada}`,
    };
}

interface Props {
    cliente: ClientView;
}

export const VisaoGeralTab: React.FC<Props> = ({ cliente }) => {
    const acoesDeIA = useClientAIActions(cliente.id);
    const timeline = useClientTimeline(cliente.id);
    const contrato = cliente.activeContract;
    const prazo = prazoDeRenovacao(contrato?.renewalDate, hojeLocalISO());

    return (
        <>
            <section className="section-card">
                <h2 className="title-md">Visão Geral</h2>

                <div className="field-grid">
                    <div className="field">
                        <span className="field__label">MRR</span>
                        <span className="field__value num">
                            {contrato ? MOEDA.format(contrato.monthlyValue) : '—'}
                        </span>
                        {!contrato && (
                            <span className="meta">Sem contrato vigente cadastrado</span>
                        )}
                    </div>

                    <div className="field">
                        <span className="field__label">Ações da IA</span>
                        {/* Travessão enquanto não respondeu: "0" é uma afirmação
                            sobre o cliente, e consulta que não voltou não
                            autoriza afirmação nenhuma. */}
                        <span className="field__value num">
                            {acoesDeIA.isSuccess ? acoesDeIA.data : '—'}
                        </span>
                        <span className="meta">
                            {acoesDeIA.isError
                                ? 'Não foi possível contar'
                                : 'Respostas registradas para os contatos deste cliente'}
                        </span>
                    </div>

                    <div className="field">
                        <span className="field__label">Prazo de Renovação</span>
                        <span className="field__value">{prazo.valor}</span>
                        <span className="meta">{prazo.nota}</span>
                    </div>

                    <div className="field">
                        <span className="field__label">Deals do Cliente</span>
                        <span className="field__value num">{timeline.idsDeDeal.size}</span>
                        <span className="meta">Vinculados a esta empresa</span>
                    </div>
                </div>
            </section>

            <section className="section-card">
                <ClientTeamBlock companyId={cliente.id} />
            </section>

            <section className="section-card">
                <div className="list-toolbar">
                    <h2 className="title-md">Atividade Recente</h2>
                    {timeline.estado === 'com-dados' && (
                        <Link className="btn btn--quiet" href={`?aba=timeline`}>
                            Ver tudo ({timeline.itens.length})
                        </Link>
                    )}
                </div>

                {timeline.estado === 'carregando' && (
                    <p className="muted">Carregando o histórico…</p>
                )}
                {timeline.estado === 'erro' && (
                    <p className="muted">
                        Não foi possível carregar o histórico: {timeline.erro?.message}
                    </p>
                )}
                {timeline.estado === 'indefinido' && (
                    <p className="muted">
                        O histórico não chegou. Recarregue a página — isto não quer dizer
                        que não há nada.
                    </p>
                )}
                {timeline.estado === 'vazio' && (
                    <p className="muted">
                        Nada registrado ainda. O histórico junta as atividades dos deals e
                        contatos desta empresa e os marcos escritos à mão.
                    </p>
                )}
                {timeline.estado === 'com-dados' && (
                    <TimelineList itens={timeline.itens} limite={5} />
                )}
            </section>
        </>
    );
};
