import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression: ISSUE — botão "Conectar" nunca gerava nem exibia QR code
// Found by /qa on 2026-08-15, revisado em /plan-eng-review
// Report: .gstack/qa-reports/qa-report-whatsapp-connect-2026-08-15.md

const mockMutate = vi.fn();
let mockConnectMutationState: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
} = { isPending: false, isError: false, error: null };
let mockStatusData: { id: string; status: string; updated_at: string } | undefined;

vi.mock('@/lib/query/hooks/useChannelsQuery', () => ({
  useConnectChannelMutation: () => ({
    mutate: mockMutate,
    ...mockConnectMutationState,
  }),
  useChannelConnectionStatus: () => ({
    data: mockStatusData,
  }),
}));

import { QrConnectModal } from './QrConnectModal';

function renderModal(props: Partial<React.ComponentProps<typeof QrConnectModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('QrConnectModal', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockConnectMutationState = { isPending: false, isError: false, error: null };
    mockStatusData = undefined;
  });

  it('busca o QR automaticamente ao abrir', () => {
    renderModal();
    expect(mockMutate).toHaveBeenCalledWith('channel-1', expect.any(Object));
  });

  it('mostra loading enquanto o QR está sendo gerado', () => {
    mockConnectMutationState = { isPending: true, isError: false, error: null };
    renderModal();
    expect(screen.getByText(/gerando qr code/i)).toBeInTheDocument();
  });

  it('mostra a imagem do QR quando a mutation resolve', () => {
    mockMutate.mockImplementation((_id, { onSuccess }) => {
      onSuccess({ qrCode: 'abc123', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    });
    renderModal();
    const img = screen.getByAltText(/qr code para conectar/i) as HTMLImageElement;
    expect(img.src).toContain('data:image/png;base64,abc123');
  });

  it('normaliza QR que já vem como data URL sem duplicar o prefixo', () => {
    mockMutate.mockImplementation((_id, { onSuccess }) => {
      onSuccess({
        qrCode: 'data:image/jpeg;base64,xyz789',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    });
    renderModal();
    const img = screen.getByAltText(/qr code para conectar/i) as HTMLImageElement;
    expect(img.src).toBe('data:image/jpeg;base64,xyz789');
  });

  it('mostra erro inline com botão de retry quando a mutation falha', () => {
    mockConnectMutationState = { isPending: false, isError: true, error: new Error('Evolution API fora do ar') };
    renderModal();
    expect(screen.getByText('Evolution API fora do ar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('mostra estado de expirado e permite gerar novo QR', () => {
    vi.useFakeTimers();
    mockMutate.mockImplementation((_id, { onSuccess }) => {
      onSuccess({ qrCode: 'abc123', expiresAt: new Date(Date.now() - 1000).toISOString() });
    });
    renderModal();
    expect(screen.getByText(/qr code expirado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar novo qr code/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('fecha o modal sozinho quando o status vira connected', async () => {
    mockMutate.mockImplementation((_id, { onSuccess }) => {
      onSuccess({ qrCode: 'abc123', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    });
    mockStatusData = { id: 'channel-1', status: 'connected', updated_at: new Date().toISOString() };
    const { onClose } = renderModal();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('não fecha o modal enquanto o status continua waiting_qr', () => {
    mockMutate.mockImplementation((_id, { onSuccess }) => {
      onSuccess({ qrCode: 'abc123', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    });
    mockStatusData = { id: 'channel-1', status: 'waiting_qr', updated_at: new Date().toISOString() };
    const { onClose } = renderModal();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('não busca QR quando o modal está fechado', () => {
    renderModal({ isOpen: false });
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
