import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression: ISSUE — botão "Conectar" nunca chamava a API de mensageria de verdade
// Found by /qa on 2026-08-15, revisado em /plan-eng-review
// Report: .gstack/qa-reports/qa-report-whatsapp-connect-2026-08-15.md

const mockSingle = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    })),
  },
}));

import {
  useConnectChannelMutation,
  useChannelConnectionStatus,
  useDisconnectChannelMutation,
} from './useChannelsQuery';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useConnectChannelMutation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('retorna qrCode e expiresAt em caso de sucesso', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ qrCode: 'abc123', expiresAt: '2026-08-16T00:00:00Z' }),
    });

    const { result } = renderHook(() => useConnectChannelMutation(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('channel-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ qrCode: 'abc123', expiresAt: '2026-08-16T00:00:00Z' });
    expect(global.fetch).toHaveBeenCalledWith('/api/messaging/channels/channel-1/qr-code', { method: 'POST' });
  });

  it('lança erro com a mensagem do backend quando a resposta não é ok', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Channel is already connected' }),
    });

    const { result } = renderHook(() => useConnectChannelMutation(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('channel-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Channel is already connected');
  });
});

describe('useDisconnectChannelMutation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('retorna providerDisconnected e warning quando o provider falha mas o canal foi marcado desconectado', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, providerDisconnected: false, warning: 'timeout' }),
    });

    const { result } = renderHook(() => useDisconnectChannelMutation(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('channel-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ success: true, providerDisconnected: false, warning: 'timeout' });
    expect(global.fetch).toHaveBeenCalledWith('/api/messaging/channels/channel-1/disconnect', { method: 'POST' });
  });

  it('lança erro com a mensagem do backend quando a resposta não é ok', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Channel not found' }),
    });

    const { result } = renderHook(() => useDisconnectChannelMutation(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('channel-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Channel not found');
  });

  it('usa mensagem padrão quando o corpo do erro não é JSON válido', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useDisconnectChannelMutation(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('channel-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Failed to disconnect channel');
  });
});

describe('useChannelConnectionStatus', () => {
  beforeEach(() => {
    mockSingle.mockReset();
  });

  it('busca status quando enabled=true', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'channel-1', status: 'waiting_qr', updated_at: '2026-08-15T00:00:00Z' },
      error: null,
    });

    const { result } = renderHook(() => useChannelConnectionStatus('channel-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.status).toBe('waiting_qr');
  });

  it('não busca quando enabled=false', () => {
    const { result } = renderHook(() => useChannelConnectionStatus('channel-1', false), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSingle).not.toHaveBeenCalled();
  });
});
