'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { rotuloDoItem } from '@/lib/clients/timeline';
import type { ClientTimelineItem } from '@/types/clients';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const SO_DATA = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

/**
 * Atividade tem horário de verdade e ele é mostrado. Marco não: o formulário
 * pede só a data, e o horário guardado é meio-dia UTC — margem de segurança
 * pra conversão de fuso não jogar o marco pro dia anterior. Exibir esse
 * meio-dia convertido (09:00 em GMT-3) seria mostrar como informação um número
 * que ninguém digitou.
 */
function quando(item: ClientTimelineItem): string {
    const data = new Date(item.ocorridoEm);
    return item.origem === 'marco' ? SO_DATA.format(data) : DATA_HORA.format(data);
}

interface Props {
    itens: ClientTimelineItem[];
    /** Corta a lista; a Visão Geral mostra só as últimas. */
    limite?: number;
    /**
     * Remove um marco. Só marco: atividade e mudança de estágio são derivadas
     * de outra tela e apagá-las daqui reescreveria o histórico do deal.
     */
    onRemoverMarco?: (idDoMarco: string) => void;
    removendo?: boolean;
}

export const TimelineList: React.FC<Props> = ({
    itens,
    limite,
    onRemoverMarco,
    removendo,
}) => {
    const visiveis = limite ? itens.slice(0, limite) : itens;

    return (
        <ol className="client-timeline">
            {visiveis.map(item => (
                <li key={item.id} className="client-timeline__item">
                    <div className="client-timeline__head">
                        <span className="client-timeline__label">{rotuloDoItem(item)}</span>
                        {/* `timestamptz` vem em UTC; o Intl converte pro fuso de
                            quem está olhando. Citar o valor cru faria um evento
                            das 15h virar 18h na tela. */}
                        <span className="meta">{quando(item)}</span>
                        {item.origem === 'marco' && onRemoverMarco && (
                            <button
                                type="button"
                                className="btn btn--quiet"
                                aria-label={`Remover o marco "${item.titulo}"`}
                                disabled={removendo}
                                // Confirma antes: o botão se repete em cada
                                // linha da lista, e marco é escrito à mão — no
                                // banco vira soft-delete, mas pela tela não há
                                // desfazer nem lixeira, então clique errado é
                                // perda definitiva pra quem está usando o CRM.
                                // O id vem prefixado (`marco:<uuid>`) pra não
                                // colidir com o de atividade na mesma lista.
                                onClick={() => {
                                    if (!window.confirm(`Remover o marco "${item.titulo}"?`)) return;
                                    onRemoverMarco(item.id.replace(/^marco:/, ''));
                                }}
                            >
                                <Trash2 size={13} aria-hidden />
                            </button>
                        )}
                    </div>
                    <p className="client-timeline__title">{item.titulo}</p>
                    {item.detalhe && <p className="client-timeline__body">{item.detalhe}</p>}
                    <p className="meta">
                        {[item.deal, item.autor].filter(Boolean).join(' · ')}
                    </p>
                </li>
            ))}
        </ol>
    );
};
