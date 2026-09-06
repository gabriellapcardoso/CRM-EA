import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys, entityCachesExceptDetail } from '@/lib/query/queryKeys';
import {
    clientsService,
    clientContractsService,
    clientEventsService,
    clientTeamService,
    contarAcoesDeIA,
} from '@/lib/supabase/clients';
import type { PaginationState } from '@/types';
import type { ClientContract, ClientsFilters, ClientView } from '@/types/clients';

/**
 * Página da carteira. `keepPreviousData` evita a tela piscar em branco a cada
 * tecla da busca — o painel de indicadores fica estável enquanto a próxima
 * página chega.
 */
export const useClients = (
    pagination: PaginationState,
    filters?: ClientsFilters,
) => {
    const { user, loading: authLoading } = useAuth();
    return useQuery({
        queryKey: queryKeys.clients.paginated(pagination, filters),
        queryFn: async ({ signal }) => {
            const { data, error } = await clientsService.listar(
                {
                    page: pagination.pageIndex,
                    pageSize: pagination.pageSize,
                    search: filters?.search,
                },
                { signal },
            );
            if (error) throw error;
            return data!;
        },
        placeholderData: keepPreviousData,
        staleTime: 60 * 1000,
        enabled: !authLoading && !!user,
    });
};

export const useClient = (companyId?: string) => {
    const { user, loading: authLoading } = useAuth();
    return useQuery({
        queryKey: queryKeys.clients.detail(companyId ?? ''),
        queryFn: async ({ signal }) => {
            const { data, error } = await clientsService.obter(companyId!, { signal });
            if (error) throw error;
            return data;
        },
        staleTime: 60 * 1000,
        enabled: !authLoading && !!user && !!companyId,
    });
};

export const useClientContracts = (companyId?: string) => {
    const { user, loading: authLoading } = useAuth();
    return useQuery({
        queryKey: queryKeys.clients.contracts(companyId ?? ''),
        queryFn: async ({ signal }) => {
            const { data, error } = await clientContractsService.listarPorEmpresa(
                companyId!,
                { signal },
            );
            if (error) throw error;
            return data ?? [];
        },
        staleTime: 60 * 1000,
        enabled: !authLoading && !!user && !!companyId,
    });
};

export const useCreateClient = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (entrada: Parameters<typeof clientsService.criar>[0]) => {
            const { data, error } = await clientsService.criar(entrada);
            if (error) throw error;
            return data!;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('clients') });
            // A empresa também mudou: ela ganhou is_client e as colunas de
            // governança. A lista de empresas do módulo de contatos lê a
            // mesma linha.
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.lists() });
        },
    });
};

export const useUpdateClient = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            companyId,
            campos,
        }: {
            companyId: string;
            campos: Parameters<typeof clientsService.atualizar>[1];
        }) => {
            const { data, error } = await clientsService.atualizar(companyId, campos);
            if (error) throw error;
            return data!;
        },
        // `entityCachesExceptDetail` não cobre `detail(id)` — por construção.
        // Quem LÊ o detalhe precisa que a mutation cancele e escreva nesse
        // cache também, senão um fetch em andamento sobrescreve a escrita
        // otimista depois. Foi a race já achada em useUpdateDeal/useMoveDeal/
        // useUpdateContact; a ficha do cliente (F2) lê este cache.
        onMutate: async ({ companyId, campos }) => {
            await queryClient.cancelQueries({ predicate: entityCachesExceptDetail('clients') });
            await queryClient.cancelQueries({ queryKey: queryKeys.clients.detail(companyId) });

            const anterior = queryClient.getQueryData<ClientView>(
                queryKeys.clients.detail(companyId),
            );
            if (anterior) {
                queryClient.setQueryData<ClientView>(queryKeys.clients.detail(companyId), {
                    ...anterior,
                    ...(campos.name !== undefined && { name: campos.name }),
                    ...(campos.niche !== undefined && { niche: campos.niche ?? undefined }),
                    ...(campos.website !== undefined && { website: campos.website ?? undefined }),
                    ...(campos.industry !== undefined && { industry: campos.industry ?? undefined }),
                    ...(campos.lifecycleStage !== undefined && {
                        lifecycleStage: campos.lifecycleStage,
                    }),
                    ...(campos.category !== undefined && { category: campos.category ?? undefined }),
                    ...(campos.healthScore !== undefined && {
                        healthScore: campos.healthScore ?? undefined,
                    }),
                    ...(campos.isClient !== undefined && { isClient: campos.isClient }),
                });
            }
            return { anterior, companyId };
        },
        onError: (_erro, _vars, contexto) => {
            if (contexto?.anterior) {
                queryClient.setQueryData(
                    queryKeys.clients.detail(contexto.companyId),
                    contexto.anterior,
                );
            }
        },
        onSettled: (_dados, _erro, { companyId }) => {
            queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('clients') });
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(companyId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.companies.lists() });
        },
    });
};

export const useSaveContract = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (
            entrada: Partial<ClientContract> & { companyId: string; startsAt: string },
        ) => {
            const { data, error } = await clientContractsService.salvar(entrada);
            if (error) throw error;
            return data!;
        },
        onSuccess: (_dados, entrada) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clients.contracts(entrada.companyId),
            });
            // O contrato vigente é o que alimenta MRR, renovação e LTV na
            // listagem — ela tem que refazer a conta.
            queryClient.invalidateQueries({ predicate: entityCachesExceptDetail('clients') });
            queryClient.invalidateQueries({
                queryKey: queryKeys.clients.detail(entrada.companyId),
            });
        },
    });
};

// =============================================================================
// F2 — marcos, equipe e ações de IA
// =============================================================================

export const useClientEvents = (companyId?: string) => {
    const { user, loading: authLoading } = useAuth();
    return useQuery({
        queryKey: queryKeys.clients.events(companyId ?? ''),
        queryFn: async ({ signal }) => {
            const { data, error } = await clientEventsService.listar(companyId!, { signal });
            if (error) throw error;
            return data ?? [];
        },
        staleTime: 60 * 1000,
        enabled: !authLoading && !!user && !!companyId,
    });
};

export const useCreateClientEvent = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (entrada: Parameters<typeof clientEventsService.criar>[0]) => {
            const { data, error } = await clientEventsService.criar(entrada);
            if (error) throw error;
            return data!;
        },
        onSuccess: (_dados, entrada) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.events(entrada.companyId) });
        },
    });
};

export const useDeleteClientEvent = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id }: { id: string; companyId: string }) => {
            const { error } = await clientEventsService.excluir(id);
            if (error) throw error;
        },
        onSuccess: (_dados, { companyId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.events(companyId) });
        },
    });
};

export const useClientTeam = (companyId?: string) => {
    const { user, loading: authLoading } = useAuth();
    return useQuery({
        queryKey: queryKeys.clients.team(companyId ?? ''),
        queryFn: async ({ signal }) => {
            const { data, error } = await clientTeamService.listar(companyId!, { signal });
            if (error) throw error;
            return data ?? [];
        },
        staleTime: 60 * 1000,
        enabled: !authLoading && !!user && !!companyId,
    });
};

export const useAssignClientTeam = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (entrada: Parameters<typeof clientTeamService.atribuir>[0]) => {
            const { error } = await clientTeamService.atribuir(entrada);
            if (error) throw error;
        },
        onSuccess: (_dados, entrada) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.team(entrada.companyId) });
        },
    });
};

export const useRemoveClientTeam = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id }: { id: string; companyId: string }) => {
            const { error } = await clientTeamService.remover(id);
            if (error) throw error;
        },
        onSuccess: (_dados, { companyId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.clients.team(companyId) });
        },
    });
};

/** Três consultas encadeadas; `staleTime` alto porque muda devagar. */
export const useClientAIActions = (companyId?: string) => {
    const { user, loading: authLoading } = useAuth();
    return useQuery({
        queryKey: queryKeys.clients.aiActions(companyId ?? ''),
        queryFn: async ({ signal }) => {
            const { data, error } = await contarAcoesDeIA(companyId!, { signal });
            if (error) throw error;
            return data ?? 0;
        },
        staleTime: 5 * 60 * 1000,
        enabled: !authLoading && !!user && !!companyId,
    });
};
