/**
 * Testes do guard de envio WhatsApp (T4): kill switch + supressão (LGPD).
 * Ponto único de enforcement — ver whatsapp-send-guard.ts e T4-EXECUCAO.md.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';

let settingsRow: { whatsapp_kill_switch_active: boolean } | null = null;
let suppressionRows: { phone_e164: string }[] = [];

const settingsQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: settingsRow, error: null })),
};

const suppressionQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn(async () => ({ data: suppressionRows, error: null })),
};

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'organization_settings') return settingsQueryBuilder;
    if (table === 'whatsapp_suppression_list') return suppressionQueryBuilder;
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => supabaseMock),
}));

import { checkWhatsAppSendGuard } from './whatsapp-send-guard';

describe('checkWhatsAppSendGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRow = { whatsapp_kill_switch_active: false };
    suppressionRows = [];
  });

  it('bloqueia quando o kill switch da org está ativo', async () => {
    settingsRow = { whatsapp_kill_switch_active: true };

    const result = await checkWhatsAppSendGuard(ORG_ID, '+5531988887777');

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('KILL_SWITCH_ACTIVE');
  });

  it('bloqueia número presente na lista de supressão (comparação por dígitos)', async () => {
    suppressionRows = [{ phone_e164: '+5531988887777' }];

    // "to" chega sem formatação (como o RPC do T2 grava external_contact_id)
    const result = await checkWhatsAppSendGuard(ORG_ID, '5531988887777');

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('SUPPRESSED');
  });

  it('permite envio quando não há kill switch nem supressão', async () => {
    const result = await checkWhatsAppSendGuard(ORG_ID, '+5531988887777');

    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBeUndefined();
  });

  it('kill switch tem prioridade sobre a checagem de supressão (nem consulta a lista)', async () => {
    settingsRow = { whatsapp_kill_switch_active: true };
    suppressionRows = [{ phone_e164: '+5531988887777' }];

    const result = await checkWhatsAppSendGuard(ORG_ID, '+5531988887777');

    expect(result.reasonCode).toBe('KILL_SWITCH_ACTIVE');
    expect(suppressionQueryBuilder.limit).not.toHaveBeenCalled();
  });

  it('permite quando "to" está vazio (nada a checar, ex: reação a mensagem)', async () => {
    const result = await checkWhatsAppSendGuard(ORG_ID, '');

    expect(result.allowed).toBe(true);
  });
});
