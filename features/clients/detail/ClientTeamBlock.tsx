'use client';

import React from 'react';
import { UserPlus, X } from 'lucide-react';
import {
    useClientTeam,
    useAssignClientTeam,
    useRemoveClientTeam,
} from '@/lib/query/hooks/useClientsQuery';
import { useOrgMembersQuery } from '@/lib/query/hooks/useOrgMembersQuery';
import { estadoDaConsulta } from '@/lib/clients/estadoDaConsulta';

interface Props {
    companyId: string;
}

/**
 * Equipe interna atribuída ao cliente.
 *
 * O trigger `trg_client_team_tenant` valida no banco que empresa E perfil são da
 * mesma organização, então o pior caso aqui é um erro legível, não vínculo
 * cruzado.
 */
export const ClientTeamBlock: React.FC<Props> = ({ companyId }) => {
    const equipe = useClientTeam(companyId);
    const membros = useOrgMembersQuery();
    const atribuir = useAssignClientTeam();
    const remover = useRemoveClientTeam();

    const [escolhido, setEscolhido] = React.useState('');
    const [papel, setPapel] = React.useState('');

    const lista = equipe.data ?? [];
    const estado = estadoDaConsulta({
        isSuccess: equipe.isSuccess,
        isError: equipe.isError,
        isFetching: equipe.isFetching,
        temDados: !!equipe.data,
        quantidade: lista.length,
    });

    // Quem já está na equipe sai do seletor: atribuir duas vezes bate no índice
    // único do banco e devolve erro cru.
    const jaAtribuidos = new Set(lista.map(m => m.profileId));
    const disponiveis = (membros.data ?? []).filter(m => !jaAtribuidos.has(m.id));

    const aoAtribuir = async () => {
        if (!escolhido) return;
        try {
            await atribuir.mutateAsync({
                companyId,
                profileId: escolhido,
                role: papel.trim() || undefined,
            });
            setEscolhido('');
            setPapel('');
        } catch {
            // A mensagem sai por `atribuir.error` abaixo.
        }
    };

    return (
        <div className="cockpit__block">
            <h3 className="title-sm">Equipe Interna</h3>

            {estado === 'carregando' && <p className="muted">Carregando a equipe…</p>}

            {estado === 'erro' && (
                <p className="muted">
                    Não foi possível carregar a equipe: {(equipe.error as Error)?.message}
                </p>
            )}

            {estado === 'indefinido' && (
                <p className="muted">
                    A equipe não chegou. Recarregue a página — isto não quer dizer que
                    ninguém está atribuído.
                </p>
            )}

            {estado === 'vazio' && (
                <p className="muted">Ninguém atribuído a este cliente ainda.</p>
            )}

            {estado === 'com-dados' && (
                <ul className="chip-row">
                    {lista.map(membro => (
                        <li key={membro.id} className="chip">
                            {membro.profileName}
                            {membro.role ? ` · ${membro.role}` : ''}
                            <button
                                type="button"
                                aria-label={`Remover ${membro.profileName} da equipe`}
                                onClick={() => remover.mutate({ id: membro.id, companyId })}
                                disabled={remover.isPending}
                            >
                                <X size={13} aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="list-toolbar">
                <label className="field" style={{ minWidth: 180 }}>
                    <span className="field__label">Atribuir Membro</span>
                    <select
                        className="input"
                        value={escolhido}
                        onChange={e => setEscolhido(e.target.value)}
                        disabled={membros.isLoading || disponiveis.length === 0}
                    >
                        <option value="">
                            {disponiveis.length === 0
                                ? 'Todo o time já está atribuído'
                                : 'Escolha quem atribuir'}
                        </option>
                        {disponiveis.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="field" style={{ minWidth: 150 }}>
                    <span className="field__label">Papel (opcional)</span>
                    <input
                        className="input"
                        value={papel}
                        onChange={e => setPapel(e.target.value)}
                        placeholder="Ex: Gestora de tráfego"
                    />
                </label>

                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={aoAtribuir}
                    disabled={!escolhido || atribuir.isPending}
                >
                    <UserPlus size={15} aria-hidden /> Atribuir
                </button>
            </div>

            {atribuir.isError && (
                <p className="muted">
                    Não foi possível atribuir: {(atribuir.error as Error)?.message}
                </p>
            )}
            {remover.isError && (
                <p className="muted">
                    Não foi possível remover: {(remover.error as Error)?.message}
                </p>
            )}
        </div>
    );
};
