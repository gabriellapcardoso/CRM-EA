/**
 * Botão "Reenviar" em mensagem que falhou.
 *
 * `useRetryMessage` e `POST /api/messaging/messages/[messageId]/retry` existiam
 * há tempos e nenhum componente os chamava. Mensagem falha aparecia na tela com
 * o motivo do erro e nenhuma saída: a única alternativa era redigitar o texto à
 * mão.
 *
 * O custo apareceu em 2026-09-03. Três respostas da IA para leads reais foram
 * barradas pelo kill switch (comportamento correto), ficaram em `failed`, e
 * depois de destravar o envio não havia como entregá-las — a causa da falha
 * tinha sumido e o texto continuava preso.
 *
 * É a terceira vez nesta base que capacidade implementada sem call site se
 * comporta como capacidade ausente (ver `configureWebhook`, `useRetryMessage`).
 * Ver `DESAFIOS.md`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const retryMutate = vi.fn();
const sendDraftMutate = vi.fn();

vi.mock('@/lib/query/hooks/useMessagingMessagesQuery', () => ({
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useSendDraft: () => ({ mutate: sendDraftMutate, isPending: false }),
  useRetryMessage: () => ({ mutate: retryMutate, isPending: false }),
}));

vi.mock('@/lib/query/hooks', () => ({
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MessageBubble } from './MessageBubble';

const BASE = {
  id: 'msg-1',
  conversationId: 'conv-1',
  direction: 'outbound' as const,
  contentType: 'text' as const,
  content: { text: 'Olá! O que te trouxe até a gente hoje?' },
  createdAt: new Date('2026-09-03T17:53:02Z').toISOString(),
  reactions: [],
};

function renderBolha(over: Record<string, unknown> = {}) {
  return render(
    <MessageBubble
      message={{ ...BASE, ...over } as never}
      conversationId="conv-1"
    />,
  );
}

beforeEach(() => {
  retryMutate.mockClear();
  sendDraftMutate.mockClear();
});

describe('MessageBubble — reenviar mensagem que falhou', () => {
  it('mostra o botão Reenviar quando a mensagem está failed', () => {
    renderBolha({ status: 'failed', errorMessage: 'Envio de WhatsApp desativado (kill switch ativo).' });

    expect(screen.getByRole('button', { name: /reenviar/i })).toBeInTheDocument();
  });

  it('continua mostrando o motivo da falha junto do botão', () => {
    renderBolha({ status: 'failed', errorMessage: 'Envio de WhatsApp desativado (kill switch ativo).' });

    expect(screen.getByText(/kill switch ativo/i)).toBeInTheDocument();
  });

  it('mostra o botão mesmo sem errorMessage — falha sem motivo também precisa de saída', () => {
    renderBolha({ status: 'failed' });

    expect(screen.getByRole('button', { name: /reenviar/i })).toBeInTheDocument();
  });

  it('clicar chama o retry com o id da mensagem', async () => {
    const user = userEvent.setup();
    renderBolha({ status: 'failed', errorMessage: 'erro' });

    await user.click(screen.getByRole('button', { name: /reenviar/i }));

    expect(retryMutate).toHaveBeenCalledTimes(1);
    expect(retryMutate).toHaveBeenCalledWith('msg-1');
  });

  it.each(['sent', 'delivered', 'read', 'pending'])(
    'não mostra Reenviar em mensagem com status %s',
    (status) => {
      renderBolha({ status });

      expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
    },
  );
});
