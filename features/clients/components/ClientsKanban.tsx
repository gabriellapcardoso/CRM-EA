'use client';

import React from 'react';
import { ESTAGIOS_DO_CICLO, ehEstagioConhecido } from '@/lib/clients/vocabulario';
import { useUpdateClient } from '@/lib/query/hooks/useClientsQuery';
import { ClientCard } from './ClientCard';
import type { ClientLifecycleStage, ClientView } from '@/types/clients';

interface Props {
    clientes: ClientView[];
    hoje: string;
    limite30: string;
}

/** Coluna dos que ainda não foram classificados. */
const SEM_ESTAGIO = 'sem_estagio';

/**
 * Coluna de escape para estágio que o vocabulário não conhece.
 *
 * Sem ela, um valor aceito pelo CHECK do banco mas ausente de
 * `ESTAGIOS_DO_CICLO` não casaria com coluna nenhuma e o cartão simplesmente
 * NÃO seria desenhado — o cliente sumia da tela sem erro, e o rodapé ainda o
 * contava como classificado. Só aparece quando tem alguém dentro: coluna
 * permanentemente vazia é ruído.
 */
const OUTRO = 'outro';

type ColunaId = ClientLifecycleStage | typeof SEM_ESTAGIO | typeof OUTRO;

/**
 * Kanban do ciclo de vida da conta.
 *
 * **Arrastar escreve.** `lifecycle_stage` é o único campo de governança que
 * nenhuma automação preenche — está documentado que movimentação de deal nunca
 * o toca, porque ele descreve a relação com a conta, não a venda. Sem escrita
 * pela tela ele ficaria nulo para sempre, e o kanban nasceria com uma coluna só.
 *
 * A coluna "Sem estágio" é ORIGEM, nunca destino: dá para tirar um cliente de
 * lá, não para devolvê-lo. Desclassificar não é uma decisão que alguém tome de
 * propósito arrastando, e um destino que aceita tudo transforma esbarrão em
 * perda de informação.
 *
 * Movimento para `churn` pede confirmação porque é o único que muda o que a
 * carteira soma (`estaNaCarteira`, em `metricas.ts`): o cliente sai dos
 * indicadores. Os outros cinco são reversíveis arrastando de volta.
 */
export const ClientsKanban: React.FC<Props> = ({ clientes, hoje, limite30 }) => {
    const atualizar = useUpdateClient();
    const [alvo, setAlvo] = React.useState<ColunaId | null>(null);

    // Movimento otimista LOCAL, não no cache: o cartão aparece na coluna de
    // destino na hora, e `onSettled` do hook revalida a lista. Escrever no
    // cache paginado exigiria reproduzir a chave exata (paginação + filtros),
    // e errar isso deixa lixo em cache que ninguém consegue explicar depois.
    const [movendo, setMovendo] = React.useState<{ id: string; para: ClientLifecycleStage } | null>(
        null,
    );

    function estagioNaTela(c: ClientView): ColunaId {
        if (movendo?.id === c.id) return movendo.para;
        if (!c.lifecycleStage) return SEM_ESTAGIO;
        return ehEstagioConhecido(c.lifecycleStage) ? c.lifecycleStage : OUTRO;
    }

    const temDesconhecido = clientes.some(c => estagioNaTela(c) === OUTRO);

    const colunas: { id: ColunaId; titulo: string; aceita: boolean }[] = [
        { id: SEM_ESTAGIO, titulo: 'Sem Estágio', aceita: false },
        ...ESTAGIOS_DO_CICLO.map(e => ({ id: e.value as ColunaId, titulo: e.label, aceita: true })),
        // Só entra na lista quando recolheu alguém.
        ...(temDesconhecido
            ? [{ id: OUTRO as ColunaId, titulo: 'Outro', aceita: false }]
            : []),
    ];

    async function soltarEm(destino: ClientLifecycleStage, clienteId: string) {
        const cliente = clientes.find(c => c.id === clienteId);
        if (!cliente || cliente.lifecycleStage === destino) return;

        if (destino === 'churn') {
            const ok = window.confirm(
                `Marcar "${cliente.name}" como churn? Ele sai das contas da carteira — MRR, clientes ativos e LTV deixam de considerá-lo.`,
            );
            if (!ok) return;
        }

        setMovendo({ id: clienteId, para: destino });
        try {
            await atualizar.mutateAsync({
                companyId: clienteId,
                campos: { lifecycleStage: destino },
            });
        } catch {
            // A mensagem sai por `atualizar.error` abaixo; o cartão volta
            // sozinho pra coluna de origem quando `movendo` é limpo.
        } finally {
            setMovendo(null);
        }
    }

    return (
        <>
            {atualizar.isError && (
                <p className="muted">
                    Não foi possível mover o cliente: {(atualizar.error as Error)?.message}
                </p>
            )}

            <div className="client-kanban">
                {colunas.map(coluna => {
                    const daColuna = clientes.filter(c => estagioNaTela(c) === coluna.id);
                    return (
                        <section
                            key={coluna.id}
                            className={`client-kanban__col${
                                alvo === coluna.id && coluna.aceita ? ' client-kanban__col--alvo' : ''
                            }`}
                            aria-label={`${coluna.titulo}: ${daColuna.length} cliente${daColuna.length === 1 ? '' : 's'}`}
                            onDragOver={e => {
                                if (!coluna.aceita) return;
                                e.preventDefault();
                                setAlvo(coluna.id);
                            }}
                            onDragLeave={() => setAlvo(a => (a === coluna.id ? null : a))}
                            onDrop={e => {
                                e.preventDefault();
                                setAlvo(null);
                                if (!coluna.aceita) return;
                                const id = e.dataTransfer.getData('clienteId');
                                if (id) void soltarEm(coluna.id as ClientLifecycleStage, id);
                            }}
                        >
                            <header className="client-kanban__cabeca">
                                <span className="client-kanban__titulo">{coluna.titulo}</span>
                                <span className="client-kanban__conta num">{daColuna.length}</span>
                            </header>

                            {daColuna.length === 0 ? (
                                <p className="client-kanban__vazia">
                                    {coluna.aceita ? 'Arraste um cliente pra cá.' : 'Ninguém aqui.'}
                                </p>
                            ) : (
                                <ul className="client-cards client-cards--coluna">
                                    {daColuna.map(c => (
                                        <ClientCard
                                            key={c.id}
                                            cliente={c}
                                            hoje={hoje}
                                            limite30={limite30}
                                            arrastavel
                                            movendo={movendo?.id === c.id}
                                            onDragStart={(e, id) => {
                                                e.dataTransfer.setData('clienteId', id);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                        />
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })}
            </div>

            <p className="meta">
                Arrastar o cartão muda o estágio do cliente. Estágio atual:{' '}
                {clientes.filter(c => c.lifecycleStage).length} de {clientes.length} classificados
                {clientes.some(c => !c.lifecycleStage) && ' — o resto está em "Sem Estágio"'}.
            </p>
        </>
    );
};
