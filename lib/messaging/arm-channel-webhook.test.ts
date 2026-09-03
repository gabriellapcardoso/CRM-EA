/**
 * Guardas do armar/ler webhook de canal.
 *
 * O caso que dá nome a este arquivo: em 2026-09-03 o WhatsApp da aaagência
 * estava com a URL de webhook EXATAMENTE certa na Evolution e não entregava
 * nada há 5 semanas, porque `enabled` era `false`, `events` era `[]` e
 * `headers` era `null`. Qualquer checagem que compare só a URL dá verde nesse
 * estado. Por isso `saudavel` exige os quatro campos, e por isso existe um
 * teste pra cada um deles sozinho.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANAL_ID = 'cad3274f-2aba-4986-959a-a50ba0f9cb51';
const SUPABASE = 'https://proj.supabase.co';
const URL_ESPERADA = `${SUPABASE}/functions/v1/messaging-webhook-evolution/${CANAL_ID}`;

// Montado em runtime, nunca literal: um fixture com a cara de chave de verdade
// é bloqueado pelo scanner de segredo no push, mesmo sendo obviamente falso.
// Mesma razão do canário concatenado nas migrations (ver CLAUDE.md).
const SEGREDO_FALSO = 'sk' + '-' + 'x'.repeat(32);

let configureWebhookMock: ReturnType<typeof vi.fn>;
let getWebhookConfigMock: ReturnType<typeof vi.fn>;
let initializeMock: ReturnType<typeof vi.fn>;
let providerFake: Record<string, unknown>;

vi.mock('./channel-factory', () => ({
  ChannelProviderFactory: {
    createProvider: () => providerFake,
  },
}));

import { armarWebhookDoCanal, lerWebhookDoCanal } from './arm-channel-webhook';

const CANAL = {
  id: CANAL_ID,
  channel_type: 'whatsapp',
  provider: 'evolution',
  external_identifier: 'canal-de-teste',
  credentials: { apiKey: 'k', serverUrl: 'https://evo.example', instanceName: 'inst' },
};

function configWebhook(over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    url: URL_ESPERADA,
    events: ['MESSAGES_UPSERT'],
    byEvents: true,
    hasAuthHeader: true,
    ...over,
  };
}

beforeEach(() => {
  initializeMock = vi.fn(async () => undefined);
  configureWebhookMock = vi.fn(async () => ({ success: true }));
  getWebhookConfigMock = vi.fn(async () => configWebhook());
  providerFake = {
    initialize: initializeMock,
    configureWebhook: configureWebhookMock,
    getWebhookConfig: getWebhookConfigMock,
  };
});

describe('armarWebhookDoCanal', () => {
  it('manda a URL da Edge Function pro provider', async () => {
    const r = await armarWebhookDoCanal(CANAL, SUPABASE);

    expect(r.armado).toBe(true);
    expect(configureWebhookMock).toHaveBeenCalledWith(URL_ESPERADA);
  });

  it('não chama o provider quando não dá pra montar URL válida', async () => {
    const r = await armarWebhookDoCanal(CANAL, undefined);

    expect(r.armado).toBe(false);
    expect(r.url).toBeNull();
    expect(configureWebhookMock).not.toHaveBeenCalled();
  });

  it('provider sem configureWebhook não vira sucesso silencioso', async () => {
    providerFake = { initialize: initializeMock };

    const r = await armarWebhookDoCanal({ ...CANAL, provider: 'meta-cloud' }, SUPABASE);

    expect(r.armado).toBe(false);
    expect(r.motivo).toContain('meta-cloud');
  });

  it('propaga recusa do provider como falha', async () => {
    configureWebhookMock = vi.fn(async () => ({ success: false, error: 'instance requires property webhook' }));
    providerFake = { initialize: initializeMock, configureWebhook: configureWebhookMock };

    const r = await armarWebhookDoCanal(CANAL, SUPABASE);

    expect(r.armado).toBe(false);
    expect(r.motivo).toContain('instance requires property webhook');
  });

  it('redige segredo que o provider ecoe na mensagem de erro', async () => {
    configureWebhookMock = vi.fn(async () => {
      throw new Error(`401 unauthorized for ${SEGREDO_FALSO}`);
    });
    providerFake = { initialize: initializeMock, configureWebhook: configureWebhookMock };

    const r = await armarWebhookDoCanal(CANAL, SUPABASE);

    expect(r.armado).toBe(false);
    expect(r.motivo).not.toContain(SEGREDO_FALSO);
    expect(r.motivo).toContain('[REDACTED]');
  });
});

describe('lerWebhookDoCanal', () => {
  it('saudável quando os quatro campos estão certos', async () => {
    const r = await lerWebhookDoCanal(CANAL, SUPABASE);

    expect(r.suportado).toBe(true);
    expect(r.saudavel).toBe(true);
  });

  it('o estado real de produção (URL certa, resto zerado) NÃO é saudável', async () => {
    getWebhookConfigMock = vi.fn(async () =>
      configWebhook({ enabled: false, events: [], byEvents: false, hasAuthHeader: false }),
    );
    providerFake = { initialize: initializeMock, getWebhookConfig: getWebhookConfigMock };

    const r = await lerWebhookDoCanal(CANAL, SUPABASE);

    expect(r.saudavel).toBe(false);
    expect(r.config?.url).toBe(r.urlEsperada); // a URL estava certa o tempo todo
  });

  it.each([
    ['desabilitado', { enabled: false }],
    ['sem eventos assinados', { events: [] }],
    ['sem header x-api-key (Edge Function é default-deny)', { hasAuthHeader: false }],
    ['apontando pra outro canal', { url: `${SUPABASE}/functions/v1/messaging-webhook-evolution/outro` }],
  ])('sozinho já derruba a saúde: %s', async (_nome, over) => {
    getWebhookConfigMock = vi.fn(async () => configWebhook(over));
    providerFake = { initialize: initializeMock, getWebhookConfig: getWebhookConfigMock };

    const r = await lerWebhookDoCanal(CANAL, SUPABASE);

    expect(r.saudavel).toBe(false);
  });

  it('provider que não expõe leitura de webhook não é reportado como doente', async () => {
    providerFake = { initialize: initializeMock };

    const r = await lerWebhookDoCanal({ ...CANAL, provider: 'meta-cloud' }, SUPABASE);

    expect(r.suportado).toBe(false);
    expect(r.saudavel).toBe(false);
  });

  it('erro ao ler não vira "saudável" e sai redigido', async () => {
    getWebhookConfigMock = vi.fn(async () => {
      throw new Error(`500 apikey=${SEGREDO_FALSO} rejected`);
    });
    providerFake = { initialize: initializeMock, getWebhookConfig: getWebhookConfigMock };

    const r = await lerWebhookDoCanal(CANAL, SUPABASE);

    expect(r.saudavel).toBe(false);
    expect(r.motivo).not.toContain(SEGREDO_FALSO);
    expect(r.motivo).toContain('[REDACTED]');
  });
});
