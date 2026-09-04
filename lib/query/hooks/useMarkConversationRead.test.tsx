/**
 * Guarda do "abri a conversa e o número não sai".
 *
 * `onMutate` escrevia otimisticamente com o prefixo
 * `queryKeys.messagingConversations.all`, que casa com TODO cache da entidade —
 * inclusive `detail(id)`, que guarda um objeto, e `unreadCount()`, que guarda um
 * número. O updater chamava `old.map` direto: TypeError dentro do onMutate.
 *
 * O detalhe que transforma isso num bug silencioso: no TanStack Query, onMutate
 * que lança **aborta a mutation** — a `mutationFn` nunca roda. O banco seguia
 * com `unread_count` intacto, a badge sumia por um frame (a escrita otimista da
 * primeira lista, antes do throw) e voltava no refetch seguinte. Em produção,
 * 7 conversas ficaram marcadas como não lidas depois de abertas uma a uma.
 *
 * Por isso a asserção central é "a mutationFn rodou", não "o cache mudou": o
 * cache mudava um pouco mesmo com o bug.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const updateEq = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq: updateEq }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ update })) },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { organization_id: 'org-1' }, loading: false }),
}));

import { useMarkConversationRead } from './useConversationsQuery';
import { queryKeys } from '@/lib/query';

const CONVERSA = 'conv-1';

function semear() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Uma lista (array), o detalhe (objeto) e o contador global (número) — os três
  // formatos que o prefixo da entidade alcança de uma vez.
  queryClient.setQueryData(queryKeys.messagingConversations.filtered(), [
    { id: CONVERSA, unreadCount: 5 },
    { id: 'conv-2', unreadCount: 1 },
  ]);
  queryClient.setQueryData(queryKeys.messagingConversations.detail(CONVERSA), {
    id: CONVERSA,
    unreadCount: 5,
  });
  queryClient.setQueryData(queryKeys.messagingConversations.unreadCount(), 6);

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('useMarkConversationRead', () => {
  beforeEach(() => {
    update.mockClear();
    updateEq.mockClear();
  });

  it('chega a gravar unread_count = 0 no banco mesmo com detail e unreadCount em cache', async () => {
    const { wrapper } = semear();
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper });

    await act(async () => {
      result.current.mutate(CONVERSA);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(update).toHaveBeenCalledWith({ unread_count: 0 });
    expect(updateEq).toHaveBeenCalledWith('id', CONVERSA);
  });

  it('zera o não-lido na lista sem estragar os caches que não são array', async () => {
    const { queryClient, wrapper } = semear();
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper });

    await act(async () => {
      result.current.mutate(CONVERSA);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const lista = queryClient.getQueryData<Array<{ id: string; unreadCount: number }>>(
      queryKeys.messagingConversations.filtered(),
    );
    expect(lista?.find((c) => c.id === CONVERSA)?.unreadCount).toBe(0);
    // A outra conversa não foi tocada.
    expect(lista?.find((c) => c.id === 'conv-2')?.unreadCount).toBe(1);
    // O contador global continua sendo um número, não virou array nem undefined.
    expect(typeof queryClient.getQueryData(queryKeys.messagingConversations.unreadCount())).toBe(
      'number',
    );
  });

  it('zera também o detalhe — é dele que a conversa aberta lê', async () => {
    const { queryClient, wrapper } = semear();
    const { result } = renderHook(() => useMarkConversationRead(), { wrapper });

    await act(async () => {
      result.current.mutate(CONVERSA);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const detalhe = queryClient.getQueryData<{ unreadCount: number }>(
      queryKeys.messagingConversations.detail(CONVERSA),
    );
    expect(detalhe?.unreadCount).toBe(0);
  });
});
