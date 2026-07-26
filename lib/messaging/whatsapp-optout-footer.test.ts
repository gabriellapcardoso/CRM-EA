/**
 * Testes do rodapé de opt-out WhatsApp (T4): só na 1ª mensagem outbound
 * da conversa. Ver whatsapp-optout-footer.ts e T4-EXECUCAO.md.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';

let outboundDeliveredCount: number | null = 0;
let queryError: { message: string } | null = null;

const messagesQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn(async () => ({ count: outboundDeliveredCount, error: queryError })),
};

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'messaging_messages') return messagesQueryBuilder;
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => supabaseMock),
}));

import {
  WHATSAPP_OPT_OUT_FOOTER,
  isFirstOutboundMessage,
  withOptOutFooterIfFirstMessage,
} from './whatsapp-optout-footer';

describe('isFirstOutboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outboundDeliveredCount = 0;
    queryError = null;
  });

  it('true quando não há nenhuma mensagem outbound entregue ainda', async () => {
    outboundDeliveredCount = 0;

    const result = await isFirstOutboundMessage(CONVERSATION_ID);

    expect(result).toBe(true);
  });

  it('false quando já existe pelo menos 1 mensagem outbound entregue', async () => {
    outboundDeliveredCount = 1;

    const result = await isFirstOutboundMessage(CONVERSATION_ID);

    expect(result).toBe(false);
  });

  it('false em caso de erro na query (na dúvida, não duplica o rodapé)', async () => {
    queryError = { message: 'boom' };

    const result = await isFirstOutboundMessage(CONVERSATION_ID);

    expect(result).toBe(false);
  });
});

describe('withOptOutFooterIfFirstMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outboundDeliveredCount = 0;
    queryError = null;
  });

  it('anexa o rodapé na 1ª mensagem da conversa', async () => {
    outboundDeliveredCount = 0;

    const result = await withOptOutFooterIfFirstMessage(CONVERSATION_ID, 'Olá! Tudo bem?');

    expect(result).toContain('Olá! Tudo bem?');
    expect(result).toContain(WHATSAPP_OPT_OUT_FOOTER);
  });

  it('NÃO anexa o rodapé a partir da 2ª mensagem em diante', async () => {
    outboundDeliveredCount = 1;

    const result = await withOptOutFooterIfFirstMessage(CONVERSATION_ID, 'Só confirmando aqui.');

    expect(result).toBe('Só confirmando aqui.');
    expect(result).not.toContain(WHATSAPP_OPT_OUT_FOOTER);
  });
});
