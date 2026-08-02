import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', role: 'admin', email: 'test@example.com', organization_id: 'org-1' },
  }),
}));

const addToastMock = vi.fn();
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

const rpcMock = vi.fn();
const selectChain = {
  order: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
    })),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { DealStageEventsSection } from './DealStageEventsSection';

const eventoFalhou = {
  id: 'evt-1',
  deal_id: 'deal-1',
  external_event_id: 'deal:deal-1:topou:1',
  contador: 1,
  status: 'falhou' as const,
  attempt_count: 2,
  response_status: 500,
  erro: 'HTTP 500',
  created_at: '2026-08-01T10:00:00.000Z',
  sent_at: null,
  last_attempt_at: '2026-08-01T10:05:00.000Z',
};

const eventoEnviado = {
  ...eventoFalhou,
  id: 'evt-2',
  external_event_id: 'deal:deal-1:topou:2',
  status: 'enviado' as const,
  response_status: 200,
  erro: null,
  sent_at: '2026-08-01T10:10:00.000Z',
};

describe('DealStageEventsSection', () => {
  beforeEach(() => {
    addToastMock.mockReset();
    rpcMock.mockReset();
    selectChain.limit.mockReset();
  });

  it('lista eventos e mostra botão "Reenviar" só nos que falharam', async () => {
    selectChain.limit.mockResolvedValue({ data: [eventoFalhou, eventoEnviado], error: null });

    render(<DealStageEventsSection />);

    await waitFor(() => {
      expect(screen.getByText('deal:deal-1:topou:1')).toBeInTheDocument();
    });
    expect(screen.getByText('deal:deal-1:topou:2')).toBeInTheDocument();

    const botoesReenviar = screen.getAllByRole('button', { name: /reenviar/i });
    expect(botoesReenviar).toHaveLength(1);
  });

  it('sem eventos, mostra mensagem vazia e nenhum botão de reenviar', async () => {
    selectChain.limit.mockResolvedValue({ data: [], error: null });

    render(<DealStageEventsSection />);

    await waitFor(() => {
      expect(screen.getByText(/nenhum deal entrou/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
  });

  it('clicar em "Reenviar" chama a RPC retry_deal_stage_event com o id do evento e recarrega', async () => {
    selectChain.limit.mockResolvedValue({ data: [eventoFalhou], error: null });
    rpcMock.mockResolvedValue({ error: null });

    render(<DealStageEventsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reenviar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reenviar/i }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('retry_deal_stage_event', { p_event_id: 'evt-1' });
    });
    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(expect.stringMatching(/reciclado/i), 'success');
    });
    // Recarrega a lista depois do reenvio (2ª chamada ao select().order().limit())
    expect(selectChain.limit).toHaveBeenCalledTimes(2);
  });

  it('mostra erro no toast quando a RPC falha', async () => {
    selectChain.limit.mockResolvedValue({ data: [eventoFalhou], error: null });
    rpcMock.mockResolvedValue({ error: { message: 'Not authorized' } });

    render(<DealStageEventsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reenviar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reenviar/i }));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith('Not authorized', 'error');
    });
  });
});
