import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MessagingChannel } from '@/lib/messaging/types';

// Regression: ISSUE — botão "Conectar" chamava só onToggle (UPDATE de status
// direto no banco) em vez de abrir o fluxo de QR code, e fazia isso pra
// QUALQUER provider — incluindo canais que não são WhatsApp.
// Found by /qa on 2026-08-15, revisado em /plan-eng-review
// Report: .gstack/qa-reports/qa-report-whatsapp-connect-2026-08-15.md

const mockConnectMutate = vi.fn();

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/lib/query/hooks/useChannelsQuery', () => ({
  useConnectChannelMutation: () => ({ mutate: mockConnectMutate, isPending: false, isError: false, error: null }),
  useChannelConnectionStatus: () => ({ data: undefined }),
}));

import { ChannelCard } from './ChannelsSection';

function makeChannel(overrides: Partial<MessagingChannel> = {}): MessagingChannel {
  return {
    id: 'channel-1',
    organizationId: 'org-1',
    businessUnitId: 'unit-1',
    channelType: 'whatsapp',
    provider: 'evolution',
    externalIdentifier: 'test-instance',
    name: 'WhatsApp',
    credentials: {},
    settings: {},
    status: 'disconnected',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(channel: MessagingChannel, onToggle = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChannelCard
        channel={channel}
        boards={[]}
        onEdit={vi.fn()}
        onToggle={onToggle}
        onDelete={vi.fn()}
        onRoutingChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  return { onToggle };
}

describe('ChannelCard — botão Conectar', () => {
  beforeEach(() => {
    mockConnectMutate.mockReset();
  });

  it('abre o fluxo de QR em vez de chamar onToggle pra canal WhatsApp Evolution', () => {
    const { onToggle } = renderCard(makeChannel({ provider: 'evolution', status: 'disconnected' }));
    fireEvent.click(screen.getByRole('button', { name: /conectar/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(mockConnectMutate).toHaveBeenCalledWith('channel-1', expect.any(Object));
  });

  it('abre o fluxo de QR pra canal Z-API também', () => {
    const { onToggle } = renderCard(makeChannel({ provider: 'z-api', status: 'disconnected' }));
    fireEvent.click(screen.getByRole('button', { name: /conectar/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(mockConnectMutate).toHaveBeenCalled();
  });

  it('NÃO abre QR pra canal não-WhatsApp — mantém onToggle antigo (sem regressão)', () => {
    const { onToggle } = renderCard(
      makeChannel({ channelType: 'instagram', provider: 'meta-cloud', status: 'disconnected' })
    );
    fireEvent.click(screen.getByRole('button', { name: /conectar/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(mockConnectMutate).not.toHaveBeenCalled();
  });

  it('permite clicar Conectar num canal WhatsApp Evolution com status connecting (antes ficava desabilitado)', () => {
    renderCard(makeChannel({ provider: 'evolution', status: 'connecting' }));
    const button = screen.getByRole('button', { name: /conectar/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(mockConnectMutate).toHaveBeenCalled();
  });

  it('botão Desconectar (canal já conectado) continua chamando onToggle sem mudança', () => {
    const { onToggle } = renderCard(makeChannel({ provider: 'evolution', status: 'connected' }));
    fireEvent.click(screen.getByRole('button', { name: /desconectar/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(mockConnectMutate).not.toHaveBeenCalled();
  });
});
