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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactProductInterests.byContact(variables.contactId) });
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
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactProductInterests.byContact(variables.contactId) });
    },
  });
};
