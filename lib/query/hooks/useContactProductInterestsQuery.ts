/**
 * TanStack Query hooks for contact_product_interests (interesses de produto
 * de um contato, pré-deal).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { contactProductInterestsService } from '@/lib/supabase';
import type { ContactProductInterest } from '@/types';

export const useContactProductInterests = (contactId: string | undefined) => {
  return useQuery<ContactProductInterest[]>({
    queryKey: queryKeys.contactProductInterests.byContact(contactId || ''),
    queryFn: async () => {
      const { data, error } = await contactProductInterestsService.listByContact(contactId!);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
    staleTime: 30 * 1000,
  });
};

export const useCreateContactProductInterest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, productId, observacao }: { contactId: string; productId: string; observacao?: string }) => {
      const { data, error } = await contactProductInterestsService.create(contactId, productId, observacao);
      if (error) throw error;
      return data!;
    },
    // setQueryData em vez de invalidateQueries: o refetch mount-triggered
    // (refetchOnMount: true) pode ainda estar em voo quando o usuário cria um
    // interesse rápido — invalidateQueries reaproveitaria essa fetch já em
    // andamento (dedupe do TanStack Query) e sobrescreveria o cache com dados
    // de ANTES da criação. Atualizar direto a partir da resposta da própria
    // mutation elimina essa corrida por completo.
    onSuccess: (data, variables) => {
      queryClient.setQueryData<ContactProductInterest[]>(
        queryKeys.contactProductInterests.byContact(variables.contactId),
        (old = []) => [data, ...old]
      );
    },
  });
};

export const useDeleteContactProductInterest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; contactId: string }) => {
      const { error } = await contactProductInterestsService.remove(id);
      if (error) throw error;
      return id;
    },
    // Mesmo motivo do create: atualiza o cache direto, sem re-fetch sujeito
    // a corrida com o fetch de mount ainda em andamento.
    onSuccess: (id, variables) => {
      queryClient.setQueryData<ContactProductInterest[]>(
        queryKeys.contactProductInterests.byContact(variables.contactId),
        (old = []) => old.filter(i => i.id !== id)
      );
    },
  });
};
