import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression: ISSUE — botão "Conectar" nunca gerava nem exibia QR code, e
// depois de corrigir isso, a modal ficava travada em "Gerando QR code..."
// pra sempre quando o endpoint retornava erro — connectMutation.isPending/
// isError não refletiam de forma confiável no render (mutation mockada
// direto escondia essa classe de bug). Estes testes usam a mutation REAL
// (só fetch/supabase mockados) pra pegar isso de novo se voltar a acontecer.
// Found by /qa on 2026-08-15, retestado em produção em 2026-08-17
// Report: .gstack/qa-reports/qa-report-whatsapp-connect-2026-08-15.md

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'channel-1', status: 'waiting_qr', updated_at: '2026-08-15T00:00:00Z' },
        error: null,
      }),
    })),
  },
}));

import { QrConnectModal } from './QrConnectModal';

function renderModal(props: Partial<React.ComponentProps<typeof QrConnectModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <QrConnectModal
        channelId="channel-1"
        channelName="WhatsApp"
        isOpen
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe('QrConnectModal (mutation real, só fetch/supabase mockados)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('mostra loading e depois o QR quando o endpoint responde ok', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ qrCode: 'abc123', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    });

    renderModal();
    expect(screen.getByText(/gerando qr code/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByAltText(/qr code para conectar/i)).toBeInTheDocument();
    });
  });

  it('REGRESSÃO: sai do loading e mostra erro quando o endpoint responde 500 — não trava pra sempre', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Evolution API request failed: 404 Cannot GET /instance/connect' }),
    });

    renderModal();
    expect(screen.getByText(/gerando qr code/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/evolution api request failed/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/gerando qr code/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('botão "tentar novamente" refaz a chamada e pode ter sucesso na segunda tentativa', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'erro temporário' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ qrCode: 'abc123', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
      });

    renderModal();
    await waitFor(() => expect(screen.getByText(/erro temporário/i)).toBeInTheDocument());

    screen.getByRole('button', { name: /tentar novamente/i }).click();

    await waitFor(() => {
      expect(screen.getByAltText(/qr code para conectar/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('não busca QR quando o modal está fechado', () => {
    renderModal({ isOpen: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
