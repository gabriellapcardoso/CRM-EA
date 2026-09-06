'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { useClients, useCreateClient } from '@/lib/query/hooks/useClientsQuery';
import { calcularMetricas } from '@/lib/clients/metricas';
import { estadoDaConsulta } from '@/lib/clients/estadoDaConsulta';
import { ClientsMetricsBar } from './components/ClientsMetricsBar';
import { ClientsList } from './components/ClientsList';
import { ClientFormModal } from './components/ClientFormModal';
import type { ClientFormData } from '@/lib/validations/schemas';
import type { ClientsMetrics } from '@/types/clients';

const METRICAS_VAZIAS: ClientsMetrics = {
    receitaMensal: 0,
    clientesAtivos: 0,
    ltvMedio: 0,
    alertasRenovacao: 0,
    semContrato: 0,
};

const PAGE_SIZE = 25;

/**
 * Carteira de clientes.
 *
 * Estado de tela mora na URL (`?q=` e `?p=`), não em `useState`: uma busca
 * filtrada dá pra recarregar e mandar pra outra pessoa. Mesma decisão da
 * revisão de layout de 2026-09-04.
 *
 * Os indicadores são calculados sobre a PÁGINA carregada, e a tela diz isso.
 * Somar a carteira inteira exige agregação no banco; enquanto ela não existe,
 * o número tem que declarar o próprio recorte em vez de parecer o total.
 */
export const ClientsPage: React.FC = () => {
    const [busca, setBusca] = React.useState('');
    const [buscaAplicada, setBuscaAplicada] = React.useState('');
    const [pagina, setPagina] = React.useState(0);
    const [modalAberto, setModalAberto] = React.useState(false);

    // Lê a URL uma vez no mount. `window.history.pushState` mantém a URL em dia
    // sem remontar a árvore do App Router a cada tecla.
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q') ?? '';
        const p = Number(params.get('p') ?? '0');
        setBusca(q);
        setBuscaAplicada(q);
        setPagina(Number.isFinite(p) && p >= 0 ? p : 0);
    }, []);

    // Debounce da busca. Só volta pra primeira página quando o termo MUDOU de
    // verdade: sem esta comparação, o efeito dispara também na montagem e, 300ms
    // depois, apaga a página que o efeito acima acabou de restaurar do `?p=` —
    // abrir /clients?p=2 terminava sempre na página 1.
    React.useEffect(() => {
        if (busca === buscaAplicada) return;
        const t = setTimeout(() => {
            setBuscaAplicada(busca);
            setPagina(0);
        }, 300);
        return () => clearTimeout(t);
    }, [busca, buscaAplicada]);

    React.useEffect(() => {
        const params = new URLSearchParams();
        if (buscaAplicada) params.set('q', buscaAplicada);
        if (pagina > 0) params.set('p', String(pagina));
        const qs = params.toString();
        window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }, [buscaAplicada, pagina]);

    const { data, isSuccess, isError, error, isFetching } = useClients(
        { pageIndex: pagina, pageSize: PAGE_SIZE },
        { search: buscaAplicada },
    );


    const criar = useCreateClient();

    const clientes = data?.data ?? [];
    // A decisão de qual estado mostrar vive em `estadoDaConsulta`, e não numa
    // combinação de booleanos aqui: `isLoading` do TanStack é
    // `isPending && isFetching`, e o quarto estado (pending sem fetching) é o
    // que faz falha de rede parecer lista vazia. Ver a função.
    const estado = estadoDaConsulta({
        isSuccess,
        isError,
        isFetching,
        temDados: !!data,
        quantidade: clientes.length,
        temFiltro: !!buscaAplicada,
    });
    const total = data?.total ?? 0;
    const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const metricas = React.useMemo(
        () => (clientes.length ? calcularMetricas(clientes) : METRICAS_VAZIAS),
        [clientes],
    );

    // `mutateAsync` rejeita quando a criação falha. Sem o catch a exceção sobe
    // pelo handler do formulário e vira rejeição não tratada: o modal fica
    // aberto, sem mensagem, e a pessoa não sabe se tenta de novo. O estado de
    // erro da mutation é mostrado no modal.
    const aoCadastrar = async (dados: ClientFormData) => {
        try {
            await criar.mutateAsync({
                name: dados.name,
                niche: dados.niche || undefined,
                industry: dados.industry || undefined,
                website: dados.website || undefined,
                lifecycleStage: dados.lifecycleStage,
                category: dados.category || undefined,
                healthScore: dados.healthScore ? Number(dados.healthScore) : undefined,
            });
            setModalAberto(false);
        } catch {
            // A mensagem sai por `criar.error` no modal; nada a fazer aqui.
        }
    };

    return (
        <div className="screen__inner screen__inner--wide">
            <section className="section-card section-card--flush">
                <ClientsMetricsBar metricas={metricas} carregado={isSuccess} />
                <p className="meta" style={{ marginTop: 8 }}>
                    {!isSuccess
                        ? 'Os números aparecem quando a carteira carregar.'
                        : total > PAGE_SIZE
                            ? `Calculado sobre os ${clientes.length} clientes desta página, de ${total} na carteira.`
                            : total === 1
                                ? 'Calculado sobre o único cliente da carteira.'
                                : `Calculado sobre os ${total} clientes da carteira.`}
                </p>
            </section>

            <section className="section-card">
                <div className="list-toolbar">
                    <label className="field" style={{ flex: 1, minWidth: 200 }}>
                        <span className="sr-only">Buscar cliente</span>
                        <input
                            className="input"
                            type="search"
                            placeholder="Buscar por nome"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                        />
                    </label>
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => setModalAberto(true)}
                    >
                        <Plus size={15} aria-hidden /> Novo Cliente
                    </button>
                </div>

                {estado === 'carregando' && <p className="muted">Carregando a carteira…</p>}

                {estado === 'erro' && (
                    <p className="muted">
                        Não foi possível carregar a carteira: {(error as Error)?.message}
                    </p>
                )}

                {estado === 'indefinido' && (
                    <p className="muted">
                        A carteira não chegou. Confira a conexão e recarregue a página —
                        isto não quer dizer que não há clientes.
                    </p>
                )}

                {estado === 'vazio-por-filtro' && (
                    <p className="muted">Nenhum cliente com “{buscaAplicada}” no nome.</p>
                )}

                {estado === 'vazio' && (
                    <p className="muted">
                        Nenhum cliente cadastrado ainda. Comece por “Novo Cliente”.
                    </p>
                )}

                {estado === 'com-dados' && (
                    <>
                        <ClientsList clientes={clientes} />
                        {totalPaginas > 1 && (
                            <div className="list-toolbar" style={{ justifyContent: 'space-between' }}>
                                <button
                                    type="button"
                                    className="btn btn--ghost"
                                    disabled={pagina === 0}
                                    onClick={() => setPagina(p => Math.max(0, p - 1))}
                                >
                                    Anterior
                                </button>
                                <span className="meta">
                                    Página {pagina + 1} de {totalPaginas}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn--ghost"
                                    disabled={pagina + 1 >= totalPaginas}
                                    onClick={() => setPagina(p => p + 1)}
                                >
                                    Próxima
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>

            <ClientFormModal
                isOpen={modalAberto}
                onClose={() => setModalAberto(false)}
                onSubmit={aoCadastrar}
                salvando={criar.isPending}
                erro={criar.isError ? (criar.error as Error)?.message : undefined}
            />
        </div>
    );
};

export default ClientsPage;
