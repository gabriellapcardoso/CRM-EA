/**
 * Mídia sem arquivo tem que dizer que não chegou.
 *
 * O webhook da Evolution grava `mediaUrl: ""` fixo para imagem, áudio, vídeo,
 * documento e figurinha — a URL que o provider manda nunca é lida, e nenhum
 * provider implementa `downloadMedia` (ver `TODOS.md`, P1).
 *
 * O efeito na tela era pior que a ausência: o `AudioPlayer` desenhava um player
 * COMPLETO — botão de play, forma de onda, cronômetro `0:00` — com o botão
 * apenas `disabled`. Em produção, o áudio de 56s de um lead real apareceu assim
 * em 2026-09-03. Controle desabilitado não é aviso: quem atende clica, nada
 * acontece, e conclui que a interface travou — sem nunca descobrir que precisa
 * abrir o WhatsApp para ouvir.
 *
 * Estes testes afirmam as duas metades: aparece o aviso, e NÃO aparece o
 * controle morto. A segunda metade é a que pega uma regressão de volta, porque
 * é fácil adicionar o texto e deixar o player embaixo.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/query/hooks/useMessagingMessagesQuery', () => ({
  useSendMessage: () => ({ mutate: vi.fn() }),
  useSendDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('./ChannelIndicator', () => ({ ChannelIndicator: () => null }));

import { MessageBubble } from './MessageBubble';
import type { MessagingMessage } from '@/lib/messaging/types';

function mensagem(over: Partial<MessagingMessage> = {}): MessagingMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    direction: 'inbound',
    status: 'delivered',
    contentType: 'audio',
    content: { type: 'audio', mediaUrl: '' },
    createdAt: '2026-09-03T20:46:54.000Z',
    senderName: 'Carlos Alberto',
    metadata: {},
    ...over,
  } as MessagingMessage;
}

function renderizar(msg: MessagingMessage) {
  return render(
    <ul>
      <MessageBubble message={msg} conversationId="conv-1" />
    </ul>,
  );
}

describe('mídia recebida sem arquivo', () => {
  it('áudio vazio avisa em vez de desenhar um player que não toca', () => {
    renderizar(mensagem());

    expect(screen.getByText(/Áudio não disponível/i)).toBeInTheDocument();
    // A metade que importa: o controle morto sumiu.
    expect(screen.queryByRole('button', { name: /Reproduzir|Pausar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /áudio/i })).not.toBeInTheDocument();
  });

  it('o aviso diz onde a pessoa consegue ouvir — senão é só uma constatação', () => {
    renderizar(mensagem());

    expect(screen.getByText(/Abra a conversa no WhatsApp para ouvir/i)).toBeInTheDocument();
  });

  it('áudio COM arquivo continua mostrando o player — o aviso não pode engolir o caso bom', () => {
    renderizar(
      mensagem({ content: { type: 'audio', mediaUrl: 'https://exemplo.com/a.ogg' } as never }),
    );

    expect(screen.getByRole('button', { name: /Reproduzir/i })).toBeInTheDocument();
    expect(screen.queryByText(/não disponível/i)).not.toBeInTheDocument();
  });

  it('imagem vazia avisa em vez de bolha em branco', () => {
    renderizar(
      mensagem({ contentType: 'image', content: { type: 'image', mediaUrl: '' } as never }),
    );

    expect(screen.getByText(/Imagem não disponível/i)).toBeInTheDocument();
  });

  it('documento vazio avisa em vez de não renderizar nada', () => {
    renderizar(
      mensagem({
        contentType: 'document',
        content: { type: 'document', mediaUrl: '', fileName: 'proposta.pdf' } as never,
      }),
    );

    expect(screen.getByText(/Documento não disponível/i)).toBeInTheDocument();
  });

  it('vídeo vazio avisa em vez de escrever "Vídeo" sobre coisa nenhuma', () => {
    renderizar(
      mensagem({ contentType: 'video', content: { type: 'video', mediaUrl: '' } as never }),
    );

    expect(screen.getByText(/Vídeo não disponível/i)).toBeInTheDocument();
  });

  it('legenda da imagem sobrevive ao aviso — é conteúdo que o lead escreveu', () => {
    renderizar(
      mensagem({
        contentType: 'image',
        content: { type: 'image', mediaUrl: '', caption: 'segue a referência' } as never,
      }),
    );

    expect(screen.getByText(/Imagem não disponível/i)).toBeInTheDocument();
    expect(screen.getByText('segue a referência')).toBeInTheDocument();
  });
});
