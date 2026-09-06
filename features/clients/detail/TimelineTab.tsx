'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { useCreateClientEvent, useDeleteClientEvent } from '@/lib/query/hooks/useClientsQuery';
import { hojeLocalISO } from '@/lib/utils/dataLocal';
import { TimelineList } from './TimelineList';
import { useClientTimeline } from './useClientTimeline';

interface Props {
    companyId: string;
}

/**
 * Histórico completo, mais o cadastro de marco manual.
 *
 * O marco existe só pro que NÃO é derivável — "kickoff realizado", "reunião
 * trimestral". Atividade, mudança de estágio e conversa já chegam aqui pelo
 * join; duplicá-las como marco criaria dois registros do mesmo fato.
 */
export const TimelineTab: React.FC<Props> = ({ companyId }) => {
    const timeline = useClientTimeline(companyId);
    const criar = useCreateClientEvent();
    const remover = useDeleteClientEvent();

    const [aberto, setAberto] = React.useState(false);
    const [titulo, setTitulo] = React.useState('');
    const [corpo, setCorpo] = React.useState('');
    const [quando, setQuando] = React.useState(hojeLocalISO());

    const aoRegistrar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titulo.trim()) return;
        try {
            await criar.mutateAsync({
                companyId,
                title: titulo.trim(),
                body: corpo.trim() || undefined,
                // A data vem do input como `YYYY-MM-DD`; o campo no banco é
                // timestamptz. Meio-dia evita que a conversão de fuso jogue o
                // marco pro dia anterior — de -11 a +12 o dia continua o mesmo.
                // O `Z` é obrigatório: sem ele o Postgres resolve o horário pelo
                // fuso do SERVIDOR, então a margem de segurança passaria a
                // depender de uma configuração que não está neste arquivo e que
                // ninguém pensaria em conferir ao mexer aqui.
                occurredAt: `${quando}T12:00:00Z`,
            });
            setTitulo('');
            setCorpo('');
            setQuando(hojeLocalISO());
            setAberto(false);
        } catch {
            // A mensagem sai por `criar.error` abaixo.
        }
    };

    return (
        <section className="section-card">
            <div className="list-toolbar">
                <h2 className="title-md">Timeline</h2>
                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setAberto(a => !a)}
                >
                    <Plus size={15} aria-hidden /> {aberto ? 'Cancelar' : 'Registrar Marco'}
                </button>
            </div>

            {aberto && (
                <form onSubmit={aoRegistrar} className="field-grid section-card__split">
                    <label className="field">
                        <span className="field__label">O que aconteceu</span>
                        <input
                            className="input"
                            value={titulo}
                            onChange={e => setTitulo(e.target.value)}
                            placeholder="Ex: Kickoff realizado"
                            required
                        />
                    </label>
                    <label className="field">
                        <span className="field__label">Quando</span>
                        <input
                            className="input"
                            type="date"
                            value={quando}
                            onChange={e => setQuando(e.target.value)}
                            required
                        />
                    </label>
                    <label className="field" style={{ gridColumn: '1 / -1' }}>
                        <span className="field__label">Detalhe (opcional)</span>
                        <textarea
                            className="input input--textarea"
                            value={corpo}
                            onChange={e => setCorpo(e.target.value)}
                        />
                    </label>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <button
                            type="submit"
                            className="btn btn--primary"
                            disabled={criar.isPending || !titulo.trim()}
                        >
                            {criar.isPending ? 'Registrando…' : 'Registrar'}
                        </button>
                    </div>
                </form>
            )}

            {criar.isError && (
                <p className="muted">
                    Não foi possível registrar: {(criar.error as Error)?.message}
                </p>
            )}

            {timeline.podeEstarTruncada && (
                <p className="meta">
                    Alguma fonte bateu o teto de 1000 linhas — o histórico pode estar
                    incompleto.
                </p>
            )}

            {timeline.estado === 'carregando' && <p className="muted">Carregando o histórico…</p>}
            {timeline.estado === 'erro' && (
                <p className="muted">
                    Não foi possível carregar o histórico: {timeline.erro?.message}
                </p>
            )}
            {timeline.estado === 'indefinido' && (
                <p className="muted">
                    O histórico não chegou. Recarregue a página — isto não quer dizer que
                    não há nada.
                </p>
            )}
            {timeline.estado === 'vazio' && (
                <p className="muted">
                    Nada registrado ainda. O histórico junta as atividades dos deals e
                    contatos desta empresa e os marcos escritos à mão.
                </p>
            )}
            {remover.isError && (
                <p className="muted">
                    Não foi possível remover o marco: {(remover.error as Error)?.message}
                </p>
            )}

            {timeline.estado === 'com-dados' && (
                <TimelineList
                    itens={timeline.itens}
                    onRemoverMarco={id => remover.mutate({ id, companyId })}
                    removendo={remover.isPending}
                />
            )}
        </section>
    );
};
