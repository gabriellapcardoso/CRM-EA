'use client';

import React from 'react';

export type AbaDoCliente = 'visao-geral' | 'comercial' | 'timeline';

/**
 * Abas da ficha do cliente.
 *
 * A F2 entrega três das sete que a spec pede. As outras quatro (dossiê,
 * contexto criativo, identidade e produtos, operacional) chegam nas F4 e F5 —
 * e só aparecem aqui quando existirem. Barra com item morto é pior que barra
 * curta: ela promete tela que não abre.
 *
 * A aba escolhida vive na URL (`?aba=`), não em `useState`: dá pra recarregar
 * na aba certa e mandar o endereço pra outra pessoa.
 */
const ABAS: ReadonlyArray<{ id: AbaDoCliente; rotulo: string }> = [
    { id: 'visao-geral', rotulo: 'Visão Geral' },
    { id: 'comercial', rotulo: 'Comercial' },
    { id: 'timeline', rotulo: 'Timeline' },
];

export function ehAbaValida(valor: string | null | undefined): valor is AbaDoCliente {
    return !!valor && ABAS.some(a => a.id === valor);
}

interface Props {
    ativa: AbaDoCliente;
    onTrocar: (aba: AbaDoCliente) => void;
}

export const ClientTabs: React.FC<Props> = ({ ativa, onTrocar }) => (
    <div className="tabs" role="tablist" aria-label="Seções do cliente">
        {ABAS.map(aba => (
            <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={ativa === aba.id}
                className={`tab${ativa === aba.id ? ' tab--active' : ''}`}
                onClick={() => onTrocar(aba.id)}
            >
                {aba.rotulo}
            </button>
        ))}
    </div>
);
